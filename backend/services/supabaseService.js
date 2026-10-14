import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { isProduction, logDatabaseStartup } from './databaseSafety.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.resolve(__dirname, '../data/db_store.json');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('http') &&
  supabaseKey &&
  supabaseKey.length > 10
);

let supabaseClient = null;
if (isSupabaseConfigured) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    logger.info('Connected to Supabase PostgreSQL at:', supabaseUrl);
  } catch (err) {
    logger.warn('Failed to initialize Supabase client:', err.message);
  }
} else {
  logger.info('Supabase credentials not fully configured; running in resilient local storage mode.');
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
  : [...defaultUsers];

// Ensure essential default users exist in initialUsers if not present
for (const defUser of defaultUsers) {
  if (!initialUsers.some((u) => u.email === defUser.email || u.id === defUser.id)) {
    initialUsers.push(defUser);
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
  if (!isSupabaseConfigured || !supabase) return;
  try {
    let { data, error } = await supabase.from('users').select('*');
    if (error && error.code === 'PGRST205') {
      const pRes = await supabase.from('profiles').select('*');
      if (!pRes.error && Array.isArray(pRes.data)) {
        data = pRes.data;
        error = null;
      }
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

    // Sync assessments if present
    try {
      const aRes = await supabase.from('assessments').select('*');
      if (!aRes.error && Array.isArray(aRes.data) && aRes.data.length > 0) {
        logger.info(`[StartupSync] Synced ${aRes.data.length} assessments from Supabase.`);
        memoryStore.tests = aRes.data;
      }
    } catch {}

    // Sync classes if present
    try {
      const cRes = await supabase.from('classes').select('*');
      if (!cRes.error && Array.isArray(cRes.data) && cRes.data.length > 0) {
        logger.info(`[StartupSync] Synced ${cRes.data.length} classes from Supabase.`);
        memoryStore.classes = cRes.data;
      }
    } catch {}

    // Sync departments if present
    try {
      const dRes = await supabase.from('departments').select('*');
      if (!dRes.error && Array.isArray(dRes.data) && dRes.data.length > 0) {
        logger.info(`[StartupSync] Synced ${dRes.data.length} departments from Supabase.`);
        memoryStore.departments = dRes.data;
      }
    } catch {}

    // Sync questions if present
    try {
      const qRes = await supabase.from('questions').select('*');
      if (!qRes.error && Array.isArray(qRes.data) && qRes.data.length > 0) {
        logger.info(`[StartupSync] Synced ${qRes.data.length} questions from Supabase.`);
        memoryStore.questions = qRes.data;
      }
    } catch {}

    savePersistentStore(true);
  } catch (err) {
    logger.warn('[StartupSync] Supabase initial sync skipped:', err.message);
  }
}

syncFromSupabaseOnStartup().catch(() => {});
