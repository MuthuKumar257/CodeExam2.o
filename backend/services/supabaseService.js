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


export const defaultQuestions = [
  {
    id: 'q-01',
    title: 'Find Maximum Element',
    description: 'Given an array of N integers, find and return the largest element.',
    input_format: 'First line contains integer N. Second line contains N space-separated integers.',
    output_format: 'Print the largest element in the array.',
    constraints: '1 <= N <= 100000, -10^9 <= A[i] <= 10^9',
    difficulty: 'EASY',
    marks: 20,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'q-02',
    title: 'Two Sum Problem',
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    input_format: 'First line contains N and Target. Second line contains N space-separated integers.',
    output_format: 'Print the two 0-based indices separated by space.',
    constraints: '2 <= N <= 10^5, -10^9 <= nums[i] <= 10^9',
    difficulty: 'MEDIUM',
    marks: 30,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'q-03',
    title: 'Valid Parentheses Matching',
    description: 'Given a string containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string is valid.',
    input_format: 'A single string S containing bracket characters.',
    output_format: 'Print YES if valid, else NO.',
    constraints: '1 <= length(S) <= 10^5',
    difficulty: 'MEDIUM',
    marks: 30,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'q-04',
    title: 'Longest Palindromic Substring',
    description: 'Given a string s, return the longest palindromic substring in s.',
    input_format: 'A single line containing string s.',
    output_format: 'Print the longest palindromic substring.',
    constraints: '1 <= s.length <= 1000',
    difficulty: 'HARD',
    marks: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const defaultTestcases = [
  {
    id: 'tc-01-1',
    question_id: 'q-01',
    input: '5\n10 20 5 30 15',
    expected_output: '30',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-01-2',
    question_id: 'q-01',
    input: '4\n-10 -5 -20 -1',
    expected_output: '-1',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-01-3',
    question_id: 'q-01',
    input: '6\n100 200 50 400 300 250',
    expected_output: '400',
    is_hidden: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-01-4',
    question_id: 'q-01',
    input: '1\n42',
    expected_output: '42',
    is_hidden: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-02-1',
    question_id: 'q-02',
    input: '4 9\n2 7 11 15',
    expected_output: '0 1',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-02-2',
    question_id: 'q-02',
    input: '3 6\n3 2 4',
    expected_output: '1 2',
    is_hidden: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-03-1',
    question_id: 'q-03',
    input: '()[]{}',
    expected_output: 'YES',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-03-2',
    question_id: 'q-03',
    input: '(]',
    expected_output: 'NO',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-03-3',
    question_id: 'q-03',
    input: '([{}])',
    expected_output: 'YES',
    is_hidden: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'tc-04-1',
    question_id: 'q-04',
    input: 'babad',
    expected_output: 'bab',
    is_hidden: false,
    created_at: new Date().toISOString(),
  },
];

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

export const defaultTests = [
  {
    id: 'test-01',
    title: 'Data Structures & Algorithms Diagnostic',
    description: 'Comprehensive coding evaluation on core DSA concepts including Arrays, Strings, and Two Pointers.',
    faculty_id: 'usr-admin-cse-drngpit',
    duration_minutes: 90,
    total_marks: 100,
    status: 'ACTIVE',
    start_time: new Date(Date.now() - 3600000).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 7).toISOString(),
    questions: ['q-01', 'q-02', 'q-03', 'q-04'],
    class_id: 'cls-01',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'test-02',
    title: 'Problem Solving & Logic Assessment',
    description: 'Timed assessment evaluating algorithm efficiency, edge cases, and algorithmic complexity.',
    faculty_id: 'usr-admin-cse-drngpit',
    duration_minutes: 60,
    total_marks: 50,
    status: 'ACTIVE',
    start_time: new Date(Date.now() - 1800000).toISOString(),
    end_time: new Date(Date.now() + 86400000 * 5).toISOString(),
    questions: ['q-01', 'q-02'],
    class_id: 'cls-02',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

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
  questions: loadedStore?.questions && loadedStore.questions.length > 0 ? loadedStore.questions : [...defaultQuestions],
  testcases: loadedStore?.testcases && loadedStore.testcases.length > 0 ? loadedStore.testcases : [...defaultTestcases],
  tests: loadedStore?.tests && loadedStore.tests.length > 0 ? loadedStore.tests : [...defaultTests],
  classes: loadedStore?.classes && loadedStore.classes.length > 0 ? loadedStore.classes : [...defaultClasses],
  departments: loadedStore?.departments && loadedStore.departments.length > 0 ? loadedStore.departments : [...defaultDepartments],
  institutions: loadedStore?.institutions && loadedStore.institutions.length > 0 ? loadedStore.institutions : [...defaultInstitutions],
  sessions: loadedStore?.sessions || [],
  submissions: loadedStore?.submissions || [],
  deletedUserIds: new Set(loadedStore?.deletedUserIds || []),
  settings: loadedStore?.settings || {
    institution_name: 'CodeExam Technical University',
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
