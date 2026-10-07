export function sendSuccess(res, data = {}, message = null, statusCode = 200) {
  const payload = {
    success: true,
    data,
    message: message || 'Request successful',
  };
  return res.status(statusCode).json(payload);
}

export function sendError(res, message = 'An error occurred', statusCode = 400, errorCode = 'BAD_REQUEST', requestId) {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    ...(requestId ? { requestId } : {}),
  });
}
