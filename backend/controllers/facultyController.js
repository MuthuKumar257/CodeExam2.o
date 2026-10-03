import bcrypt from 'bcryptjs';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class FacultyController {
  static async getFaculty(req, res, next) {
    try {
      const faculty = memoryStore.users
        .filter((u) => u.role === 'FACULTY')
        .map(({ password: _, ...f }) => f);
      return sendSuccess(res, faculty);
    } catch (err) {
      next(err);
    }
  }

  static async getFacultyById(req, res, next) {
    try {
      const faculty = memoryStore.users.find((u) => u.id === req.params.id && u.role === 'FACULTY');
      if (!faculty) {
        return sendError(res, 'Faculty member not found.', 404, 'NOT_FOUND');
      }
      const { password: _, ...safeFaculty } = faculty;
      return sendSuccess(res, safeFaculty);
    } catch (err) {
      next(err);
    }
  }

  static async createFaculty(req, res, next) {
    try {
      const { email, name, password, department } = req.body;
      if (!email || !name) {
        return sendError(res, 'Email and name are required.', 400, 'MISSING_FIELDS');
      }

      const existing = memoryStore.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return sendError(res, 'User with this email already exists.', 409, 'USER_EXISTS');
      }

      const hashedPassword = await bcrypt.hash(password || 'Faculty@123', 10);
      const newFaculty = {
        id: `usr-faculty-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        email,
        password: hashedPassword,
        role: 'FACULTY',
        department: department || 'Computer Science & Engineering',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      memoryStore.users.push(newFaculty);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').upsert(newFaculty);
        } catch {}
      }

      const { password: _, ...safeFaculty } = newFaculty;
      return sendSuccess(res, safeFaculty, 'Faculty member created.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateFaculty(req, res, next) {
    try {
      const index = memoryStore.users.findIndex((u) => u.id === req.params.id && u.role === 'FACULTY');
      if (index === -1) {
        return sendError(res, 'Faculty member not found.', 404, 'NOT_FOUND');
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
