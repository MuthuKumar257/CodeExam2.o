import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export function errorMiddleware(err, req, res, next) {
  if (res.headersSent) return next(err);
  logger.error(`[${req.requestId || 'NO_REQUEST_ID'}] [${req.method}] ${req.url} error:`, err);

  const statusCode = getStatusCode(err);
  const isServerError = statusCode >= 500;
  const message = isServerError ? 'Internal server error.' : getClientMessage(err);
  const errorCode = isServerError ? 'INTERNAL_SERVER_ERROR' : getErrorCode(err);

  return sendError(res, message, statusCode, errorCode, req.requestId);
}

function getStatusCode(err) {
  if (err?.type === 'entity.parse.failed') return 400;
  if (err?.name === 'MulterError') return err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  const status = Number(err?.statusCode || err?.status);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function getClientMessage(err) {
  if (err?.type === 'entity.parse.failed') return 'Request body must contain valid JSON.';
  if (err?.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
    return 'Uploaded file exceeds the permitted size.';
  }
  if (err?.name === 'MulterError') return 'Invalid multipart form data.';
  return err?.message || 'Request failed.';
}

function getErrorCode(err) {
  if (err?.type === 'entity.parse.failed') return 'INVALID_JSON';
  if (err?.name === 'MulterError') return err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD';
  return err?.errorCode || 'REQUEST_FAILED';
}
