import { UserService } from '../services/userService.js';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class FacultyController {
  static async getFaculty(req, res, next) {
    try {
      const { page = 1, limit = 50, department } = req.query;
      const result = await UserService.listUsers({
        role: 'FACULTY',
        department,
        page,
        limit,
      });
      return sendPaginated(res, result.data, result.pagination, 'Faculty members retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getFacultyById(req, res, next) {
    try {
      const faculty = await UserService.findUserById(req.params.id);
      if (!faculty || String(faculty.role).toUpperCase() !== 'FACULTY') {
        return sendError(res, 'Faculty member not found.', 404, 'NOT_FOUND');
      }
      const { password: _, ...safeFaculty } = faculty;
      return sendSuccess(res, safeFaculty);
    } catch (err) {
      return sendError(res, 'Unable to fetch faculty member from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async createFaculty(req, res, next) {
    try {
      const { email, name, password, department, institution_id } = req.body;
      const created = await UserService.createUser({
        name,
        email,
        password,
        role: 'FACULTY',
        department,
        institution_id,
      });
      return sendSuccess(res, created, 'Faculty member created.', 201);
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

  static async updateFaculty(req, res, next) {
    try {
      const index = memoryStore.users.findIndex((u) => u.id === req.params.id && u.role === 'FACULTY');
      if (index === -1) {
        return sendError(res, 'Faculty member not found.', 404, 'NOT_FOUND');
      }

      // If email is being updated, verify it doesn't collide with existing user
      if (req.body.email) {
        const normalized = UserService.normalizeEmail(req.body.email);
        const existing = await UserService.findUserByNormalizedEmail(normalized);
        if (existing && existing.id !== req.params.id) {
          return sendError(res, 'This email is already registered to another person.', 409, 'EMAIL_ALREADY_EXISTS');
        }
        req.body.email = normalized;
        req.body.email_normalized = normalized;
      }

      const updated = {
        ...memoryStore.users[index],
        ...req.body,
        id: req.params.id,
        role: 'FACULTY',
        updated_at: new Date().toISOString(),
      };

      memoryStore.users[index] = updated;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').update(updated).eq('id', req.params.id);
        } catch {}
      }

      const { password: _, ...safeFaculty } = updated;
      return sendSuccess(res, safeFaculty, 'Faculty updated.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteFaculty(req, res, next) {
    try {
      const index = memoryStore.users.findIndex((u) => u.id === req.params.id && u.role === 'FACULTY');
      if (index === -1) {
        return sendError(res, 'Faculty member not found.', 404, 'NOT_FOUND');
      }

      memoryStore.users.splice(index, 1);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').delete().eq('id', req.params.id);
        } catch {}
      }

      return sendSuccess(res, { id: req.params.id, deleted: true }, 'Faculty member deleted.');
    } catch (err) {
      next(err);
    }
  }
}
