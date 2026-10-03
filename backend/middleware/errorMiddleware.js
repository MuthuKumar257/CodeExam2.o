import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorMiddleware(err, req, res, next) {
  logger.error(`[${req.method}] ${req.url} error:`, err.message || err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error occurred.';
  const errorCode = err.errorCode || err.code || 'INTERNAL_ERROR';

  return sendError(res, message, statusCode, errorCode);
}
