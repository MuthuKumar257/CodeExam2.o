import { UserService } from '../services/userService.js';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class StudentController {
  static async getStudents(req, res, next) {
    try {
      const { page = 1, limit = 50, department } = req.query;
      const result = await UserService.listUsers({
        role: 'STUDENT',
        department,
        page,
        limit,
      });
      return sendPaginated(res, result.data, result.pagination, 'Students retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getStudentById(req, res, next) {
    try {
      const student = await UserService.findUserById(req.params.id);
      if (!student || String(student.role).toUpperCase() !== 'STUDENT') {
        return sendError(res, 'Student not found.', 404, 'NOT_FOUND');
      }
      const { password: _, ...safeStudent } = student;
      return sendSuccess(res, safeStudent);
    } catch (err) {
      return sendError(res, 'Unable to fetch student from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async createStudent(req, res, next) {
    try {
      const { email, name, password, register_number, department, institution_id } = req.body;
      const created = await UserService.createUser({
        name,
        email,
        password,
        role: 'STUDENT',
        register_number,
        department,
        institution_id,
      });
      return sendSuccess(res, created, 'Student created successfully.', 201);
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

  static async bulkImport(req, res, next) {
    try {
      const studentsList = Array.isArray(req.body) ? req.body : req.body.students || [];
      if (!Array.isArray(studentsList) || studentsList.length === 0) {
        return sendError(res, 'List of students is required for bulk import.', 400, 'MISSING_STUDENTS_LIST');
      }
      const result = await UserService.bulkImportStudents(studentsList);
      return sendSuccess(res, result, 'Bulk student import processed.', 200);
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
