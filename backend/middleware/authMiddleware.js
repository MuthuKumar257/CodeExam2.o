import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { memoryStore, isSupabaseConfigured, supabase } from '../services/supabaseService.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

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

export async function authenticate(req, res, next) {
  const token = getBearerToken(req);
  const isHeartbeatRoute = req.path.endsWith('/heartbeat');

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error: sbErr } = await supabase.auth.getUser(token);
          if (!sbErr && data?.user) {
            req.user = {
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.email,
              role: (data.user.user_metadata?.role || data.user.app_metadata?.role || 'STUDENT').toUpperCase(),
            };
            return next();
          }
        } catch {}
      }

      if (req.path.endsWith('/heartbeat')) {
        logger.warn(`[${req.requestId || 'NO_REQUEST_ID'}] Heartbeat auth rejected: ${err.name === 'TokenExpiredError' ? 'expired_token' : 'invalid_token'}.`);
      }
      return sendError(res, 'Invalid or expired token.', 401, 'INVALID_TOKEN', req.requestId);
    }
  }

  // Heartbeats always require the signed application JWT, including local
  // development. A caller-supplied x-user-id cannot establish session ownership.
  const devUser = isHeartbeatRoute ? null : getDevHeaderUser(req);
  if (devUser) {
    req.user = {
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      role: (devUser.role || 'STUDENT').toUpperCase(),
    };
    return next();
  }

  if (isHeartbeatRoute) {
    const reason = req.headers.authorization ? 'malformed_bearer_header' : 'missing_bearer_token';
    logger.warn(`[${req.requestId || 'NO_REQUEST_ID'}] Heartbeat auth rejected: ${reason}.`);
  }

  return sendError(
    res,
    allowDevHeaderAuth ? 'Authentication required.' : 'A valid bearer token is required.',
    401,
    'UNAUTHORIZED',
    req.requestId
  );
}

export async function optionalAuthenticate(req, res, next) {
  const token = getBearerToken(req);

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getUser(token);
          if (data?.user) {
            req.user = {
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.name || data.user.email,
              role: (data.user.user_metadata?.role || data.user.app_metadata?.role || 'STUDENT').toUpperCase(),
            };
            return next();
          }
        } catch {}
      }
    }
  }

  const devUser = getDevHeaderUser(req);
  if (devUser) {
    req.user = devUser;
    return next();
  }

  next();
}

export function isStudentRole(role) {
  if (!role || typeof role !== 'string') return false;
  const r = role.toUpperCase();
  return r === 'STUDENT' || r === 'CANDIDATE';
}

export function isStudentUser(user) {
  return isStudentRole(user?.role);
}
