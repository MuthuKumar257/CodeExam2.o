import { Router } from 'express';
import { memoryStore, supabase, isSupabaseConfigured } from '../services/supabaseService.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { broadcastDatabaseUpdate } from '../websocket/testSocket.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

const TABLE_CONFIG = {
  users: { memoryKey: 'users', supabaseTable: 'users' },
  assessments: { memoryKey: 'tests', supabaseTable: 'assessments' },
  questions: { memoryKey: 'questions', supabaseTable: 'questions' },
  attempts: { memoryKey: 'sessions', supabaseTable: 'attempts' },
  sessions: { memoryKey: 'sessions', supabaseTable: 'attempts' },
  submissions: { memoryKey: 'submissions', supabaseTable: 'submissions' },
};

function resolveTable(table) {
  if (TABLE_CONFIG[table]) return TABLE_CONFIG[table];
  if (table === 'results') return { memoryKey: null, supabaseTable: 'attempts' };
  if (table === 'classes' || table === 'departments' || table === 'institutions') {
    return { memoryKey: null, supabaseTable: table };
  }
  if (table === 'audit_logs' || table === 'auditLogs') {
    return { memoryKey: null, supabaseTable: 'audit_logs' };
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
  if (table.includes('settings') || table.includes('Settings')) {
    return {
      id: `setting-${table}`,
      data: { settingKey: table, data, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
  }
  return { ...data, id, updated_at: new Date().toISOString() };
}

function saveInMemory(table, id, data, config) {
  if (config.memoryKey === 'settings') {
    memoryStore.settings = { ...memoryStore.settings, ...data, updated_at: new Date().toISOString() };
    return memoryStore.settings;
  }
  if (!config.memoryKey) return data;

  const records = memoryStore[config.memoryKey];
  const index = records.findIndex((record) => String(record.id) === String(id));
  const saved = index === -1 ? { ...data, id } : { ...records[index], ...data, id };
  if (index === -1) records.push(saved);
  else records[index] = saved;
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
  if (!isSupabaseConfigured || !supabase) return fallback;
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    if (error.code !== 'PGRST205') {
      throw error;
    }
    return fallback;
  }
  return Array.isArray(data) ? data : fallback;
}

function unpackRow(row) {
  if (!row || typeof row !== 'object') return row;
  return row.data && typeof row.data === 'object' ? { ...row.data, id: row.id } : row;
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
      assessments,
      questions,
      attempts,
      sessions: attempts,
      submissions,
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

router.post('/save', async (req, res, next) => {
  try {
    const { table, id, data } = req.body || {};
    const config = typeof table === 'string' ? resolveTable(table) : null;

    if (!config || !id || !data || typeof data !== 'object' || Array.isArray(data)) {
      return sendError(res, 'A supported table, record id, and object data are required.', 400, 'INVALID_DB_WRITE');
    }

    const saved = saveInMemory(table, id, data, config);
    let supabaseStatus = null;
    let supabaseError = null;
    let supabaseWarning = null;

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from(config.supabaseTable)
        .upsert(buildSupabaseRow(table, id, data), { onConflict: 'id' });
      if (error) {
        if (error.code === 'PGRST205') {
          supabaseStatus = 503;
          supabaseWarning = `Supabase table "${config.supabaseTable}" is not provisioned; saved in backend memory only.`;
        } else {
          supabaseError = error;
        }
      } else {
        supabaseStatus = 200;
      }
    }

    if (supabaseError) {
      return sendSuccess(res, {
        saved: sanitizeSavedRecord(table, saved),
        resolvedTable: config.supabaseTable,
        supabaseStatus,
        supabaseError,
        supabaseWarning,
      });
    }

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

router.delete('/:table/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { table, id } = req.params;
    const config = resolveTable(table);

    if (!config || !id) {
      return sendError(res, 'A supported table and record id are required.', 400, 'INVALID_DB_DELETE');
    }

    if (table === 'users') {
      const user = memoryStore.users.find((record) => String(record.id) === String(id));
      if (user?.role === 'ADMIN') {
        return sendError(res, 'The administrator account cannot be deleted.', 403, 'ADMIN_DELETE_FORBIDDEN');
      }
    }

    if (config.memoryKey) {
      const records = memoryStore[config.memoryKey];
      if (Array.isArray(records)) {
        memoryStore[config.memoryKey] = records.filter((record) => String(record.id) !== String(id));
      }
    }

    let supabaseWarning = null;
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from(config.supabaseTable).delete().eq('id', id);
      if (error?.code === 'PGRST205') {
        supabaseWarning = `Supabase table "${config.supabaseTable}" is not provisioned; deleted from backend memory only.`;
      } else if (error) {
        return next(error);
      }
    }

    broadcastDatabaseUpdate({ table, id: String(id), action: 'delete' });
    return sendSuccess(res, { id, deleted: true, supabaseWarning });
  } catch (error) {
    return next(error);
  }
});

export default router;
