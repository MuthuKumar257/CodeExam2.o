import { UserService } from '../services/userService.js';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class AdminController {
  static async getAdmins(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const result = await UserService.listUsers({ role: 'ADMIN', page, limit });
      return sendPaginated(res, result.data, result.pagination, 'Admins retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async createAdmin(req, res, next) {
    try {
      const { email, name, password, department, institution_id } = req.body;
      const created = await UserService.createUser({
        name,
        email,
        password,
        role: 'ADMIN',
        department: department || 'System Administration',
        institution_id,
      });
      return sendSuccess(res, created, 'Admin created successfully.', 201);
    } catch (err) {
      if (err.errorCode === 'EMAIL_ALREADY_EXISTS') {
        return sendError(res, err.message, 409, 'EMAIL_ALREADY_EXISTS');
      }
      if (err.errorCode === 'MISSING_FIELDS' || err.errorCode === 'INVALID_EMAIL') {
        return sendError(res, err.message, 400, err.errorCode);
      }
      next(err);
    }
  }

  static async getSettings(req, res, next) {
    try {
      let settings = memoryStore.settings;

      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.from('settings').select('*').single();
          if (data) settings = data;
        } catch {}
      }

      return sendSuccess(res, settings);
    } catch (err) {
      return sendError(res, 'Unable to fetch settings from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async updateSettings(req, res, next) {
    try {
      const updated = {
        ...memoryStore.settings,
        ...req.body,
        updated_at: new Date().toISOString(),
      };
      memoryStore.settings = updated;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('settings').upsert(updated);
        } catch {}
      }

      return sendSuccess(res, updated, 'System settings updated.');
    } catch (err) {
      next(err);
    }
  }

  static async getSystemActivity(req, res, next) {
    try {
      const recentSessions = memoryStore.sessions.slice(0, 20);
      const recentSubmissions = memoryStore.submissions.slice(0, 20);

      return sendSuccess(res, {
        recent_sessions: recentSessions,
        recent_submissions: recentSubmissions,
      });
    } catch (err) {
      next(err);
    }
  }
}
