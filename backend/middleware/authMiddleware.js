import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { memoryStore } from '../services/supabaseService.js';
import { sendError } from '../utils/response.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured before starting the backend.');
}
const allowDevHeaderAuth = process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_DEV_AUTH !== 'false';

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function getDevHeaderUser(req) {
  if (!allowDevHeaderAuth) return null;
  const customUserId = req.headers['x-user-id'];
  if (typeof customUserId !== 'string' || !customUserId.trim()) return null;
  const customUserRole = req.headers['x-user-role'];
  const user = memoryStore.users.find((candidate) => candidate.id === customUserId);
  return user || {
    id: customUserId,
    email: 'user@codeexam.edu',
    name: 'User',
    role: typeof customUserRole === 'string' ? customUserRole.toUpperCase() : 'STUDENT',
  };
}

export function authenticate(req, res, next) {
  const token = getBearerToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return sendError(res, 'Invalid or expired token.', 401, 'INVALID_TOKEN', req.requestId);
    }
  }

  const devUser = getDevHeaderUser(req);
  if (devUser) {
    req.user = {
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      role: (devUser.role || 'STUDENT').toUpperCase(),
    };
    return next();
  }

  return sendError(
    res,
    allowDevHeaderAuth ? 'Authentication required.' : 'A valid bearer token is required.',
    401,
    'UNAUTHORIZED',
    req.requestId
  );
}

export function optionalAuthenticate(req, res, next) {
  const token = getBearerToken(req);

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch {}
  }

  const devUser = getDevHeaderUser(req);
  if (devUser) {
    req.user = devUser;
    return next();
  }

  next();
}
