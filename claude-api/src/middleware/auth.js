/**
 * Bearer token authentication middleware.
 * Validates requests against API_SECRET env var.
 */
export function requireAuth(req, res, next) {
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret || apiSecret === 'change-me-to-a-secure-random-string') {
    return res.status(500).json({ error: 'API_SECRET not configured on server' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  if (token !== apiSecret) {
    return res.status(403).json({ error: 'Invalid API secret' });
  }

  next();
}
