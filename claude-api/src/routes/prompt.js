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
    return res.status(429).json({ error: 'Too many concurrent requests. Try again later.' });
  }

  const sessionId = randomUUID();
  activeSessions.set(sessionId, Date.now());

  try {
    const result = await runClaude({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns });
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
    return res.status(429).json({ error: 'Too many concurrent requests. Try again later.' });
  }

  const sessionId = randomUUID();
  activeSessions.set(sessionId, Date.now());

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Session-Id': sessionId,
  });

  res.write(`data: ${JSON.stringify({ type: 'start', id: sessionId })}\n\n`);

  try {
    const args = buildArgs({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns, outputFormat: 'stream-json' });
    const proc = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      cwd: workdir || '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        res.write(`data: ${line}\n\n`);
      }
    });

    proc.stderr.on('data', (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: chunk.toString() })}\n\n`);
    });

    proc.on('close', (code) => {
      res.write(`data: ${JSON.stringify({ type: 'done', exit_code: code })}\n\n`);
      res.end();
      activeSessions.delete(sessionId);
    });

    req.on('close', () => {
      proc.kill('SIGTERM');
      activeSessions.delete(sessionId);
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
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

function buildArgs({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns, outputFormat = 'json' }) {
  const args = ['-p', prompt, '--output-format', outputFormat];

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }

  const resolvedModel = model || process.env.CLAUDE_MODEL;
  if (resolvedModel) {
    args.push('--model', resolvedModel);
  }

  const resolvedMaxTurns = maxTurns || parseInt(process.env.MAX_TURNS || '10', 10);
  args.push('--max-turns', String(resolvedMaxTurns));

  if (allowedTools && Array.isArray(allowedTools)) {
    for (const tool of allowedTools) {
      args.push('--allowedTools', tool);
    }
  }

  return args;
}

function runClaude({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns }) {
  return new Promise((resolve, reject) => {
    const args = buildArgs({ prompt, systemPrompt, workdir, allowedTools, model, maxTurns });
    const proc = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
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
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch { /* not JSON */ }

      // CLI OAuth auth failure (expired Max-subscription token, etc.) surfaces
      // as is_error with api_error_status 401/403. Fall back to ANTHROPIC_API_KEY
      // so the service keeps working until the host re-logs in.
      if (parsed && parsed.is_error && [401, 403].includes(parsed.api_error_status)) {
        if (!anthropic) {
          return reject(new Error(`Claude CLI auth failed (${parsed.api_error_status}) and ANTHROPIC_API_KEY is not set: ${parsed.result || 'no detail'}`));
        }
        try {
          const fallback = await runAnthropicFallback({ prompt, systemPrompt, model });
          return resolve(fallback);
        } catch (fallbackErr) {
          return reject(new Error(`CLI auth failed (${parsed.api_error_status}) and API-key fallback failed: ${fallbackErr.message}`));
        }
      }

      if (code !== 0) {
        return reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
      }
      resolve(parsed ?? stdout.trim());
    });

    proc.on('error', reject);
  });
}

// Minimal fallback: single-turn Messages API call using ANTHROPIC_API_KEY. Loses
// CLI-only features (allowedTools, multi-turn), which none of the current
// callers (parse-text, whatsapp-bot ai.js) rely on.
async function runAnthropicFallback({ prompt, systemPrompt, model }) {
  const resolvedModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
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
