import { Router } from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const router = Router();

// Track active sessions for concurrency limiting
const activeSessions = new Map();
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);

// Cooldown timestamp after hitting a quota or weekly/session limit (429).
// Bypasses the 6-14s Claude CLI boot penalty on bursty requests while rate-limited.
let quotaCooldownUntil = 0;
const QUOTA_COOLDOWN_MS = parseInt(process.env.LIMIT_COOLDOWN_MS || '300000', 10); // 5 min default

export function resetQuotaCooldown() {
  quotaCooldownUntil = 0;
}

export function getQuotaCooldownUntil() {
  return quotaCooldownUntil;
}

/**
 * POST /api/prompt
 * Send a prompt to Claude Code and get a JSON response.
 *
 * Body: { prompt: string, systemPrompt?: string, workdir?: string, allowedTools?: string[], model?: string, effort?: string, maxTurns?: number }
 * Response: { id, result, duration_ms }
 */
router.post('/', async (req, res) => {
  const { prompt, systemPrompt, workdir, allowedTools, model, effort, maxTurns } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }

  if (activeSessions.size >= MAX_CONCURRENT) {
    log('warn', { event: 'rejected', reason: 'max_concurrent', active: activeSessions.size, max: MAX_CONCURRENT, request_id: req.id });
    return res.status(429).json({ error: 'Too many concurrent requests. Try again later.' });
  }

  const sessionId = randomUUID();
  activeSessions.set(sessionId, Date.now());

  try {
    const result = await runClaude({ prompt, systemPrompt, workdir, allowedTools, model, effort, maxTurns, sessionId, requestId: req.id });
    res.json({ id: sessionId, result, duration_ms: Date.now() - activeSessions.get(sessionId) });
  } catch (err) {
    res.status(500).json({ id: sessionId, error: err.message });
  } finally {
    activeSessions.delete(sessionId);
  }
});

/**
 * POST /api/prompt/stream
 * Send a prompt to Claude Code and stream the response as SSE.
 *
 * Body: { prompt: string, systemPrompt?: string, workdir?: string, allowedTools?: string[], model?: string, effort?: string, maxTurns?: number }
 */
