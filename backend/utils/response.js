export function sendSuccess(res, data = {}, message = null, statusCode = 200) {
  const payload = {
    success: true,
    data,
    message: message || 'Request successful',
  };
  return res.status(statusCode).json(payload);
}

export function sendPaginated(res, data = [], pagination = {}, message = null, statusCode = 200) {
  const page = Math.max(1, Number(pagination.page || 1));
  const limit = Math.max(1, Number(pagination.limit || data.length || 50));
  const total = Number(pagination.total !== undefined ? pagination.total : data.length);
  const hasMore = Boolean(pagination.hasMore !== undefined ? pagination.hasMore : page * limit < total);

  const payload = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      hasMore,
    },
    message: message || 'Request successful',
  };
  return res.status(statusCode).json(payload);
}

export function sendError(res, message = 'An error occurred', statusCode = 400, errorCode = 'BAD_REQUEST', requestId) {
  return res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    error: {
      code: errorCode,
      message,
    },
    ...(requestId ? { requestId } : {}),
  });
}
