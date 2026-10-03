export function sendSuccess(res, data = {}, message = null, statusCode = 200) {
  const payload = {
    success: true,
    data,
  };
  if (message) {
    payload.message = message;
  }
  return res.status(statusCode).json(payload);
}

export function sendError(res, message = 'An error occurred', statusCode = 400, errorCode = 'BAD_REQUEST') {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
}
