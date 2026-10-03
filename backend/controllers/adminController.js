import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess } from '../utils/response.js';

export class AdminController {
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
      next(err);
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
