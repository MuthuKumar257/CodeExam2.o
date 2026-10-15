const buckets = new Map();
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 3000;
const DB_SAVE_MAX_REQUESTS = Number(process.env.RATE_LIMIT_DB_SAVE_MAX) || 6000;

// Periodic cleanup of expired rate limit buckets every 5 minutes to prevent memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.startedAt > WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
}, 5 * 60_000);
if (cleanupTimer.unref) cleanupTimer.unref();

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function rateLimit(req, res, next) {
  const path = req.path || req.url || '';

  // Always allow root and health check endpoints without rate limiting
  if (path === '/' || path === '/health' || path === '/api/health' || path === '/api/health/database') {
    return next();
  }

  // Determine client identity:
  // 1. Authenticated token (Bearer ...) assigns each logged-in student/faculty their own bucket,
  //    preventing students in the same university lab/NAT IP from throttling each other.
  // 2. Otherwise use client IP (accounting for reverse proxy headers via trust proxy).
  let key;
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    key = `auth:${authHeader.slice(-32)}`;
  } else {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip || req.socket.remoteAddress || 'unknown';
    key = `ip:${ip}`;
  }

  // Higher allowance for high-frequency database persistence & session heartbeats
  const isDbSave = path.startsWith('/api/db/save') || (path.startsWith('/api/sessions/') && path.includes('/heartbeat'));
  const effectiveMax = isDbSave ? DB_SAVE_MAX_REQUESTS : MAX_REQUESTS;

  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return next();
  }

  current.count += 1;
  if (current.count > effectiveMax) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again shortly.',
      errorCode: 'RATE_LIMITED',
      retryAfterSeconds,
      requestId: req.requestId,
    });
  }
  return next();
}
