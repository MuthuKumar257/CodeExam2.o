import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

// Default academic data
export const defaultClasses = [
  { id: 'cls-01', name: 'CSE - 3rd Year Section A', code: 'CSE-3A', department: 'Computer Science and Engineering', semester: 6, academic_year: '2025-2026', student_count: 65, created_at: new Date().toISOString() },
  { id: 'cls-02', name: 'CSE - 3rd Year Section B', code: 'CSE-3B', department: 'Computer Science and Engineering', semester: 6, academic_year: '2025-2026', student_count: 62, created_at: new Date().toISOString() },
  { id: 'cls-03', name: 'IT - Final Year Section A', code: 'IT-4A', department: 'Information Technology', semester: 8, academic_year: '2025-2026', student_count: 58, created_at: new Date().toISOString() },
];

export const defaultDepartments = [
  { id: 'dept-01', name: 'Computer Science and Engineering', code: 'CSE', head_of_department: 'Dr. Alan Turing', faculty_count: 24, student_count: 480, created_at: new Date().toISOString() },
  { id: 'dept-02', name: 'Information Technology', code: 'IT', head_of_department: 'Dr. Grace Hopper', faculty_count: 18, student_count: 360, created_at: new Date().toISOString() },
  { id: 'dept-03', name: 'Artificial Intelligence & Data Science', code: 'AIDS', head_of_department: 'Dr. John McCarthy', faculty_count: 16, student_count: 240, created_at: new Date().toISOString() },
];

export const defaultInstitutions = [
  { id: 'inst-01', name: 'CodeExam Institute of Technology', code: 'CEIT', location: 'Coimbatore, Tamil Nadu', domain: 'codeexam.edu', established_year: 1997, created_at: new Date().toISOString() },
];

// Initialize in memoryStore if not present
if (!memoryStore.classes) memoryStore.classes = [...defaultClasses];
if (!memoryStore.departments) memoryStore.departments = [...defaultDepartments];
if (!memoryStore.institutions) memoryStore.institutions = [...defaultInstitutions];

