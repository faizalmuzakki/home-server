import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { requireAuth } from './middleware/auth.js';
import promptRoutes from './routes/prompt.js';

dotenv.config();

// Fail fast if the Claude Code CLI can't authenticate. Without these checks
// the container stays "up" but every prompt returns 500 because the CLI boots
// with an auth stub. See claude-api/docker-compose.yml for the matching volume
// mounts.
function verifyClaudeAuth() {
  const home = process.env.HOME || '/home/claude';
  const configPath = path.join(home, '.claude.json');
  const credsPath = path.join(home, '.claude', '.credentials.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`${configPath} missing — mount host ~/.claude.json into the container`);
  }
  if (!fs.existsSync(credsPath)) {
    throw new Error(`${credsPath} missing — mount host ~/.claude into the container`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`${configPath} is not valid JSON: ${err.message}`);
  }
  if (!config.oauthAccount) {
    throw new Error(`${configPath} has no oauthAccount — run \`claude login\` on the host and restart`);
  }
}

try {
  verifyClaudeAuth();
} catch (err) {
  console.error('Claude auth check failed:', err.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3100;

app.set('trust proxy', 1);

app.use(helmet());

// Rate limiting - Claude Code calls are expensive
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/prompt', requireAuth, apiLimiter, promptRoutes);

// Health check (no auth required, for monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude API running on port ${PORT}`);
});

export default app;
