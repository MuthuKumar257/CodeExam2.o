import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export function requestContext(req, res, next) {
  const requestId = `REQ-${crypto.randomBytes(4).toString('hex')}`;
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    logger.info(
      `${requestId} ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${Date.now() - startedAt}`
    );
  });

  next();
}
