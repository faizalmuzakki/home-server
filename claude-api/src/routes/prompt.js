import { Router } from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

const router = Router();

// Track active sessions for concurrency limiting
const activeSessions = new Map();
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);

/**
 * POST /api/prompt
 * Send a prompt to Claude Code and get a JSON response.
 *
 * Body: { prompt: string, workdir?: string, allowedTools?: string[], model?: string, maxTurns?: number }
 * Response: { id, result, duration_ms }
 */
router.post('/', async (req, res) => {
  const { prompt, workdir, allowedTools, model, maxTurns } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required and must be a string' });
  }

  if (activeSessions.size >= MAX_CONCURRENT) {
    return res.status(429).json({ error: 'Too many concurrent requests. Try again later.' });
  }

  const sessionId = randomUUID();
  activeSessions.set(sessionId, Date.now());

  try {
    const result = await runClaude({ prompt, workdir, allowedTools, model, maxTurns });
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
 * Body: { prompt: string, workdir?: string, allowedTools?: string[], model?: string, maxTurns?: number }
 */
router.post('/stream', async (req, res) => {
  const { prompt, workdir, allowedTools, model, maxTurns } = req.body;

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
    const args = buildArgs({ prompt, workdir, allowedTools, model, maxTurns, outputFormat: 'stream-json' });
    const proc = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      cwd: workdir || '/tmp',
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

function buildArgs({ prompt, workdir, allowedTools, model, maxTurns, outputFormat = 'json' }) {
  const args = ['-p', prompt, '--output-format', outputFormat];

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

function runClaude({ prompt, workdir, allowedTools, model, maxTurns }) {
  return new Promise((resolve, reject) => {
    const args = buildArgs({ prompt, workdir, allowedTools, model, maxTurns });
    const proc = spawn('claude', args, {
      env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      cwd: workdir || '/tmp',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `Claude exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout.trim());
      }
    });

    proc.on('error', reject);
  });
}

export default router;