export class AcademicController {
  // CLASSES
  static async getClasses(req, res, next) {
    try {
      const { page = 1, limit = 50, department } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let list = memoryStore.classes || [];
      if (department) list = list.filter((c) => c.department === department);

      if (isSupabaseConfigured && supabase) {
        try {
          let query = supabase.from('classes').select('*', { count: 'exact' });
          if (department) query = query.eq('department', department);
          const from = (p - 1) * l;
          const to = from + l - 1;
          const { data, count, error } = await query.range(from, to);
          if (!error && Array.isArray(data) && data.length > 0) {
            const total = count ?? data.length;
            return sendPaginated(res, data, { page: p, limit: l, total, hasMore: p * l < total }, 'Classes retrieved.');
          }
        } catch {}
      }

      const total = list.length;
      const paginated = list.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Classes retrieved.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getClassById(req, res, next) {
    try {
      const found = (memoryStore.classes || []).find((c) => c.id === req.params.id);
      if (!found) return sendError(res, 'Class not found.', 404, 'NOT_FOUND');
      return sendSuccess(res, found);
    } catch (err) {
      next(err);
    }
  }

  static async createClass(req, res, next) {
    try {
      const { name, code, department, semester } = req.body;
      if (!name) return sendError(res, 'Class name is required.', 400, 'MISSING_FIELDS');
      const newClass = {
        id: `cls-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        code: code || `CLS-${Date.now().toString().slice(-4)}`,
        department: department || 'Computer Science and Engineering',
        semester: semester || 1,
        student_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!memoryStore.classes) memoryStore.classes = [];
      memoryStore.classes.push(newClass);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('classes').upsert(newClass);
        } catch {}
      }
      return sendSuccess(res, newClass, 'Class created.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateClass(req, res, next) {
    try {
      const classId = req.params.id;
      if (!classId) return sendError(res, 'Class ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.classes) memoryStore.classes = [];
      const idx = memoryStore.classes.findIndex((c) => c.id === classId);
      if (idx === -1) {
        return sendError(res, 'Class not found.', 404, 'NOT_FOUND');
      }
      const updated = {
        ...memoryStore.classes[idx],
        ...req.body,
        id: classId,
        updated_at: new Date().toISOString(),
      };
      memoryStore.classes[idx] = updated;
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('classes').update(updated).eq('id', classId);
        } catch {}
      }
      return sendSuccess(res, updated, 'Class updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteClass(req, res, next) {
    try {
      const classId = req.params.id;
      if (!classId) return sendError(res, 'Class ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.classes) memoryStore.classes = [];
      memoryStore.classes = memoryStore.classes.filter((c) => c.id !== classId);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('classes').delete().eq('id', classId);
        } catch {}
      }

      // Cascade remove classId from users
      if (Array.isArray(memoryStore.users)) {
        for (const u of memoryStore.users) {
          if (Array.isArray(u.classIds) && u.classIds.includes(classId)) {
            u.classIds = u.classIds.filter((cid) => cid !== classId);
            if (isSupabaseConfigured && supabase) {
              try {
                await supabase.from('users').update(u).eq('id', u.id);
              } catch {}
            }
          }
        }
      }

      const { broadcastDatabaseUpdate } = await import('../websocket/testSocket.js');
      broadcastDatabaseUpdate({ table: 'classes', id: classId, action: 'delete' });

      return sendSuccess(res, { id: classId, deleted: true }, 'Class deleted successfully.');
    } catch (err) {
      next(err);
    }
  }

  // DEPARTMENTS
  static async getDepartments(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let list = memoryStore.departments || [];

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, count, error } = await supabase.from('departments').select('*', { count: 'exact' }).range((p - 1) * l, (p - 1) * l + l - 1);
          if (!error && Array.isArray(data) && data.length > 0) {
            const total = count ?? data.length;
            return sendPaginated(res, data, { page: p, limit: l, total, hasMore: p * l < total }, 'Departments retrieved.');
          }
        } catch {}
      }

      const total = list.length;
      const paginated = list.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Departments retrieved.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getDepartmentById(req, res, next) {
    try {
      const found = (memoryStore.departments || []).find((d) => d.id === req.params.id);
      if (!found) return sendError(res, 'Department not found.', 404, 'NOT_FOUND');
      return sendSuccess(res, found);
    } catch (err) {
      next(err);
    }
  }

  static async createDepartment(req, res, next) {
    try {
      const { name, code, head_of_department } = req.body;
      if (!name) return sendError(res, 'Department name is required.', 400, 'MISSING_FIELDS');
      const newDept = {
        id: `dept-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        code: code || `DEPT-${Date.now().toString().slice(-4)}`,
        head_of_department: head_of_department || '',
        faculty_count: 0,
        student_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!memoryStore.departments) memoryStore.departments = [];
      memoryStore.departments.push(newDept);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('departments').upsert(newDept);
        } catch {}
      }
      return sendSuccess(res, newDept, 'Department created.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateDepartment(req, res, next) {
    try {
      const deptId = req.params.id;
      if (!deptId) return sendError(res, 'Department ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.departments) memoryStore.departments = [];
      const idx = memoryStore.departments.findIndex((d) => d.id === deptId);
      if (idx === -1) {
        return sendError(res, 'Department not found.', 404, 'NOT_FOUND');
      }
      const updated = {
        ...memoryStore.departments[idx],
        ...req.body,
        id: deptId,
        updated_at: new Date().toISOString(),
      };
      memoryStore.departments[idx] = updated;
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('departments').update(updated).eq('id', deptId);
        } catch {}
      }
      return sendSuccess(res, updated, 'Department updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteDepartment(req, res, next) {
    try {
      const deptId = req.params.id;
      if (!deptId) return sendError(res, 'Department ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.departments) memoryStore.departments = [];
      memoryStore.departments = memoryStore.departments.filter((d) => d.id !== deptId);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('departments').delete().eq('id', deptId);
        } catch {}
      }

      const { broadcastDatabaseUpdate } = await import('../websocket/testSocket.js');
      broadcastDatabaseUpdate({ table: 'departments', id: deptId, action: 'delete' });

      return sendSuccess(res, { id: deptId, deleted: true }, 'Department deleted successfully.');
    } catch (err) {
      next(err);
    }
  }

  // INSTITUTIONS
  static async getInstitutions(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let list = memoryStore.institutions || [];

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, count, error } = await supabase.from('institutions').select('*', { count: 'exact' }).range((p - 1) * l, (p - 1) * l + l - 1);
          if (!error && Array.isArray(data) && data.length > 0) {
            const total = count ?? data.length;
            return sendPaginated(res, data, { page: p, limit: l, total, hasMore: p * l < total }, 'Institutions retrieved.');
          }
        } catch {}
      }

      const total = list.length;
      const paginated = list.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Institutions retrieved.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getInstitutionById(req, res, next) {
    try {
      const found = (memoryStore.institutions || []).find((i) => i.id === req.params.id);
      if (!found) return sendError(res, 'Institution not found.', 404, 'NOT_FOUND');
      return sendSuccess(res, found);
    } catch (err) {
      next(err);
    }
  }

  static async updateInstitution(req, res, next) {
    try {
      const instId = req.params.id;
      if (!instId) return sendError(res, 'Institution ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.institutions) memoryStore.institutions = [];
      const idx = memoryStore.institutions.findIndex((i) => i.id === instId);
      if (idx === -1) {
        return sendError(res, 'Institution not found.', 404, 'NOT_FOUND');
      }
      const updated = {
        ...memoryStore.institutions[idx],
        ...req.body,
        id: instId,
        updated_at: new Date().toISOString(),
      };
      memoryStore.institutions[idx] = updated;
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('institutions').update(updated).eq('id', instId);
        } catch {}
      }
      return sendSuccess(res, updated, 'Institution updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteInstitution(req, res, next) {
    try {
      const instId = req.params.id;
      if (!instId) return sendError(res, 'Institution ID is required.', 400, 'MISSING_FIELDS');
      if (!memoryStore.institutions) memoryStore.institutions = [];
      memoryStore.institutions = memoryStore.institutions.filter((i) => i.id !== instId);

      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('institutions').delete().eq('id', instId);
        } catch {}
      }

      const { broadcastDatabaseUpdate } = await import('../websocket/testSocket.js');
      broadcastDatabaseUpdate({ table: 'institutions', id: instId, action: 'delete' });

      return sendSuccess(res, { id: instId, deleted: true }, 'Institution deleted successfully.');
    } catch (err) {
      next(err);
    }
  }
}

