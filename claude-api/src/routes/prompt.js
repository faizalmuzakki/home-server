import { Router } from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// Track active sessions for concurrency limiting
const activeSessions = new Map();
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * POST /api/prompt
 * Send a prompt to Claude Code and get a JSON response.
 *
 * Body: { prompt: string, systemPrompt?: string, workdir?: string, allowedTools?: string[], model?: string, maxTurns?: number }
 * Response: { id, result, duration_ms }
 */
router.post('/', async (req, res) => {
  const { prompt, systemPrompt, workdir, allowedTools, model, maxTurns } = req.body;

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
    const result = await runClaude({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns, sessionId, requestId: req.id });
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
 * Body: { prompt: string, systemPrompt?: string, workdir?: string, allowedTools?: string[], model?: string, maxTurns?: number }
 */
router.post('/stream', async (req, res) => {
  const { prompt, systemPrompt, workdir, allowedTools, model, maxTurns } = req.body;

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
    const args = buildArgs({ prompt, systemPrompt, allowedTools, model, maxTurns, outputFormat: 'stream-json' });
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

function buildArgs({ prompt, systemPrompt, allowedTools, model, maxTurns, outputFormat = 'json' }) {
  const args = ['-p', prompt, '--output-format', outputFormat];

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

  args.push('--max-turns', String(resolveMaxTurns(maxTurns)));

  if (allowedTools && Array.isArray(allowedTools)) {
    for (const tool of allowedTools) {
      args.push('--allowedTools', tool);
    }
  }

  return args;
}

function runClaude({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns, sessionId, requestId }) {
  return new Promise((resolve, reject) => {
    const resolvedModel = resolveModel(model);
    const resolvedMaxTurns = resolveMaxTurns(maxTurns);
    const args = buildArgs({ prompt, systemPrompt, allowedTools, model, maxTurns });
    const startedAt = Date.now();

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
        num_turns: parsed?.num_turns ?? null,
        stdout_bytes: stdout.length,
        stdout_parsed: parsed !== null,
        stderr: stripAdvisories(stderr) || null,
        advisories: advisoryLines(stderr),
      };

      // CLI errors the ANTHROPIC_API_KEY path may recover from: OAuth auth
      // failures (401/403, expired Max-subscription token) and model-not-found
      // (404, e.g. a stale CLAUDE_MODEL the subscription can't reach but the API
      // key can). Fall back to ANTHROPIC_API_KEY so the service keeps working.
      if (parsed && parsed.is_error && [401, 403, 404].includes(parsed.api_error_status)) {
        if (!anthropic) {
          log('error', { event: 'cli_failed', reason: 'auth_no_fallback', ...diagnostics });
          return reject(new Error(`Claude CLI auth failed (${parsed.api_error_status}) and ANTHROPIC_API_KEY is not set: ${parsed.result || 'no detail'}`));
        }
        log('warn', { event: 'cli_fallback', reason: `api_${parsed.api_error_status}`, ...diagnostics });
        try {
          const fallback = await runAnthropicFallback({ prompt, systemPrompt, model });
          log('info', { event: 'fallback_ok', session_id: sessionId, request_id: requestId, duration_ms: Date.now() - startedAt });
          return resolve(fallback);
        } catch (fallbackErr) {
          log('error', { event: 'fallback_failed', error: fallbackErr.message, ...diagnostics });
          return reject(new Error(`CLI auth failed (${parsed.api_error_status}) and API-key fallback failed: ${fallbackErr.message}`));
        }
      }

      if (code !== 0) {
        const detail = describeFailure({ parsed, stderr, code, maxTurns: resolvedMaxTurns });
        const statusTag = parsed?.api_error_status ? ` (api ${parsed.api_error_status})` : '';
        log('error', { event: 'cli_failed', detail, ...diagnostics });
        return reject(new Error(`Claude CLI failed${statusTag}: ${detail}`));
      }

      log('info', { event: 'cli_done', session_id: sessionId, request_id: requestId, duration_ms: duration, model: resolvedModel, num_turns: parsed?.num_turns ?? null, cost_usd: parsed?.total_cost_usd ?? null });
      resolve(parsed ?? stdout.trim());
    });

    proc.on('error', (err) => {
      log('error', { event: 'cli_spawn_failed', session_id: sessionId, request_id: requestId, error: err.message });
      reject(err);
    });
  });
}

// Minimal fallback: single-turn Messages API call using ANTHROPIC_API_KEY. Loses
// CLI-only features (allowedTools, multi-turn), which none of the current
// callers (parse-text, whatsapp-bot ai.js) rely on.
async function runAnthropicFallback({ prompt, systemPrompt, model }) {
  const resolvedModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-5';
  const resp = await anthropic.messages.create({
    model: resolvedModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: text,
    via: 'anthropic-api-fallback',
    usage: resp.usage,
  };
}

export default router;