router.post('/stream', async (req, res) => {
  const { prompt, systemPrompt, workdir, allowedTools, model, effort, maxTurns } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }

  if (activeSessions.size >= MAX_CONCURRENT) {
    log('warn', { event: 'rejected', reason: 'max_concurrent', active: activeSessions.size, max: MAX_CONCURRENT, request_id: req.id });
    return res.status(429).json({ error: 'Too many concurrent requests. Try again later.' });
  }

  const sessionId = randomUUID();
  const startedAt = Date.now();
  activeSessions.set(sessionId, startedAt);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Session-Id': sessionId,
  });

  res.write(`data: ${JSON.stringify({ type: 'start', id: sessionId })}\n\n`);

  let proc = null;

  res.on('close', () => {
    if (!res.writableEnded) {
      if (proc) {
        try { proc.kill('SIGTERM'); } catch {}
      }
      log('warn', { event: 'stream_aborted', session_id: sessionId, request_id: req.id, duration_ms: Date.now() - startedAt });
      activeSessions.delete(sessionId);
    }
  });

  try {
    const resolvedModel = resolveModel(model);
    const resolvedMaxTurns = resolveMaxTurns(maxTurns);
    const args = buildArgs({ prompt, systemPrompt, allowedTools, model, effort, maxTurns, outputFormat: 'stream-json' });
    log('info', { event: 'cli_start', mode: 'stream', session_id: sessionId, request_id: req.id, model: resolvedModel, max_turns: resolvedMaxTurns, prompt_chars: prompt.length });

    proc = spawn('claude', args, {
      env: cliEnv(),
      cwd: workdir || '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        res.write(`data: ${line}\n\n`);
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Advisory lines are noise on every run; don't surface them as errors.
      const real = stripAdvisories(text);
      if (real) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: real })}\n\n`);
      }
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startedAt;
      if (code === 0) {
        log('info', { event: 'cli_done', mode: 'stream', session_id: sessionId, request_id: req.id, exit_code: code, duration_ms: duration });
      } else {
        log('error', {
          event: 'cli_failed',
          mode: 'stream',
          session_id: sessionId,
          request_id: req.id,
          exit_code: code,
          duration_ms: duration,
          model: resolvedModel,
          max_turns: resolvedMaxTurns,
          stderr: stripAdvisories(stderr) || null,
          advisories: advisoryLines(stderr),
        });
      }
      res.write(`data: ${JSON.stringify({ type: 'done', exit_code: code })}\n\n`);
      if (!res.writableEnded) {
        res.end();
      }
      activeSessions.delete(sessionId);
    });
  } catch (err) {
    log('error', { event: 'cli_spawn_failed', mode: 'stream', session_id: sessionId, request_id: req.id, error: err.message });
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    if (!res.writableEnded) {
      res.end();
    }
    activeSessions.delete(sessionId);
  }
});

/**
 * GET /api/prompt/active
 * Returns count of active sessions.
 */
router.get('/active', (req, res) => {
  res.json({
    active: activeSessions.size,
    max: MAX_CONCURRENT,
  });
});

function log(level, fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: 'claude-api', ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function resolveModel(model) {
  return model || process.env.CLAUDE_MODEL || null;
}

function resolveMaxTurns(maxTurns) {
  return maxTurns || parseInt(process.env.MAX_TURNS || '10', 10);
}

/**
 * The CLI prints advisory lines (e.g. the claude.ai connectors notice) to stderr
 * on every single run, successes included. Treating stderr as the failure detail
 * therefore masked the real cause of every failure, so drop advisories and keep
 * only genuine stderr output.
 */
function stripAdvisories(stderr) {
  return (stderr || '')
    .split('\n')
    .filter(line => line.trim() && !line.trimStart().startsWith('⚠'))
    .join('\n')
    .trim();
}

function advisoryLines(stderr) {
  const lines = (stderr || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('⚠'));
  return lines.length ? lines : null;
}

/**
 * ANTHROPIC_API_KEY must not reach the CLI. The CLI prefers it over the mounted
 * claude.ai OAuth login, so leaving it in the environment made every prompt bill
 * the API instead of the subscription (and emitted the connectors advisory on
 * each run). It stays on process.env for runAnthropicFallback.
 */
function cliEnv() {
  const env = { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

/**
 * Build a human-readable failure reason from the CLI's own JSON output, which is
 * where the cause actually lives. `error_max_turns` in particular carries no
 * `result` text, so it needs spelling out.
 */
function describeFailure({ parsed, stderr, code, maxTurns }) {
  const subtype = parsed?.subtype;

  if (subtype === 'error_max_turns') {
    return `hit the ${maxTurns}-turn limit without answering (stop_reason: ${parsed?.stop_reason || 'unknown'}). Raise maxTurns so tool calls can finish.`;
  }

  const real = stripAdvisories(stderr);
  if (real) return real;
  if (parsed?.result) return String(parsed.result);
  if (subtype) return `CLI reported ${subtype}`;
  return `exited with code ${code}`;
}

function buildArgs({ prompt, systemPrompt, allowedTools, model, effort, maxTurns, outputFormat = 'json' }) {
  const args = ['-p', prompt, '--output-format', outputFormat, '--dangerously-skip-permissions'];

  // The CLI rejects stream-json without --verbose ("When using --print,
  // --output-format=stream-json requires --verbose"), so /api/prompt/stream
  // failed on every call until the new diagnostics surfaced it.
  if (outputFormat === 'stream-json') {
    args.push('--verbose');
  }

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  const resolvedModel = resolveModel(model);
  if (resolvedModel) {
    args.push('--model', resolvedModel);
  }

  const resolvedEffort = effort || process.env.DEFAULT_EFFORT || 'high';
  if (resolvedEffort) {
    args.push('--effort', resolvedEffort);
  }

  args.push('--max-turns', String(resolveMaxTurns(maxTurns)));

  if (allowedTools && Array.isArray(allowedTools)) {
    for (const tool of allowedTools) {
      args.push('--allowedTools', tool);
    }
  }

  return args;
}

function runClaude({ prompt, systemPrompt, workdir, allowedTools, model, effort, maxTurns, sessionId, requestId }) {
  return new Promise((resolve, reject) => {
    const resolvedEffort = effort || process.env.DEFAULT_EFFORT || 'high';
    const startedAt = Date.now();

    // If we are in an active quota cooldown (Claude recently 429'd or hit weekly limit),
    // bypass the 6-14s CLI spawn delay and route directly to Antigravity fallback.
    if (Date.now() < quotaCooldownUntil) {
      log('info', { event: 'quota_cooldown_active', session_id: sessionId, request_id: requestId });
      return runAgyFallback({ prompt, systemPrompt, effort: resolvedEffort, workdir, sessionId, requestId, reason: 'quota_cooldown' })
        .then(resolve)
        .catch(reject);
    }

    const resolvedModel = resolveModel(model);
    const resolvedMaxTurns = resolveMaxTurns(maxTurns);
    const args = buildArgs({ prompt, systemPrompt, allowedTools, model, effort: resolvedEffort, maxTurns });

    log('info', { event: 'cli_start', mode: 'json', session_id: sessionId, request_id: requestId, model: resolvedModel, max_turns: resolvedMaxTurns, prompt_chars: prompt.length });

    const proc = spawn('claude', args, {
      env: cliEnv(),
      cwd: workdir || '/tmp',
      // Close stdin — the CLI otherwise prints a "no stdin data received in 3s"
      // warning to stderr and adds a 3s startup delay.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', async (code) => {
      const duration = Date.now() - startedAt;
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch { /* not JSON */ }

      const diagnostics = {
        session_id: sessionId,
        request_id: requestId,
        exit_code: code,
        signal: proc.signalCode || null,
        duration_ms: duration,
        model: resolvedModel,
        max_turns: resolvedMaxTurns,
        prompt_chars: prompt.length,
        subtype: parsed?.subtype || null,
        stop_reason: parsed?.stop_reason || null,
        terminal_reason: parsed?.terminal_reason || null,
        api_error_status: parsed?.api_error_status || null,
        api_error: parsed?.api_error || null,
        num_turns: parsed?.num_turns ?? null,
        stdout_bytes: stdout.length,
        stdout_parsed: parsed !== null,
        stderr: stripAdvisories(stderr) || null,
        advisories: advisoryLines(stderr),
      };

      const fallbackReason = shouldFallbackToAgy({ parsed, stderr, code });
      if (fallbackReason) {
        if (isQuotaReason(fallbackReason)) {
          quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
        }
        log('warn', { event: 'cli_fallback', reason: fallbackReason, ...diagnostics });
        try {
          const fallback = await runAgyFallback({ prompt, systemPrompt, effort: resolvedEffort, workdir, sessionId, requestId, reason: fallbackReason });
          log('info', { event: 'fallback_ok', session_id: sessionId, request_id: requestId, duration_ms: Date.now() - startedAt, via: 'agy', model: fallback.modelUsage ? Object.keys(fallback.modelUsage)[0] : 'gemini' });
          return resolve(fallback);
        } catch (fallbackErr) {
          log('error', { event: 'fallback_failed', error: fallbackErr.message, ...diagnostics });
          return reject(new Error(`Claude CLI failed (${fallbackReason}) and Antigravity fallback failed: ${fallbackErr.message}`));
        }
      }

      if (code !== 0) {
        const detail = describeFailure({ parsed, stderr, code, maxTurns: resolvedMaxTurns });
        const statusTag = parsed?.api_error_status ? ` (api ${parsed.api_error_status})` : '';
        log('error', { event: 'cli_failed', detail, ...diagnostics });
        return reject(new Error(`Claude CLI failed${statusTag}: ${detail}`));
      }

      log('info', { event: 'cli_done', session_id: sessionId, request_id: requestId, duration_ms: duration, model: resolvedModel, num_turns: parsed?.num_turns ?? null, cost_usd: parsed?.total_cost_usd ?? null });
      if (parsed && resolvedEffort) parsed.effort = resolvedEffort;
      resolve(parsed ?? stdout.trim());
    });

    proc.on('error', (err) => {
      log('error', { event: 'cli_spawn_failed', session_id: sessionId, request_id: requestId, error: err.message });
      reject(err);
    });
  });
}

/**
 * Determines whether a failed Claude CLI call should fall back to Antigravity (Gemini).
 * Covers:
 *  - 429: rate limits, session limits, weekly limits
 *  - 401/403: OAuth expired / unauthorized
 *  - 404: model not found
 *  - 529: Anthropic overloaded
 *  - Text match on stderr / result: "You've hit your weekly limit", "usage limit reached", etc.
 */
export function shouldFallbackToAgy({ parsed, stderr, code }) {
  const status = parsed?.api_error_status;
  if (status === 429) return 'api_429';
  if ([401, 403, 404, 529].includes(status)) return `api_${status}`;

  if (parsed?.api_error === 'usage_limit_reached' || parsed?.subtype === 'usage_limit_reached') {
    return 'quota_limit';
  }

  if (parsed?.is_error || code !== 0) {
    const combined = `${parsed?.result || ''}\n${parsed?.error || ''}\n${stripAdvisories(stderr)}`;
    if (/\b(hit your (?:weekly |session )?limit|weekly limit|session limit|usage limit|rate[_ -]?limit|too many requests)\b/i.test(combined)) {
      return 'quota_limit';
    }
  }

  return null;
}

export function isQuotaReason(reason) {
  return reason === 'api_429' || reason === 'quota_limit' || reason === 'quota_cooldown';
}

/**
 * Resolves the Antigravity model and effort tier.
 * Effort defaults to 'high' as configured.
 */
export function resolveFallbackModel(effort) {
  const base = process.env.FALLBACK_MODEL || 'gemini-3.8-flash';
  const rawEffort = String(effort || process.env.DEFAULT_EFFORT || 'high').toLowerCase();
  const tier = ['low', 'medium', 'high'].includes(rawEffort)
    ? rawEffort
    : (['xhigh', 'max'].includes(rawEffort) ? 'high' : 'high');

  // If base already carries a tier suffix (e.g. gpt-oss-120b-medium), preserve it
  const match = base.match(/^(.+)-(low|medium|high)$/);
  if (match) {
    return {
      agyModel: base,
      canonicalModel: match[1],
      effort: match[2],
    };
  }

  return {
    agyModel: `${base}-${tier}`,
    canonicalModel: base,
    effort: tier,
  };
}

/**
 * Safely parses the output from `agy -p ... --output-format json`.
 * Scans the lines in reverse to find the JSON object line even if preceding lines
 * contain tool denial notices or other output.
 */
export function parseAgyJson(stdout) {
  const trimmed = (stdout || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.startsWith('{') && l.endsWith('}'));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Invokes the Antigravity CLI as a fallback engine using Gemini.
 * Enables browsing and web grounding via --dangerously-skip-permissions.
 */
export function runAgyFallback({ prompt, systemPrompt, effort, workdir, sessionId, requestId, reason }) {
  return new Promise((resolve, reject) => {
    const { agyModel, canonicalModel, effort: resolvedEffort } = resolveFallbackModel(effort);
    const agyBin = process.env.AGY_BIN || 'agy';
    const fullPrompt = systemPrompt ? `System instructions: ${systemPrompt}\n\n${prompt}` : prompt;

    // --dangerously-skip-permissions allows tools like search_web, read_url_content, and curl
    // to execute in headless mode without prompting for approvals.
    const args = [
      '-p', fullPrompt,
      '--model', agyModel,
      '--output-format', 'json',
      '--disable-slash-commands',
      '--dangerously-skip-permissions',
      '--print-timeout', '120s',
    ];

    const startedAt = Date.now();
    log('info', {
      event: 'agy_start',
      session_id: sessionId,
      request_id: requestId,
      model: agyModel,
      effort: resolvedEffort,
      reason,
      prompt_chars: fullPrompt.length,
    });

    const proc = spawn(agyBin, args, {
      env: cliEnv(),
      cwd: workdir || '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      const duration = Date.now() - startedAt;
      const parsed = parseAgyJson(stdout);

      if (code !== 0 || !parsed || parsed.status !== 'SUCCESS') {
        const errorDetail = parsed?.error || stripAdvisories(stderr) || (parsed ? `status ${parsed.status}` : `exited with code ${code}`);
        log('error', {
          event: 'agy_failed',
          session_id: sessionId,
          request_id: requestId,
          exit_code: code,
          duration_ms: duration,
          model: agyModel,
          detail: errorDetail,
        });
        return reject(new Error(`Antigravity fallback failed: ${errorDetail}`));
      }

      const text = typeof parsed.response === 'string' ? parsed.response.trim() : '';
      if (!text) {
        const denied = Array.isArray(parsed.denied_actions) && parsed.denied_actions.length
          ? ` (denied actions: ${parsed.denied_actions.map(d => d.action).join(', ')})`
          : '';
        return reject(new Error(`Antigravity fallback produced no text${denied}`));
      }

      const usage = parsed.usage || {};
      const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
      const outputTokens = (typeof usage.output_tokens === 'number' ? usage.output_tokens : 0) +
                           (typeof usage.thinking_tokens === 'number' ? usage.thinking_tokens : 0);
      const cacheReadTokens = typeof usage.cache_read_tokens === 'number' ? usage.cache_read_tokens : 0;

      log('info', {
        event: 'agy_done',
        session_id: sessionId,
        request_id: requestId,
        duration_ms: duration,
        model: canonicalModel,
        effort: resolvedEffort,
        tokens_in: inputTokens,
        tokens_out: outputTokens,
      });

      resolve({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: text,
        fallback: true,
        fallback_reason: reason,
        via: 'agy-fallback',
        effort: resolvedEffort,
        conversation_id: parsed.conversation_id || null,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: cacheReadTokens,
          cache_creation_input_tokens: 0,
        },
        modelUsage: {
          [canonicalModel]: {
            inputTokens,
            outputTokens,
            cacheReadInputTokens: cacheReadTokens,
            cacheCreationInputTokens: 0,
            costUSD: null,
          },
        },
      });
    });

    proc.on('error', (err) => {
      log('error', {
        event: 'agy_spawn_failed',
        session_id: sessionId,
        request_id: requestId,
        error: err.message,
      });
      reject(err);
    });
  });
}

export default router;
