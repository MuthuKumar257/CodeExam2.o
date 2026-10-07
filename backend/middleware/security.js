const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again shortly.',
      errorCode: 'RATE_LIMITED',
      requestId: req.requestId,
    });
  }
  return next();
}
