import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorMiddleware(err, req, res, next) {
  if (res.headersSent) return next(err);
  logger.error(`[${req.requestId || 'NO_REQUEST_ID'}] [${req.method}] ${req.url} error:`, err);

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;
  const message = isServerError ? 'Internal server error.' : err.message || 'Request failed.';
  const errorCode = isServerError ? 'INTERNAL_SERVER_ERROR' : err.errorCode || err.code || 'REQUEST_FAILED';

  return sendError(res, message, statusCode, errorCode, req.requestId);
}
