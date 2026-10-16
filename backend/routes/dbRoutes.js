import { Router } from 'express';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { broadcastDatabaseUpdate } from '../websocket/testSocket.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { logger } from '../utils/logger.js';

const router = Router();

const TABLE_CONFIG = {
  users: { memoryKey: 'users', supabaseTable: 'users' },
  assessments: { memoryKey: 'tests', supabaseTable: 'assessments' },
  questions: { memoryKey: 'questions', supabaseTable: 'questions' },
  attempts: { memoryKey: 'sessions', supabaseTable: 'attempts' },
  sessions: { memoryKey: 'sessions', supabaseTable: 'attempts' },
  submissions: { memoryKey: 'submissions', supabaseTable: 'submissions' },
  proctoring_events: { memoryKey: 'proctoring_events', supabaseTable: 'attempts' },
  proctoringEvents: { memoryKey: 'proctoring_events', supabaseTable: 'attempts' },
  recordings: { memoryKey: null, supabaseTable: 'recordings' },
};

function resolveTable(table) {
  if (TABLE_CONFIG[table]) return TABLE_CONFIG[table];
  if (table === 'results') return { memoryKey: null, supabaseTable: 'attempts' };
  if (table === 'proctoring_events' || table === 'proctoringEvents') {
    return { memoryKey: 'proctoring_events', supabaseTable: 'attempts' };
  }
  if (table === 'recordings') {
    return { memoryKey: null, supabaseTable: 'recordings' };
  }
  if (table === 'classes' || table === 'departments' || table === 'institutions') {
    return { memoryKey: table, supabaseTable: table };
  }
  if (table === 'students' || table === 'faculty') {
    return { memoryKey: 'users', supabaseTable: 'users' };
  }
  if (table === 'tests') {
    return { memoryKey: 'tests', supabaseTable: 'assessments' };
  }
  if (table === 'testcases') {
    return { memoryKey: 'testcases', supabaseTable: 'testcases' };
  }
  if (table === 'audit_logs' || table === 'auditLogs') {
    return { memoryKey: null, supabaseTable: 'attempts' };
  }
  if (table === 'system_settings' || table === 'systemSettings') {
    return { memoryKey: 'settings', supabaseTable: 'institutions' };
  }
  if (table === 'faculty_settings' || table === 'student_settings' || table === 'facultySettings' || table === 'studentSettings') {
    return { memoryKey: null, supabaseTable: 'institutions' };
  }
  return null;
}

