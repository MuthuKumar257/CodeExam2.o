import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export const defaultClasses = [];
export const defaultDepartments = [];
export const defaultInstitutions = [];

// Initialize collections in memoryStore if not initialized
if (!memoryStore.classes) memoryStore.classes = [];
if (!memoryStore.departments) memoryStore.departments = [];
if (!memoryStore.institutions) memoryStore.institutions = [];
if (!memoryStore.deletedClassIds) memoryStore.deletedClassIds = new Set();
if (!memoryStore.deletedDepartmentIds) memoryStore.deletedDepartmentIds = new Set();
if (!memoryStore.deletedInstitutionIds) memoryStore.deletedInstitutionIds = new Set();


function normalizeClassRow(c) {
  if (!c || typeof c !== 'object') return c;
  const inner = c.data && typeof c.data === 'object' ? { ...c.data, ...c } : c;
  const studentIds = Array.isArray(inner.studentIds)
    ? inner.studentIds
    : Array.isArray(inner.student_ids)
    ? inner.student_ids
    : [];
  const staffIds = Array.isArray(inner.staffIds)
    ? inner.staffIds
    : Array.isArray(inner.staff_ids)
    ? inner.staff_ids
    : [];
  const facultyIds = Array.isArray(inner.facultyIds)
    ? inner.facultyIds
    : Array.isArray(inner.faculty_ids)
    ? inner.faculty_ids
    : staffIds;
  return {
    ...inner,
    studentIds,
    student_ids: studentIds,
    staffIds,
    staff_ids: staffIds,
    facultyIds,
    faculty_ids: facultyIds,
    student_count: studentIds.length || Number(inner.student_count || inner.studentCount || 0),
    studentCount: studentIds.length || Number(inner.student_count || inner.studentCount || 0),
  };
}

export class AcademicController {
  // CLASSES
  static async getClasses(req, res, next) {
    try {
      const { page = 1, limit = 50, department } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let list = (memoryStore.classes || []).map(normalizeClassRow).filter((c) => !memoryStore.deletedClassIds?.has(c.id));
      if (department) list = list.filter((c) => c.department === department);

      if (isSupabaseConfigured && supabase) {
        try {
          let query = supabase.from('classes').select('*', { count: 'exact' });
          if (department) query = query.eq('department', department);
          const from = (p - 1) * l;
          const to = from + l - 1;
          const { data, count, error } = await query.range(from, to);
          if (!error && Array.isArray(data) && data.length > 0) {
            const filteredData = data.map(normalizeClassRow).filter((c) => !memoryStore.deletedClassIds?.has(c.id));
            const total = count ?? filteredData.length;
            return sendPaginated(res, filteredData, { page: p, limit: l, total, hasMore: p * l < total }, 'Classes retrieved.');
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
      let found = (memoryStore.classes || []).find((c) => c.id === req.params.id);
      if (!found && isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.from('classes').select('*').eq('id', req.params.id).maybeSingle();
          if (data) found = data;
        } catch {}
      }
      if (!found) return sendError(res, 'Class not found.', 404, 'NOT_FOUND');
      return sendSuccess(res, normalizeClassRow(found));
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

      const sbRow = {
        id: newClass.id,
        name: newClass.name,
        code: newClass.code,
        department: newClass.department,
        semester: newClass.semester,
        student_count: 0,
        data: newClass,
        created_at: newClass.created_at,
        updated_at: newClass.updated_at,
      };
      if (isSupabaseConfigured && supabase) {
        try {
          await supabase.from('classes').upsert(sbRow);
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
          const sbRow = {
            id: classId,
            name: updated.name || '',
            code: updated.code || '',
            department: updated.department || '',
            semester: Number(updated.semester || 1),
            academic_year: updated.academic_year || updated.academicYear || '2025-2026',
            student_count: Number(updated.student_count || updated.studentCount || (updated.student_ids || []).length || 0),
            staff_ids: Array.isArray(updated.staff_ids || updated.staffIds) ? (updated.staff_ids || updated.staffIds) : [],
            faculty_ids: Array.isArray(updated.faculty_ids || updated.facultyIds) ? (updated.faculty_ids || updated.facultyIds) : [],
            student_ids: Array.isArray(updated.student_ids || updated.studentIds) ? (updated.student_ids || updated.studentIds) : [],
            data: updated,
            updated_at: new Date().toISOString(),
          };
          await supabase.from('classes').update(sbRow).eq('id', classId);
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

      if (!memoryStore.deletedClassIds) memoryStore.deletedClassIds = new Set();
      if (memoryStore.deletedClassIds.has(classId)) {
        return sendSuccess(res, { id: classId, deleted: true, alreadyDeleted: true }, 'Class already deleted.');
      }
      memoryStore.deletedClassIds.add(classId);

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

      let list = (memoryStore.departments || []).filter((d) => !memoryStore.deletedDepartmentIds?.has(d.id));

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, count, error } = await supabase.from('departments').select('*', { count: 'exact' }).range((p - 1) * l, (p - 1) * l + l - 1);
          if (!error && Array.isArray(data) && data.length > 0) {
            const filteredData = data.filter((d) => !memoryStore.deletedDepartmentIds?.has(d.id));
            const total = count ?? filteredData.length;
            return sendPaginated(res, filteredData, { page: p, limit: l, total, hasMore: p * l < total }, 'Departments retrieved.');
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

      if (!memoryStore.deletedDepartmentIds) memoryStore.deletedDepartmentIds = new Set();
      if (memoryStore.deletedDepartmentIds.has(deptId)) {
        return sendSuccess(res, { id: deptId, deleted: true, alreadyDeleted: true }, 'Department already deleted.');
      }
      memoryStore.deletedDepartmentIds.add(deptId);

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

      let list = (memoryStore.institutions || []).filter((i) => !memoryStore.deletedInstitutionIds?.has(i.id));

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, count, error } = await supabase.from('institutions').select('*', { count: 'exact' }).range((p - 1) * l, (p - 1) * l + l - 1);
          if (!error && Array.isArray(data) && data.length > 0) {
            const filteredData = data.filter((i) => !memoryStore.deletedInstitutionIds?.has(i.id));
            const total = count ?? filteredData.length;
            return sendPaginated(res, filteredData, { page: p, limit: l, total, hasMore: p * l < total }, 'Institutions retrieved.');
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

      if (!memoryStore.deletedInstitutionIds) memoryStore.deletedInstitutionIds = new Set();
      if (memoryStore.deletedInstitutionIds.has(instId)) {
        return sendSuccess(res, { id: instId, deleted: true, alreadyDeleted: true }, 'Institution already deleted.');
      }
      memoryStore.deletedInstitutionIds.add(instId);

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

