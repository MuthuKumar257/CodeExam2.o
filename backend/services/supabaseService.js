import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { isProduction, assertProductionDatabaseIdentity, logDatabaseStartup } from './databaseSafety.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.resolve(__dirname, '../data/db_store.json');

const production = process.env.NODE_ENV === 'production';
const testing = process.env.NODE_ENV === 'test';
// Production must use the explicit backend URL and a server-only key. Public
// frontend configuration is useful for local development, but must never make
// a production server appear database-backed when its real credentials are absent.
const supabaseUrl = production
  ? (process.env.SUPABASE_URL || '')
  : (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
const supabaseKey = production
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '')
  : (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    );

export const isSupabaseConfigured = !testing && Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('http') &&
  supabaseKey &&
  supabaseKey.length > 10
);

if (production) assertProductionDatabaseIdentity(supabaseUrl);

let supabaseClient = null;
if (isSupabaseConfigured) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    logger.info(`[DB] Supabase client initialized for project ${projectRef}.`);
  } catch (err) {
    logger.warn('Failed to initialize Supabase client:', err.message);
  }
} else {
  logger.warn(`[DB] Supabase is not configured; local-only mode is enabled only outside production (Environment: ${process.env.NODE_ENV || 'development'}).`);
}

export const supabase = supabaseClient;

logDatabaseStartup({ configured: isSupabaseConfigured, url: supabaseUrl });

// Initial seed data for out-of-the-box readiness
export const defaultUsers = [
  {
    id: 'usr-admin-cse-drngpit',
    name: 'CSE Administrator',
    email: 'cse.admin@drngpit.ac.in',
    password: '$2a$10$CQSSpupAtyPZZUxWYOw2uOJ.aR5jd3zZtgx802BRQmVXf5aJr9bC.', // Admin@123
    role: 'ADMIN',
    department: 'Computer Science and Engineering',
    institution_id: 'inst-01',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];


export const defaultQuestions = [];
export const defaultTestcases = [];
export const defaultClasses = [];
export const defaultDepartments = [];
export const defaultInstitutions = [];
export const defaultTests = [];


function loadPersistentStore() {
  // Host-local files are not a durable production database and can be stale.
  if (production || testing) return null;
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        logger.info(`[Persistence] Loaded database state from ${STORE_FILE_PATH} (${parsed.users?.length || 0} users)`);
        return parsed;
      }
    }
  } catch (err) {
    logger.warn('[Persistence] Error loading db_store.json:', err.message);
  }
  return null;
}

const loadedStore = loadPersistentStore();

const initialUsers = loadedStore?.users && Array.isArray(loadedStore.users) && loadedStore.users.length > 0
  ? [...loadedStore.users]
  : (production ? [] : [...defaultUsers]);

// Ensure essential default users exist in initialUsers if not present
if (!production) {
  for (const defUser of defaultUsers) {
    if (!initialUsers.some((u) => u.email === defUser.email || u.id === defUser.id)) {
      initialUsers.push(defUser);
    }
  }
}