function buildSupabaseRow(table, id, data) {
  if (table === 'results') {
    return { id: `res-${id}`, data: { ...data, isResultRecord: true }, updated_at: new Date().toISOString() };
  }
  if (table === 'proctoring_events' || table === 'proctoringEvents') {
    return {
      id: String(id),
      assessment_id: data.assessmentId || data.assessment_id || null,
      student_id: data.candidateId || data.studentId || data.student_id || null,
      data: { ...data, isProctoringEvent: true },
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'recordings') {
    return {
      id: String(id),
      attempt_id: data.attempt_id || data.attemptId || data.sessionId || null,
      session_id: data.session_id || data.sessionId || null,
      student_id: data.student_id || data.studentId || data.candidateId || null,
      assessment_id: data.assessment_id || data.assessmentId || null,
      drive_file_id: data.drive_file_id || data.driveFileId || null,
      drive_folder_id: data.drive_folder_id || data.driveFolderId || null,
      status: data.status || 'PENDING',
      started_at: data.started_at || data.startedAt || null,
      ended_at: data.ended_at || data.endedAt || null,
      uploaded_at: data.uploaded_at || data.uploadedAt || null,
      file_size: Number(data.file_size || data.fileSize || 0),
      error: data.error || null,
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'audit_logs' || table === 'auditLogs') {
    return {
      id: String(id),
      data: { ...data, isAuditLog: true },
      updated_at: new Date().toISOString(),
    };
  }
  if (table.includes('settings') || table.includes('Settings')) {
    return {
      id: `setting-${table}`,
      data: { settingKey: table, data, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'classes') {
    return {
      id,
      name: data.name || '',
      code: data.code || '',
      department: data.department || data.department_id || data.departmentId || '',
      semester: Number(data.semester || 1),
      academic_year: data.academic_year || data.academicYear || '2025-2026',
      student_count: Number(data.student_count || data.studentCount || (data.student_ids || data.studentIds || []).length || 0),
      staff_ids: Array.isArray(data.staff_ids || data.staffIds) ? (data.staff_ids || data.staffIds) : [],
      faculty_ids: Array.isArray(data.faculty_ids || data.facultyIds) ? (data.faculty_ids || data.facultyIds) : [],
      student_ids: Array.isArray(data.student_ids || data.studentIds) ? (data.student_ids || data.studentIds) : [],
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'users' || table === 'students' || table === 'faculty') {
    return {
      id,
      name: data.name || '',
      email: data.email || '',
      role: (data.role || 'STUDENT').toUpperCase(),
      register_number: data.register_number || data.registerNumber || data.registrationNumber || null,
      department: data.department || 'Computer Science & Engineering',
      institution_id: data.institution_id || data.institutionId || 'inst-01',
      avatar: data.avatar || null,
      class_ids: Array.isArray(data.class_ids || data.classIds) ? (data.class_ids || data.classIds) : [],
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'departments') {
    return {
      id,
      name: data.name || '',
      code: data.code || '',
      head_of_department: data.head_of_department || data.headOfDepartment || '',
      faculty_count: Number(data.faculty_count || data.facultyCount || 0),
      student_count: Number(data.student_count || data.studentCount || 0),
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'institutions') {
    return {
      id,
      name: data.name || '',
      code: data.code || '',
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'questions') {
    return {
      id,
      title: data.title || '',
      type: data.type || 'CODING',
      problem_statement: data.problem_statement || data.problemStatement || data.description || '',
      input_format: data.input_format || data.inputFormat || '',
      output_format: data.output_format || data.outputFormat || '',
      constraints: data.constraints || '',
      explanation: data.explanation || '',
      points: Number(data.points || data.marks || 20),
      difficulty: data.difficulty || 'MEDIUM',
      tags: Array.isArray(data.tags) ? data.tags : [],
      starter_code: data.starter_code || data.starterCode || data.boilerplateCode || '',
      function_signature: data.function_signature || data.functionSignature || {},
      data,
      updated_at: new Date().toISOString(),
    };
  }
  if (table === 'assessments' || table === 'tests') {
    return {
      id,
      title: data.title || '',
      description: data.description || '',
      instructions: data.instructions || '',
      duration_minutes: Number(data.duration_minutes || data.durationMinutes || data.duration || 60),
      start_time: data.start_time || data.startTime || null,
      end_time: data.end_time || data.endTime || null,
      max_attempts: Number(data.max_attempts || data.maxAttempts || 1),
      passing_score: Number(data.passing_score || data.passingScore || 50),
      maximum_marks: Number(data.maximum_marks || data.maximumMarks || data.totalMarks || 100),
      status: (data.status || 'ACTIVE').toUpperCase(),
      faculty_id: data.faculty_id || data.facultyId || data.authorId || '',
      allowed_languages: Array.isArray(data.allowed_languages || data.allowedLanguages) ? (data.allowed_languages || data.allowedLanguages) : ['python', 'javascript', 'java', 'cpp', 'c'],
      security_settings: data.security_settings || data.securitySettings || {},
      risk_weights: data.risk_weights || data.riskWeights || {},
      data,
      is_deleted: Boolean(data.is_deleted || data.deleted),
      updated_at: new Date().toISOString(),
    };
  }
  return { ...data, id, data, updated_at: new Date().toISOString() };
}

function saveInMemory(table, id, data, config) {
  if (config.memoryKey === 'settings') {
    memoryStore.settings = { ...memoryStore.settings, ...data, updated_at: new Date().toISOString() };
    return memoryStore.settings;
  }
  if (!config.memoryKey) return data;

  if (!Array.isArray(memoryStore[config.memoryKey])) {
    memoryStore[config.memoryKey] = [];
  }
  const records = memoryStore[config.memoryKey];
  if (data && data.deleted === true) {
    memoryStore[config.memoryKey] = records.filter((record) => String(record.id) !== String(id));
    return { id, deleted: true };
  }

  const index = records.findIndex((record) => String(record.id) === String(id));
  const saved = index === -1 ? { ...data, id } : { ...records[index], ...data, id };
  if (index === -1) records.push(saved);
  else records[index] = saved;

  if ((table === 'proctoring_events' || table === 'proctoringEvents') && data && data.sessionId) {
    const sess = memoryStore.sessions.find((s) => s.id === data.sessionId);
    if (sess) {
      if (!Array.isArray(sess.proctoringEvents)) sess.proctoringEvents = [];
      if (!sess.proctoringEvents.some((e) => e.id === id)) {
        sess.proctoringEvents.push(data);
      }
    }
  }

  return saved;
}

function sanitizeSavedRecord(table, record) {
  if (table === 'users' && record && typeof record === 'object') {
    const { password: _password, ...safeRecord } = record;
    return safeRecord;
  }
  return record;
}

async function readTable(table, fallback = []) {
  if (!isSupabaseConfigured || !supabase) {
    if (process.env.NODE_ENV === 'production') throw new Error('[DB] Production database is unavailable.');
    return fallback;
  }
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data : fallback;
}

function unpackRow(row) {
  if (!row || typeof row !== 'object') return row;
  const unpacked = row.data && typeof row.data === 'object' ? { ...row.data, ...row } : { ...row };
  if (unpacked.faculty_id && !unpacked.facultyId) unpacked.facultyId = unpacked.faculty_id;
  if (unpacked.facultyId && !unpacked.faculty_id) unpacked.faculty_id = unpacked.facultyId;
  if (unpacked.class_id && !unpacked.classId) unpacked.classId = unpacked.class_id;
  if (unpacked.classId && !unpacked.class_id) unpacked.class_id = unpacked.classId;
  if (unpacked.duration_minutes && !unpacked.durationMinutes) unpacked.durationMinutes = unpacked.duration_minutes;
  if (unpacked.durationMinutes && !unpacked.duration_minutes) unpacked.duration_minutes = unpacked.durationMinutes;
  return unpacked;
}

router.get('/all', async (_req, res, next) => {
  try {
    const [
      usersRows,
      assessments,
      questions,
      attempts,
      submissions,
      classes,
      departments,
      institutions,
      auditLogs,
      systemSettings,
      facultySettings,
      studentSettings,
    ] = await Promise.all([
      readTable('users', memoryStore.users),
      readTable('assessments', memoryStore.tests),
      readTable('questions', memoryStore.questions),
      readTable('attempts', memoryStore.sessions),
      readTable('submissions', memoryStore.submissions),
      readTable('classes'),
      readTable('departments'),
      readTable('institutions'),
      readTable('audit_events'),
      readTable('system_settings'),
      readTable('faculty_settings'),
      readTable('student_settings'),
    ]);
    const users = usersRows.map(unpackRow).map(({ password: _password, ...user }) => user);

    return sendSuccess(res, {
      users,
      assessments: assessments.map(unpackRow),
      questions: questions.map(unpackRow),
      attempts: attempts.map(unpackRow),
      sessions: attempts.map(unpackRow),
      submissions: submissions.map(unpackRow),
      results: [],
      classes: classes.map(unpackRow),
      departments: departments.map(unpackRow),
      institutions: institutions.map(unpackRow),
      auditLogs: auditLogs.map(unpackRow),
      systemSettings: unpackRow(systemSettings[0]) || memoryStore.settings,
      facultySettings: unpackRow(facultySettings[0]) || {},
      studentSettings: unpackRow(studentSettings[0]) || {},
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/save', authenticate, async (req, res, next) => {
  try {
    const { table, id, data } = req.body || {};
    const config = typeof table === 'string' ? resolveTable(table) : null;

    if (!config || !id || !data || typeof data !== 'object' || Array.isArray(data)) {
      return sendError(res, 'A supported table, record id, and object data are required.', 400, 'INVALID_DB_WRITE');
    }

    const production = process.env.NODE_ENV === 'production';
    if (production && (!isSupabaseConfigured || !supabase)) {
      return sendError(res, 'Persistent database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
    }

    if (production) {
      const role = String(req.user?.role || '').toUpperCase();
      const isPrivileged = role === 'ADMIN' || role === 'FACULTY';
      if (!isPrivileged) {
        const studentTables = ['attempts', 'sessions', 'submissions', 'proctoring_events', 'proctoringEvents', 'results', 'recordings'];
        const ownerIdentifiers = [
          data.student_id,
          data.studentId,
          data.candidateId,
          data.user_id,
          data.userId,
        ].filter(Boolean).map(String);

        const isOwner =
          ownerIdentifiers.length === 0 ||
          ownerIdentifiers.some(
            (ownerId) =>
              ownerId === String(req.user?.id) ||
              (req.user?.email && ownerId.toLowerCase() === String(req.user.email).toLowerCase())
          );

        const ownedStudentWrite = studentTables.includes(table) && data.deleted !== true && isOwner;
        if (!ownedStudentWrite) {
          return sendError(res, 'This account cannot modify the requested record.', 403, 'FORBIDDEN');
        }
      }
    }

    // Check if client dispatched a DELETE action masquerading as a save
    if (data.deleted === true) {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from(config.supabaseTable).delete().eq('id', id);
        if (error) throw error;
      }
      saveInMemory(table, id, data, config);
      broadcastDatabaseUpdate({ table, id: String(id), action: 'delete' });
      return sendSuccess(res, { id, deleted: true, resolvedTable: config.supabaseTable });
    }

    let supabaseStatus = null;
    let supabaseError = null;
    let supabaseWarning = null;

    if (isSupabaseConfigured && supabase) {
      const rowToUpsert = buildSupabaseRow(table, id, data);
      const { error } = await supabase
        .from(config.supabaseTable)
        .upsert(rowToUpsert, { onConflict: 'id' });
      if (error) {
        logger.warn(`Supabase upsert warning on table "${config.supabaseTable}": ${error.message}`);
        supabaseStatus = 500;
        supabaseError = { code: error.code, message: error.message };
        supabaseWarning = `Supabase write failed: ${error.message}`;
      } else {
        supabaseStatus = 200;
      }
    }

    const saved = saveInMemory(table, id, data, config);

    broadcastDatabaseUpdate({ table, id: String(id), data: saved, action: 'save' });
    return sendSuccess(res, {
      saved: sanitizeSavedRecord(table, saved),
      resolvedTable: config.supabaseTable,
      supabaseStatus,
      supabaseWarning,
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:table/:id', authenticate, async (req, res, next) => {
  try {
    const { table, id } = req.params;
    const config = resolveTable(table);

    if (!config || !id) {
      return sendError(res, 'A supported table and record id are required.', 400, 'INVALID_DB_DELETE');
    }

    const role = String(req.user?.role || '').toUpperCase();
    const facultyAllowedTables = ['classes', 'questions', 'testcases', 'assessments', 'tests', 'students', 'users'];
    if (role !== 'ADMIN') {
      if (!facultyAllowedTables.includes(table) || role !== 'FACULTY') {
        return sendError(res, 'You do not have permission to delete this record.', 403, 'FORBIDDEN');
      }
    }

    if (table === 'users' || table === 'students') {
      const user = memoryStore.users.find((record) => String(record.id) === String(id));
      if (user?.role === 'ADMIN' && user.id === 'usr-admin') {
        return sendError(res, 'The administrator account cannot be deleted.', 403, 'ADMIN_DELETE_FORBIDDEN');
      }
      if (role === 'FACULTY' && user?.role === 'ADMIN') {
        return sendError(res, 'Faculty members cannot delete administrator accounts.', 403, 'FORBIDDEN');
      }
    }

    if (config.memoryKey) {
      const records = memoryStore[config.memoryKey];
      if (Array.isArray(records)) {
        memoryStore[config.memoryKey] = records.filter((record) => String(record.id) !== String(id));
      }
    }

    // Cascade cleanups
    if (table === 'users' || table === 'students' || table === 'faculty') {
      if (Array.isArray(memoryStore.classes)) {
        memoryStore.classes.forEach((cls) => {
          if (Array.isArray(cls.studentIds)) cls.studentIds = cls.studentIds.filter((cid) => cid !== id);
          if (Array.isArray(cls.staffIds)) cls.staffIds = cls.staffIds.filter((cid) => cid !== id);
          if (Array.isArray(cls.facultyIds)) cls.facultyIds = cls.facultyIds.filter((cid) => cid !== id);
        });
      }
    } else if (table === 'classes') {
      if (Array.isArray(memoryStore.users)) {
        memoryStore.users.forEach((u) => {
          if (Array.isArray(u.classIds)) u.classIds = u.classIds.filter((cid) => cid !== id);
        });
      }
    }

    let supabaseWarning = null;
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from(config.supabaseTable).delete().eq('id', id);
      if (error?.code === 'PGRST205') {
        supabaseWarning = `Supabase table "${config.supabaseTable}" is not provisioned; deleted from backend memory only.`;
      }
    }

    broadcastDatabaseUpdate({ table, id: String(id), action: 'delete' });
    return sendSuccess(res, { id, deleted: true, supabaseWarning }, 'Record deleted successfully.');
  } catch (error) {
    return next(error);
  }
});

export default router;
