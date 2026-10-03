import { sendError } from '../utils/response.js';

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', 401, 'UNAUTHORIZED');
    }

    const userRole = (req.user.role || 'STUDENT').toUpperCase();
    const upperAllowed = allowedRoles.map((r) => r.toUpperCase());

    if (!upperAllowed.includes(userRole)) {
      return sendError(
        res,
        `Access denied. Role ${userRole} is not authorized for this resource.`,
        403,
        'FORBIDDEN'
      );
    }

    next();
  };
}
