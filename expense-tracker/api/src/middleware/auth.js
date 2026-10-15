import crypto from 'crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Read per call so a missing secret fails closed (503) instead of signing with ''.
const secret = () => process.env.API_AUTH_SECRET || '';

const sign = (exp) => crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Stateless dashboard session: "<expiryMs>.<hmac>". Rotating API_AUTH_SECRET revokes every token.
export function issueToken(now = Date.now()) {
  const exp = now + TOKEN_TTL_MS;
  return `${exp}.${sign(exp)}`;
}

export function isValidToken(token, now = Date.now()) {
  const [exp, sig] = String(token || '').split('.');
  return Number(exp) > now && safeEqual(sig || '', sign(exp));
}

// Dashboard sends "Authorization: Bearer <token>"; the WhatsApp bot and palu-gada-bot
// send "X-Api-Key: <API_AUTH_SECRET>". <img> tags can't set headers, so /uploads
// also accepts ?token=.
export function requireAuth(req, res, next) {
  if (!secret()) return res.status(503).json({ error: 'Auth not configured' });

  const key = req.get('x-api-key');
  if (key && safeEqual(key, secret())) return next();

  const bearer = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer || (req.baseUrl === '/uploads' ? req.query.token : null);
  if (token && isValidToken(token)) return next();

  res.status(401).json({ error: 'Unauthorized' });
}
