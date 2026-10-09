import bcrypt from 'bcryptjs';
import { UserService } from '../services/userService.js';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import { broadcastDatabaseUpdate } from '../websocket/testSocket.js';
import { logger } from '../utils/logger.js';

export function normalizeRegisterNumber(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function sanitizeUser(user) {
  if (!user) return user;
  const { password: _, ...safeUser } = user;
  const reg = normalizeRegisterNumber(
    safeUser.register_number ?? safeUser.registerNumber ?? safeUser.registerNo ?? safeUser.rollNumber
  );
  return {
    ...safeUser,
    register_number: reg,
    registerNumber: reg,
    registerNo: reg,
  };
}

export class UserController {
  /**
   * List users with optional role & department filtering and pagination
   */
  static async getUsers(req, res, next) {
    try {
      const { role, department, page = 1, limit = 50 } = req.query;
      const result = await UserService.listUsers({ role, department, page, limit });
      const safeData = result.data.map(sanitizeUser);
      return sendPaginated(res, safeData, result.pagination, 'Users retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch users from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  /**
   * Get user by unique ID
   */
  static async getUserById(req, res, next) {
    try {
      const user = await UserService.findUserById(req.params.id);
      if (!user) {
        return sendError(res, 'User not found.', 404, 'NOT_FOUND', req.requestId);
      }
      return sendSuccess(res, sanitizeUser(user));
    } catch (err) {
      return sendError(res, 'Unable to fetch user from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  /**
   * Create a user
   */
  static async createUser(req, res, next) {
    try {
      const { name, email, password, role = 'STUDENT', department, institution_id, ...extra } = req.body;
      const reg = normalizeRegisterNumber(
        req.body.register_number ?? req.body.registerNumber ?? req.body.registerNo
      );

      const created = await UserService.createUser({
        name,
        email,
        password,
        role,
        register_number: reg,
        department,
        institution_id,
        extraFields: {
          registerNumber: reg,
          registerNo: reg,
          ...extra,
        },
      });

      broadcastDatabaseUpdate({ table: 'users', id: created.id, data: sanitizeUser(created), action: 'save' });
      return sendSuccess(res, sanitizeUser(created), 'User created successfully.', 201);
    } catch (err) {
      if (err.errorCode === 'EMAIL_ALREADY_EXISTS') {
        return sendError(res, err.message, 409, 'EMAIL_ALREADY_EXISTS', req.requestId);
      }
      if (err.errorCode === 'MISSING_FIELDS' || err.errorCode === 'INVALID_EMAIL') {
        return sendError(res, err.message, 400, err.errorCode, req.requestId);
      }
      next(err);
    }
  }

  /**
   * Update a user profile
   */
  static async updateUser(req, res, next) {
    try {
      const userId = req.params.id;
      const index = memoryStore.users.findIndex((u) => u.id === userId);
      if (index === -1) {
        return sendError(res, 'User not found.', 404, 'NOT_FOUND', req.requestId);
      }

      const existing = memoryStore.users[index];

      // Check email collision
      if (req.body.email) {
        const normalized = UserService.normalizeEmail(req.body.email);
        const collision = await UserService.findUserByNormalizedEmail(normalized);
        if (collision && collision.id !== userId) {
          return sendError(res, 'This email is already registered to another person.', 409, 'EMAIL_ALREADY_EXISTS', req.requestId);
        }
        req.body.email = normalized;
        req.body.email_normalized = normalized;
      }

      // Registration number preservation
      let regVal = existing.register_number ?? existing.registerNumber ?? existing.registerNo ?? '';
      if (
        req.body.register_number !== undefined ||
        req.body.registerNumber !== undefined ||
        req.body.registerNo !== undefined
      ) {
        regVal = normalizeRegisterNumber(
          req.body.register_number ?? req.body.registerNumber ?? req.body.registerNo
        );
      }

      const updated = {
        ...existing,
        ...req.body,
        id: userId,
        register_number: regVal,
        registerNumber: regVal,
        registerNo: regVal,
        updated_at: new Date().toISOString(),
      };

      memoryStore.users[index] = updated;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').update(updated).eq('id', userId);
        } catch (err) {
          logger.warn('[UserController] Supabase update user error:', err.message);
        }
      }

      const safeUser = sanitizeUser(updated);
      broadcastDatabaseUpdate({ table: 'users', id: userId, data: safeUser, action: 'save' });
      return sendSuccess(res, safeUser, 'User updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete a user across memory, database, and class associations
   */
  static async deleteUser(req, res, next) {
    const requestId = req.requestId || `REQ-${Date.now().toString(36)}`;
    try {
      const userId = req.params.id;
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        return sendError(res, 'A valid User ID is required.', 400, 'MISSING_USER_ID', requestId);
      }

      // 1. Idempotency Check: Was this user already deleted?
      if (!memoryStore.deletedUserIds) {
        memoryStore.deletedUserIds = new Set();
      }
      if (memoryStore.deletedUserIds.has(userId)) {
        logger.info(`[UserController] [${requestId}] User ${userId} already deleted. Returning idempotent success.`);
        return sendSuccess(res, { id: userId, deleted: true, alreadyDeleted: true }, 'User has already been deleted.');
      }

      // 2. Locate user in memoryStore or Supabase
      let index = memoryStore.users.findIndex((u) => u.id === userId);
      let targetUser = index !== -1 ? memoryStore.users[index] : null;

      if (!targetUser && isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
          if (!error && data) {
            targetUser = data.data || data;
          }
        } catch (sbLookupErr) {
          logger.warn(`[UserController] [${requestId}] Supabase lookup before delete notice: ${sbLookupErr?.message}`);
        }
      }

      if (!targetUser) {
        logger.warn(`[UserController] [${requestId}] User ${userId} not found for deletion.`);
        return sendError(res, 'User not found.', 404, 'NOT_FOUND', requestId);
      }

      // 3. Never delete master admin
      if (String(targetUser.role).toUpperCase() === 'ADMIN' && targetUser.id === 'usr-admin') {
        logger.warn(`[UserController] [${requestId}] Master admin deletion attempt rejected.`);
        return sendError(res, 'The master administrator account cannot be deleted.', 403, 'ADMIN_DELETE_FORBIDDEN', requestId);
      }

      // 4. Authorization check: FACULTY can only delete STUDENTS / CANDIDATES
      const requesterRole = String(req.user?.role || '').toUpperCase();
      if (requesterRole === 'FACULTY' && !['STUDENT', 'CANDIDATE'].includes(String(targetUser.role).toUpperCase())) {
        logger.warn(`[UserController] [${requestId}] Unauthorized delete attempt by ${requesterRole} on user ${userId} with role ${targetUser.role}`);
        return sendError(res, 'Faculty members can only delete student accounts.', 403, 'FORBIDDEN', requestId);
      }

      // 5. Remove from memoryStore & mark as deleted tombstone
      if (index !== -1) {
        memoryStore.users.splice(index, 1);
      }
      memoryStore.deletedUserIds.add(userId);

      // 6. Authoritative deletion from Supabase (tables: users, profiles) & Supabase Auth
      if (isSupabaseConfigured && supabase) {
        try {
          const { error: usersDelErr } = await supabase.from('users').delete().eq('id', userId);
          if (usersDelErr && usersDelErr.code !== 'PGRST205') {
            logger.warn(`[UserController] [${requestId}] Supabase delete 'users' error: [${usersDelErr.code}] ${usersDelErr.message}`);
          }
        } catch (err) {
          logger.warn(`[UserController] [${requestId}] Supabase users delete exception: ${err.message}`);
        }

        try {
          const { error: profilesDelErr } = await supabase.from('profiles').delete().eq('id', userId);
          if (profilesDelErr && profilesDelErr.code !== 'PGRST205') {
            logger.warn(`[UserController] [${requestId}] Supabase delete 'profiles' error: [${profilesDelErr.code}] ${profilesDelErr.message}`);
          }
        } catch (err) {
          logger.warn(`[UserController] [${requestId}] Supabase profiles delete exception: ${err.message}`);
        }

        if (supabase.auth?.admin?.deleteUser) {
          try {
            await supabase.auth.admin.deleteUser(userId);
          } catch {}
        }
      }

      // 7. Cascade: clean up user from all classes
      if (Array.isArray(memoryStore.classes)) {
        for (const cls of memoryStore.classes) {
          let modified = false;
          if (Array.isArray(cls.studentIds) && cls.studentIds.includes(userId)) {
            cls.studentIds = cls.studentIds.filter((id) => id !== userId);
            modified = true;
          }
          if (Array.isArray(cls.staffIds) && cls.staffIds.includes(userId)) {
            cls.staffIds = cls.staffIds.filter((id) => id !== userId);
            modified = true;
          }
          if (Array.isArray(cls.facultyIds) && cls.facultyIds.includes(userId)) {
            cls.facultyIds = cls.facultyIds.filter((id) => id !== userId);
            modified = true;
          }
          if (modified && isSupabaseConfigured && supabase) {
            try {
              await supabase.from('classes').update(cls).eq('id', cls.id);
            } catch (clsErr) {
              logger.warn(`[UserController] [${requestId}] Failed to update class ${cls.id}:`, clsErr?.message);
            }
          }
        }
      }

      // 8. Real-time notification & response
      broadcastDatabaseUpdate({ table: 'users', id: userId, action: 'delete' });
      broadcastDatabaseUpdate({ table: 'students', id: userId, action: 'delete' });
      broadcastDatabaseUpdate({ table: 'faculty', id: userId, action: 'delete' });

      logger.info(`[UserController] [${requestId}] User ${userId} (${targetUser.email}) successfully deleted.`);
      return sendSuccess(res, { id: userId, deleted: true }, 'User deleted successfully.');
    } catch (err) {
      logger.error(`[UserController] [${requestId}] Error deleting user: ${err.message}`);
      if (typeof next === 'function') {
        return next(err);
      }
      return sendError(res, err.message, err.statusCode || 500, err.errorCode || 'INTERNAL_ERROR', requestId);
    }
  }

  /**
   * Reset user password
   */
  static async resetPassword(req, res, next) {
    try {
      const userId = req.params.id;
      const index = memoryStore.users.findIndex((u) => u.id === userId);
      if (index === -1) {
        return sendError(res, 'User not found.', 404, 'NOT_FOUND', req.requestId);
      }

      const user = memoryStore.users[index];
      const defaultPass = user.role === 'FACULTY' ? 'Faculty@123' : user.role === 'ADMIN' ? 'Admin@123' : 'Student@123';
      const newPassword = req.body.password || req.body.newPassword || defaultPass;
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      memoryStore.users[index].password = hashedPassword;
      memoryStore.users[index].updated_at = new Date().toISOString();

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('id', userId);
        } catch {}
      }

      return sendSuccess(res, { id: userId, newPassword }, 'Password reset successfully.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update current user's password
   */
  static async updatePassword(req, res, next) {
    try {
      const userId = req.params.id;
      const index = memoryStore.users.findIndex((u) => u.id === userId);
      if (index === -1) {
        return sendError(res, 'User not found.', 404, 'NOT_FOUND', req.requestId);
      }

      const newPassword = req.body.password || req.body.newPassword;
      if (!newPassword || newPassword.length < 6) {
        return sendError(res, 'Password must be at least 6 characters long.', 400, 'INVALID_PASSWORD', req.requestId);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      memoryStore.users[index].password = hashedPassword;
      memoryStore.users[index].updated_at = new Date().toISOString();

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('id', userId);
        } catch {}
      }

      return sendSuccess(res, { id: userId }, 'Password updated successfully.');
    } catch (err) {
      next(err);
    }
  }
}