export const memoryStore = {
  users: initialUsers,
  questions: Array.isArray(loadedStore?.questions) ? loadedStore.questions : [],
  testcases: Array.isArray(loadedStore?.testcases) ? loadedStore.testcases : [],
  tests: Array.isArray(loadedStore?.tests) ? loadedStore.tests : [],
  classes: Array.isArray(loadedStore?.classes) ? loadedStore.classes : [],
  departments: Array.isArray(loadedStore?.departments) ? loadedStore.departments : [],
  institutions: Array.isArray(loadedStore?.institutions) ? loadedStore.institutions : [],
  sessions: Array.isArray(loadedStore?.sessions) ? loadedStore.sessions : [],
  submissions: Array.isArray(loadedStore?.submissions) ? loadedStore.submissions : [],
  deletedUserIds: new Set(loadedStore?.deletedUserIds || []),
  settings: loadedStore?.settings || {
    institution_name: 'Dr. N.G.P. Institute of Technology',
    allow_registrations: true,
    maintenance_mode: false,
    session_timeout_minutes: 120,
    max_concurrent_sessions: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

let saveTimeout = null;
export function savePersistentStore(immediate = false) {
  // Never present ephemeral host storage as successful production persistence.
  if (production || testing) return;
  const doSave = () => {
    try {
      const dataDir = path.dirname(STORE_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dataToSave = {
        users: memoryStore.users,
        questions: memoryStore.questions,
        testcases: memoryStore.testcases,
        tests: memoryStore.tests,
        classes: memoryStore.classes,
        departments: memoryStore.departments,
        institutions: memoryStore.institutions,
        sessions: memoryStore.sessions,
        submissions: memoryStore.submissions,
        deletedUserIds: Array.from(memoryStore.deletedUserIds || []),
        settings: memoryStore.settings,
        saved_at: new Date().toISOString(),
      };
      fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[Persistence] Error writing db_store.json:', err.message);
    }
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = null;
    doSave();
  } else {
    if (!saveTimeout) {
      saveTimeout = setTimeout(() => {
        saveTimeout = null;
        doSave();
      }, 500);
    }
  }
}

export async function syncFromSupabaseOnStartup() {
  if (!isSupabaseConfigured || !supabase) {
    if (production) throw new Error('[DB] Production startup requires explicit Supabase server credentials.');
    return;
  }
  try {
    let { data, error } = await supabase.from('users').select('*');
    if (error && error.code === 'PGRST205') {
      const pRes = await supabase.from('profiles').select('*');
      if (!pRes.error && Array.isArray(pRes.data)) {
        data = pRes.data;
        error = null;
      } else if (production) {
        throw pRes.error || error;
      }
    }

    if (error) {
      logger.error(`[StartupSync] Could not load users from Supabase: ${error.message}`);
      if (production) throw error;
    }

    if (!error && Array.isArray(data) && data.length > 0) {
      logger.info(`[StartupSync] Successfully synced ${data.length} users from Supabase PostgreSQL.`);
      for (const sbUser of data) {
        const unpacked = sbUser.data && typeof sbUser.data === 'object' ? { ...sbUser.data, ...sbUser } : sbUser;
        const existingIdx = memoryStore.users.findIndex((u) => u.id === unpacked.id || (unpacked.email && u.email === unpacked.email));
        if (existingIdx !== -1) {
          memoryStore.users[existingIdx] = { ...memoryStore.users[existingIdx], ...unpacked };
        } else {
          memoryStore.users.push(unpacked);
        }
      }
    }

    // Session and submission endpoints read from memoryStore. Reload their
    // canonical rows before the HTTP server starts so a routine host restart
    // cannot make persisted attempts/results look empty.
    for (const [table, memoryKey] of [['sessions', 'sessions'], ['submissions', 'submissions']]) {
      const rows = [];
      let loadSucceeded = true;
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error: tableError } = await supabase
          .from(table)
          .select('*')
          .range(offset, offset + pageSize - 1);
        if (tableError) {
          loadSucceeded = false;
          logger.error(`[StartupSync] Could not load ${table} from Supabase: ${tableError.message}`);
          if (production) throw tableError;
          break;
        }
        if (!Array.isArray(page) || page.length === 0) break;
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      if (rows.length > 0) {
        const unpackedRows = rows.map((row) =>
          row.data && typeof row.data === 'object' ? { ...row.data, ...row } : row
        );
        memoryStore[memoryKey] = unpackedRows;
        logger.info(`[StartupSync] Restored ${unpackedRows.length} ${table} from Supabase.`);
      } else if (loadSucceeded) {
        logger.info(`[StartupSync] Supabase ${table} query succeeded with no rows; existing in-memory records were retained.`);
      }
    }

    for (const [table, memoryKey] of [
      ['assessments', 'tests'],
      ['classes', 'classes'],
      ['departments', 'departments'],
      ['questions', 'questions'],
    ]) {
      try {
        const { data: rows, error: tableError } = await supabase.from(table).select('*');
        if (tableError) {
          logger.error(`[StartupSync] Could not load ${table} from Supabase: ${tableError.message}`);
          if (production) throw tableError;
          continue;
        }
        if (Array.isArray(rows) && rows.length > 0) {
          memoryStore[memoryKey] = rows;
          logger.info(`[StartupSync] Restored ${rows.length} ${table} from Supabase.`);
        } else {
          logger.info(`[StartupSync] Supabase ${table} query succeeded with no rows; existing in-memory records were retained.`);
        }
      } catch (tableErr) {
        logger.error(`[StartupSync] Failed to load ${table} from Supabase: ${tableErr.message}`);
        if (production) throw tableErr;
      }
    }

    savePersistentStore(true);
  } catch (err) {
    logger.error('[StartupSync] Supabase initial sync failed:', err.message);
    if (production) throw err;
  }
}
