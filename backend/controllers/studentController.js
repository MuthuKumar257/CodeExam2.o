import bcrypt from 'bcryptjs';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class StudentController {
  static async getStudents(req, res, next) {
    try {
      const students = memoryStore.users
        .filter((u) => u.role === 'STUDENT')
        .map(({ password: _, ...s }) => s);
      return sendSuccess(res, students);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentById(req, res, next) {
    try {
      const student = memoryStore.users.find((u) => u.id === req.params.id && u.role === 'STUDENT');
      if (!student) {
        return sendError(res, 'Student not found.', 404, 'NOT_FOUND');
      }
      const { password: _, ...safeStudent } = student;
      return sendSuccess(res, safeStudent);
    } catch (err) {
      next(err);
    }
  }

  static async createStudent(req, res, next) {
    try {
      const { email, name, password, register_number, department } = req.body;
      if (!email || !name) {
        return sendError(res, 'Email and name are required.', 400, 'MISSING_FIELDS');
      }

      const existing = memoryStore.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return sendError(res, 'User with this email already exists.', 409, 'USER_EXISTS');
      }

      const hashedPassword = await bcrypt.hash(password || 'Student@123', 10);
      const newStudent = {
        id: `usr-student-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        email,
        password: hashedPassword,
        role: 'STUDENT',
        register_number: register_number || `REG-${Date.now().toString().slice(-4)}`,
        department: department || 'Computer Science',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      memoryStore.users.push(newStudent);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').upsert(newStudent);
        } catch {}
      }

      const { password: _, ...safeStudent } = newStudent;
      return sendSuccess(res, safeStudent, 'Student created successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateStudent(req, res, next) {
    try {
      const index = memoryStore.users.findIndex((u) => u.id === req.params.id && u.role === 'STUDENT');
      if (index === -1) {
        return sendError(res, 'Student not found.', 404, 'NOT_FOUND');
      }

      const updated = {
        ...memoryStore.users[index],
        ...req.body,
        id: req.params.id,
        role: 'STUDENT',
        updated_at: new Date().toISOString(),
      };

      memoryStore.users[index] = updated;

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').update(updated).eq('id', req.params.id);
        } catch {}
      }

      const { password: _, ...safeStudent } = updated;
      return sendSuccess(res, safeStudent, 'Student updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteStudent(req, res, next) {
    try {
      const index = memoryStore.users.findIndex((u) => u.id === req.params.id && u.role === 'STUDENT');
      if (index === -1) {
        return sendError(res, 'Student not found.', 404, 'NOT_FOUND');
      }

      memoryStore.users.splice(index, 1);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('users').delete().eq('id', req.params.id);
        } catch {}
      }

      return sendSuccess(res, { id: req.params.id, deleted: true }, 'Student deleted.');
    } catch (err) {
      next(err);
    }
  }
}
