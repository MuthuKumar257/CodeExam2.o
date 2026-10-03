import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { memoryStore } from '../services/supabaseService.js';
import { sendError } from '../utils/response.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured before starting the backend.');
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // Header-based identity fallback (e.g. x-user-id) for local resilience
  const customUserId = req.headers['x-user-id'];
  const customUserRole = req.headers['x-user-role'];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      // If token invalid but custom header present, fallback
      if (!customUserId) {
        return sendError(res, 'Invalid or expired token.', 401, 'INVALID_TOKEN');
      }
    }
  }

  if (customUserId) {
    const user = memoryStore.users.find((u) => u.id === customUserId);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: (customUserRole || user.role || 'STUDENT').toUpperCase(),
      };
      return next();
    }
    req.user = {
      id: customUserId,
      email: 'user@codeexam.edu',
      name: 'User',
      role: (customUserRole || 'STUDENT').toUpperCase(),
    };
    return next();
  }

  return sendError(res, 'Authentication required.', 401, 'UNAUTHORIZED');
}

export function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const customUserId = req.headers['x-user-id'];
  const customUserRole = req.headers['x-user-role'];

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch {}
  }

  if (customUserId) {
    const user = memoryStore.users.find((u) => u.id === customUserId);
    req.user = user || {
      id: customUserId,
      role: (customUserRole || 'STUDENT').toUpperCase(),
    };
    return next();
  }

  next();
}
