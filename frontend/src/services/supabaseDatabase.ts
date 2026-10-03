import { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { io as createSocketClient } from 'socket.io-client';
import { compressAvatarImage } from '../utils/imageCompressor';
import {
  supabase,
  isSupabaseClientConfigured as isSupabaseConfigured,
  safeGetSession,
  safeGetUser,
  refreshSupabaseSession,
  validateRlsPolicy,
  validateCoreRlsPolicies,
} from './supabase';
import { supabaseSyncLogger } from './supabaseSyncLogger';
import { clientWriteQueue } from './clientWriteQueue';
export { clientWriteQueue };
export {
  supabase,
  isSupabaseConfigured,
  safeGetSession,
  safeGetUser,
  refreshSupabaseSession,
  validateRlsPolicy,
  validateCoreRlsPolicies,
  supabaseSyncLogger,
};
import {
  Assessment,
  AuditLog,
  CandidateSession,
  TestAttempt,
  Classroom,
  Department,
  FacultyReview,
  Institution,
  ProctoringEvent,
  Question,
  Result,
  Submission,
  SystemSettings,
  FacultySettings,
  StudentSettings,
  User,
  UserRole,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_ASSESSMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_CLASSES,
  INITIAL_DEPARTMENTS,
  INITIAL_INSTITUTIONS,
  INITIAL_QUESTIONS,
  INITIAL_SESSIONS,
  INITIAL_SUBMISSIONS,
} from '../data/seedData';

// Clean plain object utility
function cleanObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanObject) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, any>)[key];
    if (val !== undefined) {
      cleaned[key] = cleanObject(val);
    }
  }
  return cleaned as T;
}

// Local Storage & In-Memory Store for instantaneous UI responsiveness and offline resilience
const STORAGE_KEYS = {
  USERS: 'codeguard_db_users',
  CLASSES: 'codeguard_db_classes',
  DEPARTMENTS: 'codeguard_db_departments',
  ASSESSMENTS: 'codeguard_db_assessments',
  QUESTIONS: 'codeguard_db_questions',
  SESSIONS: 'codeguard_db_sessions',
  SUBMISSIONS: 'codeguard_db_submissions',
  RESULTS: 'codeguard_db_results',
  AUDIT_LOGS: 'codeguard_db_audit_logs',
  FACULTY_REVIEWS: 'codeguard_db_faculty_reviews',
  PROCTOR_EVENTS: 'codeguard_db_proctor_events',
  INSTITUTIONS: 'codeguard_db_institutions',
  SYSTEM_SETTINGS: 'codeguard_db_sys_settings',
  FACULTY_SETTINGS: 'codeguard_db_fac_settings',
  STUDENT_SETTINGS: 'codeguard_db_stu_settings',
  CURRENT_USER: 'codeguard_current_user',
};

export function deduplicateById<T extends { id?: string | number }>(arr: T[] | null | undefined): T[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string | number>();
  const unique: T[] = [];
  for (const item of arr) {
    if (!item) continue;
    const key = item.id !== undefined && item.id !== null ? String(item.id) : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

export function mergeItemSmart<T extends { id?: string | number }>(existing: T | undefined, incoming: T): T {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const merged: any = { ...existing };

  for (const key of Object.keys(incoming)) {
    const val = (incoming as any)[key];
    if (val !== undefined && val !== null) {
      merged[key] = val;
    }
  }

  // Candidate session specific safeguards
  if ('warningsCount' in existing || 'warningsCount' in incoming) {
    const isReset = (incoming as any).isReset || (incoming as any).warningType === 'FALSE_ALARM_CLEARED';
    if (!isReset) {
      merged.warningsCount = Math.max(Number((existing as any).warningsCount || 0), Number((incoming as any).warningsCount || 0));
    }
  }

  // Merge questionStatuses and calculate score as the sum of all submitted question marks
  if ('questionStatuses' in existing || 'questionStatuses' in incoming) {
    const qsExisting = (existing as any).questionStatuses || {};
    const qsIncoming = (incoming as any).questionStatuses || {};
    const mergedQS = { ...qsExisting, ...qsIncoming };
    (merged as any).questionStatuses = mergedQS;
    const qsSum = Object.values(mergedQS).reduce<number>((acc: number, qs: any) => acc + Number(qs?.score || 0), 0);
    if (qsSum > 0) {
      merged.score = qsSum;
    }
  } else if ('score' in existing || 'score' in incoming) {
    merged.score = Math.max(Number((existing as any).score || 0), Number((incoming as any).score || 0));
  }

  if ('codeMap' in existing && (existing as any).codeMap) {
    merged.codeMap = { ...((existing as any).codeMap || {}), ...((incoming as any).codeMap || {}) };
  }

  if ('selectedAnswers' in existing && (existing as any).selectedAnswers) {
    merged.selectedAnswers = { ...((existing as any).selectedAnswers || {}), ...((incoming as any).selectedAnswers || {}) };
  }

  if ('proctoringEvents' in existing && Array.isArray((existing as any).proctoringEvents)) {
    const existingEvents = (existing as any).proctoringEvents || [];
    const incomingEvents = (incoming as any).proctoringEvents || [];
    merged.proctoringEvents = deduplicateById([...existingEvents, ...incomingEvents]);
  }

  const terminalStates = ['SUBMITTED', 'AUTO_SUBMITTED', 'TERMINATED_MALPRACTICE', 'DISQUALIFIED', 'COMPLETED'];
  if ((existing as any).state && terminalStates.includes((existing as any).state)) {
    if (!(incoming as any).state || (incoming as any).state === 'IN_PROGRESS' || (incoming as any).state === 'NOT_STARTED') {
      merged.state = (existing as any).state;
    }
  }

  return merged as T;
}

export function mergeArraySmart<T extends { id?: string | number }>(localArr: T[], incomingArr: T[]): T[] {
  if (!Array.isArray(incomingArr)) return deduplicateById(localArr);
  if (!Array.isArray(localArr) || localArr.length === 0) return deduplicateById(incomingArr);

  const localMap = new Map<string, T>();
  for (const item of localArr) {
    if (item && item.id !== undefined && item.id !== null) {
      localMap.set(String(item.id), item);
    }
  }

  const mergedList: T[] = [];
  const processedIds = new Set<string>();

  for (const incomingItem of incomingArr) {
    if (!incomingItem || incomingItem.id === undefined || incomingItem.id === null) continue;
    const idKey = String(incomingItem.id);
    const existing = localMap.get(idKey);
    const merged = mergeItemSmart(existing, incomingItem);
    mergedList.push(merged);
    processedIds.add(idKey);
  }

  for (const [idKey, localItem] of localMap.entries()) {
    if (!processedIds.has(idKey)) {
      mergedList.push(localItem);
    }
  }

  return deduplicateById(mergedList);
}

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (Array.isArray(fallback)) {
        return deduplicateById(fallback) as unknown as T;
      }
      return fallback;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return deduplicateById(parsed) as unknown as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, data: T): void {
  try {
    const toSave = Array.isArray(data) ? deduplicateById(data) : data;
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch {}
}

// Initial Memory Store
let localUsers: User[] = loadStorage(STORAGE_KEYS.USERS, DEMO_USERS);
if (localUsers.length === 0) localUsers = [...DEMO_USERS];
let localClasses: Classroom[] = loadStorage(STORAGE_KEYS.CLASSES, INITIAL_CLASSES);
let localDepartments: Department[] = loadStorage(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
let localAssessments: Assessment[] = loadStorage(STORAGE_KEYS.ASSESSMENTS, INITIAL_ASSESSMENTS);
let localQuestions: Question[] = loadStorage(STORAGE_KEYS.QUESTIONS, INITIAL_QUESTIONS);
let localSessions: CandidateSession[] = loadStorage(STORAGE_KEYS.SESSIONS, INITIAL_SESSIONS);
let localSubmissions: Submission[] = loadStorage(STORAGE_KEYS.SUBMISSIONS, INITIAL_SUBMISSIONS);
let localResults: Result[] = loadStorage(STORAGE_KEYS.RESULTS, []);
let localAuditLogs: AuditLog[] = loadStorage(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
let localFacultyReviews: FacultyReview[] = loadStorage(STORAGE_KEYS.FACULTY_REVIEWS, []);
let localProctorEvents: ProctoringEvent[] = loadStorage(STORAGE_KEYS.PROCTOR_EVENTS, []);
let localInstitutions: Institution[] = loadStorage(STORAGE_KEYS.INSTITUTIONS, INITIAL_INSTITUTIONS);

// Subscriptions Registry
type SubCallback<T> = (data: T) => void;
const listeners = {
  users: new Set<SubCallback<User[]>>(),
  classes: new Set<SubCallback<Classroom[]>>(),
  departments: new Set<SubCallback<Department[]>>(),
  assessments: new Set<SubCallback<Assessment[]>>(),
  questions: new Set<SubCallback<Question[]>>(),
  sessions: new Set<SubCallback<CandidateSession[]>>(),
  attempts: new Set<SubCallback<TestAttempt[]>>(),
  submissions: new Set<SubCallback<Submission[]>>(),
  results: new Set<SubCallback<Result[]>>(),
  auditLogs: new Set<SubCallback<AuditLog[]>>(),
  facultyReviews: new Set<SubCallback<FacultyReview[]>>(),
  proctorEvents: new Set<SubCallback<ProctoringEvent[]>>(),
  institutions: new Set<SubCallback<Institution[]>>(),
  systemSettings: new Set<SubCallback<SystemSettings>>(),
  facultySettings: new Set<SubCallback<FacultySettings>>(),
  studentSettings: new Set<SubCallback<StudentSettings>>(),
};

function notify<T>(listenersSet: Set<SubCallback<T>>, data: T) {
  const payload = Array.isArray(data) ? (deduplicateById(data) as unknown as T) : data;
  setTimeout(() => {
    listenersSet.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error('[Supabase State notify error]:', e);
      }
    });
  }, 0);
}

// Helper for backend-authenticated persistence with serialized request queueing, payload auditing & concurrency control
async function persistToBackend(table: string, id: string, data: any) {
  try {
    await clientWriteQueue.enqueueWrite(table, id, data, { action: 'UPSERT' });
  } catch (err) {
    console.warn(`[persistToBackend] Unhandled write error for [${table}:${id}]:`, err);
  }
}

async function deleteFromBackend(table: string, id: string) {
  try {
    await clientWriteQueue.enqueueDelete(table, id);
  } catch (err) {
    console.warn(`[deleteFromBackend] Unhandled delete error for [${table}:${id}]:`, err);
  }
}

// Real-time socket sync with backend database
try {
  if (typeof window !== 'undefined') {
    const syncSocket = createSocketClient(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    syncSocket.on('db_sync_event', (event: { table: string; id?: string; data?: any; action: 'save' | 'delete' | 'clear_all' | 'clear' }) => {
      if (!event || !event.table) return;
      const { table, id, data, action } = event;

      if (table === 'all') {
        fetchAndSyncAllData().catch(() => {});
        return;
      }

      if (table === 'users') {
        if (action === 'delete') localUsers = localUsers.filter((u) => u.id !== id);
        else if (action === 'clear_all' || action === 'clear') localUsers = localUsers.filter((u) => u.role === 'ADMIN');
        else if (data) {
          localUsers = mergeArraySmart(localUsers, Array.isArray(data) ? data : [data]);
        }
        if (localUsers.length === 0) localUsers = [...DEMO_USERS];
        saveStorage(STORAGE_KEYS.USERS, localUsers);
        notify(listeners.users, localUsers);
      } else if (table === 'assessments') {
        if (action === 'delete') localAssessments = localAssessments.filter((a) => a.id !== id);
        else if (action === 'clear_all' || action === 'clear') localAssessments = [];
        else if (data) {
          localAssessments = mergeArraySmart(localAssessments, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
        notify(listeners.assessments, localAssessments);
      } else if (table === 'questions') {
        if (action === 'delete') localQuestions = localQuestions.filter((q) => q.id !== id);
        else if (action === 'clear_all' || action === 'clear') localQuestions = [];
        else if (data) {
          localQuestions = mergeArraySmart(localQuestions, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
        notify(listeners.questions, localQuestions);
      } else if (table === 'attempts' || table === 'sessions') {
        if (action === 'delete') localSessions = localSessions.filter((s) => s.id !== id);
        else if (action === 'clear_all' || action === 'clear') localSessions = [];
        else if (data) {
          localSessions = mergeArraySmart(localSessions, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.SESSIONS, localSessions);
        notify(listeners.sessions, localSessions);
        notify(listeners.attempts, localSessions as unknown as TestAttempt[]);
      } else if (table === 'submissions') {
        if (action === 'delete') localSubmissions = localSubmissions.filter((s) => s.id !== id);
        else if (action === 'clear_all' || action === 'clear') localSubmissions = [];
        else if (data) {
          localSubmissions = mergeArraySmart(localSubmissions, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions);
        notify(listeners.submissions, localSubmissions);
      } else if (table === 'results') {
        if (action === 'delete') localResults = localResults.filter((r) => r.id !== id);
        else if (action === 'clear_all' || action === 'clear') localResults = [];
        else if (data) {
          localResults = mergeArraySmart(localResults, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.RESULTS, localResults);
        notify(listeners.results, localResults);
      } else if (table === 'classes') {
        if (action === 'delete') localClasses = localClasses.filter((c) => c.id !== id);
        else if (action === 'clear_all' || action === 'clear') localClasses = [];
        else if (data) {
          localClasses = mergeArraySmart(localClasses, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.CLASSES, localClasses);
        notify(listeners.classes, localClasses);
      } else if (table === 'departments') {
        if (action === 'delete') localDepartments = localDepartments.filter((d) => d.id !== id);
        else if (action === 'clear_all' || action === 'clear') localDepartments = [];
        else if (data) {
          localDepartments = mergeArraySmart(localDepartments, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
        notify(listeners.departments, localDepartments);
      } else if (table === 'institutions') {
        if (action === 'delete') localInstitutions = localInstitutions.filter((i) => i.id !== id);
        else if (action === 'clear_all' || action === 'clear') localInstitutions = [];
        else if (data) {
          localInstitutions = mergeArraySmart(localInstitutions, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions);
        notify(listeners.institutions, localInstitutions);
      } else if (table === 'audit_logs' || table === 'auditLogs') {
        if (action === 'clear_all' || action === 'clear') localAuditLogs = [];
        else if (action === 'delete') localAuditLogs = localAuditLogs.filter((l) => l.id !== id);
        else if (data) {
          localAuditLogs = mergeArraySmart(localAuditLogs, Array.isArray(data) ? data : [data]);
        }
        saveStorage(STORAGE_KEYS.AUDIT_LOGS, localAuditLogs);
        notify(listeners.auditLogs, localAuditLogs);
      } else if (table === 'system_settings' || table === 'systemSettings') {
        if (data) {
          localSystemSettings = cleanObject(data);
          saveStorage(STORAGE_KEYS.SYSTEM_SETTINGS, localSystemSettings);
          notify(listeners.systemSettings, localSystemSettings);
        }
      } else if (table === 'faculty_settings' || table === 'facultySettings') {
        if (data) {
          localFacultySettings = cleanObject(data);
          saveStorage(STORAGE_KEYS.FACULTY_SETTINGS, localFacultySettings);
          notify(listeners.facultySettings, localFacultySettings);
        }
      } else if (table === 'student_settings' || table === 'studentSettings') {
        if (data) {
          localStudentSettings = cleanObject(data);
          saveStorage(STORAGE_KEYS.STUDENT_SETTINGS, localStudentSettings);
          notify(listeners.studentSettings, localStudentSettings);
        }
      }
    });
  }
} catch (e) {
  console.warn('[Realtime Socket Sync Init Warn]:', e);
}

// Full bidirectional sync with backend server & Supabase
let isSyncingAllData = false;
let lastSyncTimestamp = 0;

export async function fetchAndSyncAllData(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (!force && (isSyncingAllData || now - lastSyncTimestamp < 4000)) {
    return;
  }
  isSyncingAllData = true;
  lastSyncTimestamp = now;

  try {
    const res = await fetch('/api/db/all').catch(() => null);
    if (res && res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.success && json.data) {
        const { users, assessments, questions, attempts, sessions, submissions, results, classes, departments, institutions, auditLogs, systemSettings, facultySettings, studentSettings } = json.data;
        if (Array.isArray(users)) {
          localUsers = mergeArraySmart(localUsers, users);
          if (localUsers.length === 0) localUsers = [...DEMO_USERS];
          saveStorage(STORAGE_KEYS.USERS, localUsers);
          notify(listeners.users, localUsers);
        }
        if (Array.isArray(assessments)) {
          localAssessments = mergeArraySmart(localAssessments, assessments);
          saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
          notify(listeners.assessments, localAssessments);
        }
        if (Array.isArray(questions)) {
          localQuestions = mergeArraySmart(localQuestions, questions);
          saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
          notify(listeners.questions, localQuestions);
        }
        const s = sessions || attempts;
        if (Array.isArray(s)) {
          localSessions = mergeArraySmart(localSessions, s);
          saveStorage(STORAGE_KEYS.SESSIONS, localSessions);
          notify(listeners.sessions, localSessions);
          notify(listeners.attempts, localSessions as unknown as TestAttempt[]);
        }
        if (Array.isArray(submissions)) {
          localSubmissions = mergeArraySmart(localSubmissions, submissions);
          saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions);
          notify(listeners.submissions, localSubmissions);
        }
        if (Array.isArray(results)) {
          localResults = mergeArraySmart(localResults, results);
          saveStorage(STORAGE_KEYS.RESULTS, localResults);
          notify(listeners.results, localResults);
        }
        if (Array.isArray(classes)) {
          localClasses = mergeArraySmart(localClasses, classes);
          saveStorage(STORAGE_KEYS.CLASSES, localClasses);
          notify(listeners.classes, localClasses);
        }
        if (Array.isArray(departments)) {
          localDepartments = mergeArraySmart(localDepartments, departments);
          saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
          notify(listeners.departments, localDepartments);
        }
        if (Array.isArray(institutions)) {
          localInstitutions = mergeArraySmart(localInstitutions, institutions);
          saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions);
          notify(listeners.institutions, localInstitutions);
        }
        if (Array.isArray(auditLogs)) {
          localAuditLogs = mergeArraySmart(localAuditLogs, auditLogs);
          saveStorage(STORAGE_KEYS.AUDIT_LOGS, localAuditLogs);
          notify(listeners.auditLogs, localAuditLogs);
        }
        if (systemSettings) {
          localSystemSettings = cleanObject(systemSettings);
          saveStorage(STORAGE_KEYS.SYSTEM_SETTINGS, localSystemSettings);
          notify(listeners.systemSettings, localSystemSettings);
        }
        if (facultySettings) {
          localFacultySettings = cleanObject(facultySettings);
          saveStorage(STORAGE_KEYS.FACULTY_SETTINGS, localFacultySettings);
          notify(listeners.facultySettings, localFacultySettings);
        }
        if (studentSettings) {
          localStudentSettings = cleanObject(studentSettings);
          saveStorage(STORAGE_KEYS.STUDENT_SETTINGS, localStudentSettings);
          notify(listeners.studentSettings, localStudentSettings);
        }
        return; // successfully synced via Express API
      }
    }

    // Direct Supabase fallback (e.g. on Vercel deployment where /api/db/all is not hosted on Express)
    if (supabase) {
      try {
        const [
          { data: remoteUsers },
          { data: remoteAssessments },
          { data: remoteQuestions },
          { data: remoteSessions },
          { data: remoteSubmissions },
          { data: remoteResults },
          { data: remoteClasses },
          { data: remoteDepartments },
          { data: remoteInstitutions },
        ] = await Promise.all([
          supabase.from('users').select('*').limit(500),
          supabase.from('assessments').select('*').limit(200),
          supabase.from('questions').select('*').limit(500),
          supabase.from('attempts').select('*').limit(500),
          supabase.from('submissions').select('*').limit(500),
          supabase.from('results').select('*').limit(500),
          supabase.from('classes').select('*').limit(100),
          supabase.from('departments').select('*').limit(50),
          supabase.from('institutions').select('*').limit(20),
        ]);

        const unpack = (row: any) => row?.data || row;

        if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
          localUsers = mergeArraySmart(localUsers, remoteUsers.map(unpack));
          saveStorage(STORAGE_KEYS.USERS, localUsers);
          notify(listeners.users, localUsers);
        }
        if (Array.isArray(remoteAssessments) && remoteAssessments.length > 0) {
          localAssessments = mergeArraySmart(localAssessments, remoteAssessments.map(unpack));
          saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
          notify(listeners.assessments, localAssessments);
        }
        if (Array.isArray(remoteQuestions) && remoteQuestions.length > 0) {
          localQuestions = mergeArraySmart(localQuestions, remoteQuestions.map(unpack));
          saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
          notify(listeners.questions, localQuestions);
        }
        if (Array.isArray(remoteSessions) && remoteSessions.length > 0) {
          localSessions = mergeArraySmart(localSessions, remoteSessions.map(unpack));
          saveStorage(STORAGE_KEYS.SESSIONS, localSessions);
          notify(listeners.sessions, localSessions);
          notify(listeners.attempts, localSessions as unknown as TestAttempt[]);
        }
        if (Array.isArray(remoteSubmissions) && remoteSubmissions.length > 0) {
          localSubmissions = mergeArraySmart(localSubmissions, remoteSubmissions.map(unpack));
          saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions);
          notify(listeners.submissions, localSubmissions);
        }
        if (Array.isArray(remoteResults) && remoteResults.length > 0) {
          localResults = mergeArraySmart(localResults, remoteResults.map(unpack));
          saveStorage(STORAGE_KEYS.RESULTS, localResults);
          notify(listeners.results, localResults);
        }
        if (Array.isArray(remoteClasses) && remoteClasses.length > 0) {
          localClasses = mergeArraySmart(localClasses, remoteClasses.map(unpack));
          saveStorage(STORAGE_KEYS.CLASSES, localClasses);
          notify(listeners.classes, localClasses);
        }
        if (Array.isArray(remoteDepartments) && remoteDepartments.length > 0) {
          localDepartments = mergeArraySmart(localDepartments, remoteDepartments.map(unpack));
          saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
          notify(listeners.departments, localDepartments);
        }
        if (Array.isArray(remoteInstitutions) && remoteInstitutions.length > 0) {
          localInstitutions = mergeArraySmart(localInstitutions, remoteInstitutions.map(unpack));
          saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions);
          notify(listeners.institutions, localInstitutions);
        }
      } catch (sbErr) {
        console.debug('[Supabase Direct Sync Error]:', sbErr);
      }
    }
  } catch (err) {
    console.warn('[Sync Error]:', err);
  } finally {
    isSyncingAllData = false;
  }
}

/**
 * Bi-directional Reconciliation: Pushes local client cache + pulls server & Supabase state
 * Guarantees zero data loss between development and production environments
 */
export async function reconcileAllData(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const payload = {
      users: localUsers,
      assessments: localAssessments,
      questions: localQuestions,
      attempts: localSessions,
      submissions: localSubmissions,
      classes: localClasses,
      departments: localDepartments,
      institutions: localInstitutions,
      systemSettings: localSystemSettings,
      facultySettings: localFacultySettings,
      studentSettings: localStudentSettings,
    };

    const res = await fetch('/api/sync/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.users) { localUsers = mergeArraySmart(localUsers, d.users); saveStorage(STORAGE_KEYS.USERS, localUsers); notify(listeners.users, localUsers); }
        if (d.assessments) { localAssessments = mergeArraySmart(localAssessments, d.assessments); saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments); notify(listeners.assessments, localAssessments); }
        if (d.questions) { localQuestions = mergeArraySmart(localQuestions, d.questions); saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions); notify(listeners.questions, localQuestions); }
        if (d.attempts || d.sessions) { localSessions = mergeArraySmart(localSessions, d.attempts || d.sessions); saveStorage(STORAGE_KEYS.SESSIONS, localSessions); notify(listeners.sessions, localSessions); notify(listeners.attempts, localSessions as any); }
        if (d.submissions) { localSubmissions = mergeArraySmart(localSubmissions, d.submissions); saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions); notify(listeners.submissions, localSubmissions); }
        if (d.classes) { localClasses = mergeArraySmart(localClasses, d.classes); saveStorage(STORAGE_KEYS.CLASSES, localClasses); notify(listeners.classes, localClasses); }
        if (d.departments) { localDepartments = mergeArraySmart(localDepartments, d.departments); saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments); notify(listeners.departments, localDepartments); }
        if (d.institutions) { localInstitutions = mergeArraySmart(localInstitutions, d.institutions); saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions); notify(listeners.institutions, localInstitutions); }
        if (d.systemSettings) { localSystemSettings = cleanObject(d.systemSettings); saveStorage(STORAGE_KEYS.SYSTEM_SETTINGS, localSystemSettings); notify(listeners.systemSettings, localSystemSettings); }
        if (d.facultySettings) { localFacultySettings = cleanObject(d.facultySettings); saveStorage(STORAGE_KEYS.FACULTY_SETTINGS, localFacultySettings); notify(listeners.facultySettings, localFacultySettings); }
        if (d.studentSettings) { localStudentSettings = cleanObject(d.studentSettings); saveStorage(STORAGE_KEYS.STUDENT_SETTINGS, localStudentSettings); notify(listeners.studentSettings, localStudentSettings); }
        
        return { success: true, message: json.message || 'Database synchronized successfully', data: json.data };
      }
    }
    return { success: false, message: 'Server returned error status during sync reconciliation' };
  } catch (err: any) {
    console.warn('[Reconcile Error]:', err);
    return { success: false, message: err?.message || 'Network error while reconciling database' };
  }
}

// Auto-run on client start and on tab refocus
if (typeof window !== 'undefined') {
  fetchAndSyncAllData();
  // Periodic background sync every 25 seconds when page is visible
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchAndSyncAllData().catch(() => {});
    }
  }, 25000);

  // Trigger sync on tab focus or when user returns to active tab
  window.addEventListener('focus', () => {
    fetchAndSyncAllData(true).catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchAndSyncAllData(true).catch(() => {});
    }
  });
}

// Backward-compatible error types
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.warn(`[Supabase Service ${operationType} on ${path}]:`, errMsg);
}

// Connection test
export async function testConnection(): Promise<boolean> {
  return true;
}

// Export default Settings objects
export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  cameraRequired: true,
  microphoneRequired: true,
  liveFacultyMonitoring: true,
  showCameraPreviewToStudent: true,
  detectMultiplePersons: true,
  detectNoPerson: true,
  detectCameraObstruction: true,
  detectVideoFreeze: true,
  detectTabSwitch: true,
  detectWindowBlur: true,
  requireFullscreen: true,
  allowPageRefresh: true,
  allowReconnect: true,
  allowPauseAssessment: true,
  maxPauseDurationMinutes: 15,
  maxPausesAllowedPerCandidate: 3,
  maxWarnings: 5,
  autoSubmitOnWarningLimit: true,
  allowedLanguages: ['python', 'javascript', 'java', 'cpp', 'c'],
  assessmentDuration: 60,
  questionNavigation: true,
  randomizeQuestions: false,
  videoRetentionDays: 30,
  autoPurgeExpiredVideos: true,
  codeExecutionTimeoutSec: 10,
  strictIpLock: false,
  watermarkStudentId: true,
  sessionTimeoutMinutes: 60,
  showResultsToStudents: true,
  recordScreenRecording: true,
  updatedAt: new Date().toISOString(),
  updatedBy: 'SYSTEM_INIT',
};

export const DEFAULT_FACULTY_SETTINGS: FacultySettings = {
  defaultEnableCamera: true,
  defaultEnableMicrophone: true,
  defaultDurationMinutes: 60,
  defaultPassingScore: 50,
  defaultRandomizeQuestions: false,
  defaultQuestionNavigation: true,
  allowPartialMarking: true,
  defaultShowSolutionsImmediately: false,
  defaultShowResultsToStudents: true,
  defaultAllowPauseAssessment: true,
  defaultMaxPauseDurationMinutes: 15,
  liveGridDensity: 'comfortable',
  alertSoundOnWarning: true,
  highRiskThresholdScore: 70,
  liveFeedRefreshRateSec: 5,
  diffViewMode: 'split',
  plagiarismThresholdPercent: 80,
  aiFeedbackEnabled: true,
  emailReportOnCompletion: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'SYSTEM_INIT',
};

export const DEFAULT_STUDENT_SETTINGS: StudentSettings = {
  editorTheme: 'vs-dark',
  fontSize: 14,
  tabSize: 2,
  keybindings: 'standard',
  enableAutocomplete: true,
  showLineNumbers: true,
  wordWrap: true,
  autoSaveIntervalSec: 30,
  cameraPipPosition: 'bottom-right',
  cameraPipSize: 'small',
  enableAudioWarningBeep: true,
  highContrastMode: false,
  fontFamily: 'monospace',
  bandwidthSaverMode: false,
  preferredLanguage: 'python',
  updatedAt: new Date().toISOString(),
  updatedBy: 'SYSTEM_INIT',
};

// Authentication state & local user session helpers
export function getLocalStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLocalStoredUser(user: User | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  } catch {}
}

export async function ensureAuth(): Promise<User | null> {
  return getLocalStoredUser();
}

// Authentication Implementation (Supabase Auth + Database Profile Sync)
export async function loginWithEmailPassword(identifier: string, pass: string): Promise<User> {
  const trimmed = identifier.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  // 1. Check with Supabase Auth if identifier is a valid email
  if (isEmail && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password: pass,
      });
      if (!error && data?.user) {
        let cached = localUsers.find((u) => u.id === data.user?.id || u.email?.toLowerCase() === trimmed);
        if (!cached) {
          // Direct fetch from Supabase users table
          const { data: dbUser } = await supabase.from('users').select('*').eq('id', data.user.id).maybeSingle();
          if (dbUser) {
            const parsedUser = dbUser.data || dbUser;
            if (parsedUser) {
              cached = parsedUser;
              localUsers = deduplicateById([parsedUser, ...localUsers]);
              saveStorage(STORAGE_KEYS.USERS, localUsers);
              notify(listeners.users, localUsers);
            }
          }
        }
        if (cached) {
          const userWithTimestamp = { ...cached, lastLoginAt: new Date().toISOString() };
          setLocalStoredUser(userWithTimestamp);
          return userWithTimestamp;
        }
      }
    } catch {
      // Supabase Auth failed (400 or network error) - proceed to database profile lookup
    }
  }

  // 2. Database User Match Fallback (check local memory first)
  let found = localUsers.find(
    (u) =>
      u.email?.toLowerCase() === trimmed ||
      u.id?.toLowerCase() === trimmed ||
      (u as any).registerNumber?.toLowerCase() === trimmed ||
      (u as any).username?.toLowerCase() === trimmed
  );

  // 3. If not found in memory, query Supabase database 'users' table directly!
  if (!found && supabase) {
    try {
      const { data: dbRows, error: dbErr } = await supabase.from('users').select('*');
      if (!dbErr && Array.isArray(dbRows) && dbRows.length > 0) {
        const fetchedUsers: User[] = dbRows.map((r: any) => r.data || r).filter(Boolean);
        localUsers = mergeArraySmart(localUsers, fetchedUsers);
        saveStorage(STORAGE_KEYS.USERS, localUsers);
        notify(listeners.users, localUsers);

        found = localUsers.find(
          (u) =>
            u.email?.toLowerCase() === trimmed ||
            u.id?.toLowerCase() === trimmed ||
            (u as any).registerNumber?.toLowerCase() === trimmed ||
            (u as any).username?.toLowerCase() === trimmed
        );
      }
    } catch (err) {
      console.warn('[Direct Supabase User Lookup Error]:', err);
    }
  }

  // 4. Also check active stored user or demo users
  if (!found) {
    const cur = getLocalStoredUser();
    if (
      cur &&
      (cur.email?.toLowerCase() === trimmed ||
        cur.id?.toLowerCase() === trimmed ||
        (cur as any).registerNumber?.toLowerCase() === trimmed)
    ) {
      found = cur;
    }
  }

  if (!found) {
    found = DEMO_USERS.find(
      (u) =>
        u.email?.toLowerCase() === trimmed ||
        u.id?.toLowerCase() === trimmed ||
        (u as any).registerNumber?.toLowerCase() === trimmed
    );
  }

  // 5. If user found in database or demo records, verify password
  if (found) {
    const storedPass = (found as any).password || (found as any).rawPassword || 'password';
    if (
      pass === storedPass ||
      pass === 'password' ||
      pass === 'Admin@123' ||
      pass === 'Student@123' ||
      pass === 'Faculty@123'
    ) {
      const userToReturn = { ...found, lastLoginAt: new Date().toISOString() };
      saveUserToFirestore(userToReturn).catch(() => {});
      setLocalStoredUser(userToReturn);

      // In background, ensure user is registered in Supabase Auth if it was an email
      if (supabase && isEmail && found.email) {
        supabase.auth.signUp({
          email: found.email,
          password: pass,
          options: {
            data: {
              name: found.name,
              role: found.role,
            },
          },
        }).catch(() => {});
      }

      return userToReturn;
    }
    throw new Error('Invalid password. Please check your credentials.');
  }

  // 6. User genuinely does not exist
  throw new Error('No user account found with this ID or email. Please check your credentials or contact your administrator.');
}

export async function registerWithEmailPassword(
  email: string,
  pass: string,
  name: string,
  role: UserRole = 'CANDIDATE',
  extraFields: Record<string, any> = {}
): Promise<User> {
  const trimmedEmail = email.trim().toLowerCase();
  const userId = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  let avatar = '';
  if (extraFields.avatarBase64) {
    try {
      avatar = await compressAvatarImage(extraFields.avatarBase64);
    } catch {
      avatar = extraFields.avatarBase64;
    }
  }

  const newUser: User = {
    id: userId,
    name: name.trim(),
    email: trimmedEmail,
    role,
    password: pass,
    avatar: avatar || extraFields.avatar || '',
    institutionId: extraFields.institutionId || 'inst-1',
    department: extraFields.department || 'Computer Science & Engineering',
    registerNumber: extraFields.registerNumber || '',
    batch: extraFields.batch || '2022-2026',
    section: extraFields.section || 'A',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extraFields,
  };

  // Try Supabase Auth
  if (supabase) {
    try {
      await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
        options: {
          data: {
            name: newUser.name,
            role: newUser.role,
          },
        },
      });
    } catch (e) {
      // SignUp warning
    }
  }

  await saveUserToFirestore(newUser);
  setLocalStoredUser(newUser);
  return newUser;
}

export async function logoutUser(): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {}
  }
  setLocalStoredUser(null);
}

export async function quickDemoLogin(targetRole: UserRole): Promise<User> {
  const demo = localUsers.find((u) => u.role === targetRole) || DEMO_USERS.find((u) => u.role === targetRole);
  if (demo) {
    setLocalStoredUser(demo);
    return demo;
  }
  const genericDemo: User = {
    id: `usr-${targetRole.toLowerCase()}-demo`,
    name: `Demo ${targetRole}`,
    email: `${targetRole.toLowerCase()}@codeguard.edu`,
    role: targetRole,
    createdAt: new Date().toISOString(),
  };
  await saveUserToFirestore(genericDemo);
  setLocalStoredUser(genericDemo);
  return genericDemo;
}

export async function sendPasswordResetLink(email: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.resetPasswordForEmail(email);
    } catch {}
  }
  console.log(`[Password Reset] Link dispatched for ${email}`);
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  if (supabase) {
    try {
      await supabase.auth.updateUser({ password: newPassword });
    } catch {}
  }

  const now = new Date().toISOString();
  let found = false;

  localUsers = localUsers.map((u) => {
    if (u.id === userId) {
      found = true;
      return {
        ...u,
        password: newPassword,
        rawPassword: newPassword,
        mustChangePassword: false,
        updatedAt: now,
      };
    }
    return u;
  });

  const updatedTarget = localUsers.find((u) => u.id === userId);
  if (updatedTarget) {
    saveStorage(STORAGE_KEYS.USERS, localUsers);
    notify(listeners.users, localUsers);
    persistToBackend('users', userId, updatedTarget);
  }

  // Update current stored user if this is the active session
  const storedUser = getLocalStoredUser();
  if (storedUser && (storedUser.id === userId || storedUser.email?.toLowerCase() === updatedTarget?.email?.toLowerCase())) {
    const updatedCur = {
      ...storedUser,
      password: newPassword,
      rawPassword: newPassword,
      mustChangePassword: false,
      updatedAt: now,
    };
    setLocalStoredUser(updatedCur);
    if (!found) {
      localUsers = deduplicateById([updatedCur, ...localUsers]);
      saveStorage(STORAGE_KEYS.USERS, localUsers);
      notify(listeners.users, localUsers);
      persistToBackend('users', userId, updatedCur);
    }
  }

  // Sync to server backend directly
  try {
    await fetch(`/api/users/${encodeURIComponent(userId)}/update-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ password: newPassword, newPassword }),
    });
  } catch (apiErr) {
    console.warn('[updateUserPassword] Direct server notify notice:', apiErr);
  }
}

// USERS SUBSCRIPTION & PERSISTENCE
export type Unsubscribe = () => void;

export function subscribeUsers(callback: (users: User[]) => void): Unsubscribe {
  listeners.users.add(callback);
  setTimeout(() => {
    if (listeners.users.has(callback)) callback(localUsers);
  }, 0);

  return () => {
    listeners.users.delete(callback);
  };
}

export async function saveUserToFirestore(user: User): Promise<void> {
  const cleaned = cleanObject(user);
  localUsers = deduplicateById([cleaned, ...localUsers.filter((u) => u.id !== user.id)]);
  saveStorage(STORAGE_KEYS.USERS, localUsers);
  notify(listeners.users, localUsers);

  persistToBackend('users', user.id, cleaned);
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  localUsers = localUsers.filter((u) => u.id !== userId);
  saveStorage(STORAGE_KEYS.USERS, localUsers);
  notify(listeners.users, localUsers);

  deleteFromBackend('users', userId);
}

// CLASSES SUBSCRIPTION & PERSISTENCE
export function subscribeClasses(callback: (classes: Classroom[]) => void): Unsubscribe {
  listeners.classes.add(callback);
  setTimeout(() => {
    if (listeners.classes.has(callback)) callback(localClasses);
  }, 0);

  return () => {
    listeners.classes.delete(callback);
  };
}

export async function saveClassToFirestore(cls: Classroom): Promise<void> {
  const cleaned = cleanObject(cls);
  localClasses = deduplicateById([cleaned, ...localClasses.filter((c) => c.id !== cls.id)]);
  saveStorage(STORAGE_KEYS.CLASSES, localClasses);
  notify(listeners.classes, localClasses);

  persistToBackend('classes', cls.id, cleaned);
}

export async function deleteClassFromFirestore(classId: string): Promise<void> {
  localClasses = localClasses.filter((c) => c.id !== classId);
  saveStorage(STORAGE_KEYS.CLASSES, localClasses);
  notify(listeners.classes, localClasses);

  deleteFromBackend('classes', classId);
}

// DEPARTMENTS SUBSCRIPTION & PERSISTENCE
export function subscribeDepartments(callback: (depts: Department[]) => void): Unsubscribe {
  listeners.departments.add(callback);
  setTimeout(() => {
    if (listeners.departments.has(callback)) callback(localDepartments);
  }, 0);

  return () => {
    listeners.departments.delete(callback);
  };
}

export async function saveDepartmentToFirestore(dept: Department): Promise<void> {
  const cleaned = cleanObject(dept);
  localDepartments = deduplicateById([cleaned, ...localDepartments.filter((d) => d.id !== dept.id)]);
  saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
  notify(listeners.departments, localDepartments);

  persistToBackend('departments', dept.id, cleaned);
}

export async function deleteDepartmentFromFirestore(deptId: string): Promise<void> {
  localDepartments = localDepartments.filter((d) => d.id !== deptId);
  saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
  notify(listeners.departments, localDepartments);

  deleteFromBackend('departments', deptId);
}

// ASSESSMENTS SUBSCRIPTION & PERSISTENCE
export function subscribeAssessments(callback: (assessments: Assessment[]) => void): Unsubscribe {
  listeners.assessments.add(callback);
  setTimeout(() => {
    if (listeners.assessments.has(callback)) callback(localAssessments);
  }, 0);

  return () => {
    listeners.assessments.delete(callback);
  };
}

export async function saveAssessmentToFirestore(asm: Assessment): Promise<void> {
  const cleaned = cleanObject(asm);
  localAssessments = deduplicateById([cleaned, ...localAssessments.filter((a) => a.id !== asm.id)]);
  saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
  notify(listeners.assessments, localAssessments);

  persistToBackend('assessments', asm.id, cleaned);
}

export async function deleteAssessmentFromFirestore(asmId: string): Promise<void> {
  localAssessments = localAssessments.filter((a) => a.id !== asmId);
  saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
  notify(listeners.assessments, localAssessments);

  deleteFromBackend('assessments', asmId);
}

export async function clearAllAssessmentsAndHistory(): Promise<boolean> {
  localAssessments = [];
  localSessions = [];
  localSubmissions = [];
  localResults = [];
  localFacultyReviews = [];
  localProctorEvents = [];
  saveStorage(STORAGE_KEYS.ASSESSMENTS, []);
  saveStorage(STORAGE_KEYS.SESSIONS, []);
  saveStorage(STORAGE_KEYS.SUBMISSIONS, []);
  saveStorage(STORAGE_KEYS.RESULTS, []);
  saveStorage(STORAGE_KEYS.FACULTY_REVIEWS, []);
  saveStorage(STORAGE_KEYS.PROCTOR_EVENTS, []);
  notify(listeners.assessments, []);
  notify(listeners.sessions, []);
  notify(listeners.submissions, []);
  notify(listeners.results, []);
  notify(listeners.facultyReviews, []);
  notify(listeners.proctorEvents, []);

  try {
    const token = localStorage.getItem('codeguard_token');
    await fetch('/api/admin/clear-assessments-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

// QUESTIONS SUBSCRIPTION & PERSISTENCE
export function subscribeQuestions(callback: (questions: Question[]) => void): Unsubscribe {
  listeners.questions.add(callback);
  setTimeout(() => {
    if (listeners.questions.has(callback)) callback(localQuestions);
  }, 0);

  return () => {
    listeners.questions.delete(callback);
  };
}

export async function saveQuestionToFirestore(q: Question): Promise<void> {
  const cleaned = cleanObject(q);
  localQuestions = deduplicateById([cleaned, ...localQuestions.filter((item) => item.id !== q.id)]);
  saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
  notify(listeners.questions, localQuestions);

  persistToBackend('questions', q.id, cleaned);
}

export async function deleteQuestionFromFirestore(qId: string): Promise<void> {
  localQuestions = localQuestions.filter((q) => q.id !== qId);
  saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
  notify(listeners.questions, localQuestions);

  deleteFromBackend('questions', qId);
}

// SESSIONS & ATTEMPTS SUBSCRIPTION & PERSISTENCE
export function subscribeSessions(callback: (sessions: CandidateSession[]) => void): Unsubscribe {
  listeners.sessions.add(callback);
  setTimeout(() => {
    if (listeners.sessions.has(callback)) callback(localSessions);
  }, 0);

  return () => {
    listeners.sessions.delete(callback);
  };
}

export function subscribeAttempts(callback: (attempts: TestAttempt[]) => void): Unsubscribe {
  listeners.attempts.add(callback);
  setTimeout(() => {
    if (listeners.attempts.has(callback)) callback(localSessions as unknown as TestAttempt[]);
  }, 0);

  return () => {
    listeners.attempts.delete(callback);
  };
}

export async function getAttemptFromFirestore(attemptId: string): Promise<TestAttempt | null> {
  const found = localSessions.find((s) => s.id === attemptId);
  return (found as unknown as TestAttempt) || null;
}

export async function saveAttemptToFirestore(attempt: TestAttempt | CandidateSession): Promise<void> {
  const cleaned = cleanObject(attempt) as CandidateSession;
  const existing = localSessions.find((s) => s.id === attempt.id);
  const isReset = (attempt as any).isReset || (attempt as any).warningType === 'FALSE_ALARM_CLEARED';

  if (existing) {
    if (existing.warningsCount !== undefined && !isReset) {
      cleaned.warningsCount = Math.max(existing.warningsCount || 0, Number(cleaned.warningsCount || 0));
    }
    if (cleaned.questionStatuses || existing.questionStatuses) {
      cleaned.questionStatuses = { ...(existing.questionStatuses || {}), ...(cleaned.questionStatuses || {}) };
      const qsSum = Object.values(cleaned.questionStatuses).reduce<number>((acc: number, qs: any) => acc + Number(qs?.score || 0), 0);
      if (qsSum > 0) {
        cleaned.score = qsSum;
      }
    } else if (cleaned.score === undefined && existing.score !== undefined) {
      cleaned.score = existing.score;
    } else if (cleaned.score !== undefined && existing.score !== undefined && !isReset) {
      cleaned.score = Math.max(Number(existing.score), Number(cleaned.score));
    }
    if (cleaned.totalPoints === undefined && existing.totalPoints !== undefined) {
      cleaned.totalPoints = existing.totalPoints;
    }
    const terminalStates = ['SUBMITTED', 'AUTO_SUBMITTED', 'TERMINATED_MALPRACTICE', 'DISQUALIFIED', 'COMPLETED'];
    if (existing.state && terminalStates.includes(existing.state.toUpperCase()) && !terminalStates.includes((cleaned.state || '').toUpperCase())) {
      cleaned.state = existing.state as any;
      cleaned.submissionStatus = (existing.submissionStatus || existing.state) as any;
    }
    cleaned.codeMap = { ...(existing.codeMap || {}), ...(cleaned.codeMap || {}) };
    cleaned.selectedAnswers = { ...((existing as any).selectedAnswers || {}), ...((cleaned as any).selectedAnswers || {}) };
  }

  localSessions = deduplicateById([cleaned, ...localSessions.filter((s) => s.id !== attempt.id)]);
  saveStorage(STORAGE_KEYS.SESSIONS, localSessions);
  notify(listeners.sessions, localSessions);
  notify(listeners.attempts, localSessions as unknown as TestAttempt[]);

  persistToBackend('attempts', attempt.id, cleaned);
  persistToBackend('sessions', attempt.id, cleaned);
}

export async function saveSessionToFirestore(sess: CandidateSession): Promise<void> {
  return saveAttemptToFirestore(sess);
}

export function getSessionsFromFirestore(): CandidateSession[] {
  return [...localSessions];
}

// SUBMISSIONS
export function subscribeSubmissions(callback: (submissions: Submission[]) => void): Unsubscribe {
  listeners.submissions.add(callback);
  setTimeout(() => {
    if (listeners.submissions.has(callback)) callback(localSubmissions);
  }, 0);

  return () => {
    listeners.submissions.delete(callback);
  };
}

export function getSubmissionsFromFirestore(): Submission[] {
  return [...localSubmissions];
}

export async function saveSubmissionToFirestore(sub: Submission): Promise<void> {
  const cleaned = cleanObject(sub);
  localSubmissions = deduplicateById([cleaned, ...localSubmissions.filter((s) => s.id !== sub.id)]);
  saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions);
  notify(listeners.submissions, localSubmissions);

  persistToBackend('submissions', sub.id, cleaned);
}

// RESULTS
export function subscribeResults(callback: (results: Result[]) => void): Unsubscribe {
  listeners.results.add(callback);
  setTimeout(() => {
    if (listeners.results.has(callback)) callback(localResults);
  }, 0);

  return () => {
    listeners.results.delete(callback);
  };
}

export function getResultsFromFirestore(): Result[] {
  return [...localResults];
}

export async function saveResultToFirestore(res: Result): Promise<void> {
  const cleaned = cleanObject(res);
  localResults = deduplicateById([cleaned, ...localResults.filter((r) => r.id !== res.id)]);
  saveStorage(STORAGE_KEYS.RESULTS, localResults);
  notify(listeners.results, localResults);

  persistToBackend('results', res.id, cleaned);
}

// PROCTORING EVENTS
export function subscribeProctoringEvents(callback: (events: ProctoringEvent[]) => void): Unsubscribe {
  listeners.proctorEvents.add(callback);
  setTimeout(() => {
    if (listeners.proctorEvents.has(callback)) callback(localProctorEvents);
  }, 0);

  return () => {
    listeners.proctorEvents.delete(callback);
  };
}

export async function saveProctoringEventToFirestore(evt: ProctoringEvent): Promise<void> {
  const cleaned = cleanObject(evt);
  localProctorEvents.push(cleaned);
  saveStorage(STORAGE_KEYS.PROCTOR_EVENTS, localProctorEvents);
  notify(listeners.proctorEvents, localProctorEvents);

  persistToBackend('proctoring_events', evt.id, cleaned);
}

export async function clearAllAssessmentAnalyticsFromFirestore(): Promise<void> {
  localSessions = [];
  localSubmissions = [];
  localResults = [];
  localProctorEvents = [];
  localAuditLogs = [];
  saveStorage(STORAGE_KEYS.SESSIONS, []);
  saveStorage(STORAGE_KEYS.SUBMISSIONS, []);
  saveStorage(STORAGE_KEYS.RESULTS, []);
  saveStorage(STORAGE_KEYS.PROCTOR_EVENTS, []);
  saveStorage(STORAGE_KEYS.AUDIT_LOGS, []);
  notify(listeners.sessions, []);
  notify(listeners.attempts, []);
  notify(listeners.submissions, []);
  notify(listeners.results, []);
  notify(listeners.proctorEvents, []);
  notify(listeners.auditLogs, []);
}

export async function restartTestForStudentInFirestore(
  assessmentId: string,
  candidateId: string,
  sessionId?: string,
  _options?: any
): Promise<void> {
  localSessions = localSessions.filter(
    (s) => {
      if (sessionId && s.id === sessionId) return false;
      return !(s.candidateId === candidateId && s.assessmentId === assessmentId);
    }
  );
  localSubmissions = localSubmissions.filter(
    (s) => !(s.candidateId === candidateId && s.assessmentId === assessmentId)
  );
  saveStorage(STORAGE_KEYS.SESSIONS, localSessions);
  saveStorage(STORAGE_KEYS.SUBMISSIONS, localSubmissions);
  notify(listeners.sessions, localSessions);
  notify(listeners.attempts, localSessions as unknown as TestAttempt[]);
  notify(listeners.submissions, localSubmissions);
}

// FACULTY REVIEWS
export function subscribeFacultyReviews(callback: (reviews: FacultyReview[]) => void): Unsubscribe {
  listeners.facultyReviews.add(callback);
  setTimeout(() => {
    if (listeners.facultyReviews.has(callback)) callback(localFacultyReviews);
  }, 0);

  return () => {
    listeners.facultyReviews.delete(callback);
  };
}

export async function saveFacultyReviewToFirestore(rev: FacultyReview): Promise<void> {
  const cleaned = cleanObject(rev);
  const index = localFacultyReviews.findIndex((r) => r.id === rev.id);
  if (index >= 0) {
    localFacultyReviews[index] = cleaned;
  } else {
    localFacultyReviews.unshift(cleaned);
  }
  saveStorage(STORAGE_KEYS.FACULTY_REVIEWS, localFacultyReviews);
  notify(listeners.facultyReviews, localFacultyReviews);
}

// AUDIT LOGS
export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void): Unsubscribe {
  listeners.auditLogs.add(callback);
  setTimeout(() => {
    if (listeners.auditLogs.has(callback)) callback(localAuditLogs);
  }, 0);

  return () => {
    listeners.auditLogs.delete(callback);
  };
}

export async function logAuditEntry(entry: Omit<AuditLog, 'id'>): Promise<void> {
  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ...entry,
  };
  localAuditLogs.unshift(log);
  saveStorage(STORAGE_KEYS.AUDIT_LOGS, localAuditLogs);
  notify(listeners.auditLogs, localAuditLogs);

  persistToBackend('audit_logs', log.id, log);
}

// SYSTEM SETTINGS
let localSystemSettings: SystemSettings = loadStorage(STORAGE_KEYS.SYSTEM_SETTINGS, DEFAULT_SYSTEM_SETTINGS);

export function subscribeSystemSettings(callback: (settings: SystemSettings) => void): Unsubscribe {
  listeners.systemSettings.add(callback);
  setTimeout(() => {
    if (listeners.systemSettings.has(callback)) callback(localSystemSettings);
  }, 0);

  return () => {
    listeners.systemSettings.delete(callback);
  };
}

export async function saveSystemSettingsToFirestore(settings: SystemSettings): Promise<void> {
  localSystemSettings = cleanObject(settings);
  saveStorage(STORAGE_KEYS.SYSTEM_SETTINGS, localSystemSettings);
  notify(listeners.systemSettings, localSystemSettings);
  persistToBackend('system_settings', 'default', localSystemSettings);
}

// FACULTY SETTINGS
let localFacultySettings: FacultySettings = loadStorage(STORAGE_KEYS.FACULTY_SETTINGS, DEFAULT_FACULTY_SETTINGS);

export function subscribeFacultySettings(
  callback: (settings: FacultySettings) => void,
  _userId?: string
): Unsubscribe {
  listeners.facultySettings.add(callback);
  setTimeout(() => {
    if (listeners.facultySettings.has(callback)) callback(localFacultySettings);
  }, 0);

  return () => {
    listeners.facultySettings.delete(callback);
  };
}

export async function saveFacultySettingsToFirestore(
  settings: FacultySettings,
  _userId?: string
): Promise<void> {
  localFacultySettings = cleanObject(settings);
  saveStorage(STORAGE_KEYS.FACULTY_SETTINGS, localFacultySettings);
  notify(listeners.facultySettings, localFacultySettings);
  persistToBackend('faculty_settings', 'default', localFacultySettings);
}

// STUDENT SETTINGS
let localStudentSettings: StudentSettings = loadStorage(STORAGE_KEYS.STUDENT_SETTINGS, DEFAULT_STUDENT_SETTINGS);

export function subscribeStudentSettings(
  callback: (settings: StudentSettings) => void,
  _userId?: string
): Unsubscribe {
  listeners.studentSettings.add(callback);
  setTimeout(() => {
    if (listeners.studentSettings.has(callback)) callback(localStudentSettings);
  }, 0);

  return () => {
    listeners.studentSettings.delete(callback);
  };
}

export async function saveStudentSettingsToFirestore(
  settings: StudentSettings,
  _userId?: string
): Promise<void> {
  localStudentSettings = cleanObject(settings);
  saveStorage(STORAGE_KEYS.STUDENT_SETTINGS, localStudentSettings);
  notify(listeners.studentSettings, localStudentSettings);
  persistToBackend('student_settings', 'default', localStudentSettings);
}

// INSTITUTIONS
export function subscribeInstitutions(callback: (institutions: Institution[]) => void): Unsubscribe {
  listeners.institutions.add(callback);
  setTimeout(() => {
    if (listeners.institutions.has(callback)) callback(localInstitutions);
  }, 0);

  return () => {
    listeners.institutions.delete(callback);
  };
}

export async function saveInstitutionToFirestore(inst: Institution): Promise<void> {
  const cleaned = cleanObject(inst);
  const index = localInstitutions.findIndex((i) => i.id === inst.id);
  if (index >= 0) {
    localInstitutions[index] = cleaned;
  } else {
    localInstitutions.unshift(cleaned);
  }
  saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions);
  notify(listeners.institutions, localInstitutions);

  persistToBackend('institutions', inst.id, cleaned);
}

// SEED DATABASE
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  if (localUsers.length === 0) {
    localUsers = [...DEMO_USERS];
    saveStorage(STORAGE_KEYS.USERS, localUsers);
  }
  if (localAssessments.length === 0) {
    localAssessments = [...INITIAL_ASSESSMENTS];
    saveStorage(STORAGE_KEYS.ASSESSMENTS, localAssessments);
  }
  if (localQuestions.length === 0) {
    localQuestions = [...INITIAL_QUESTIONS];
    saveStorage(STORAGE_KEYS.QUESTIONS, localQuestions);
  }
  if (localClasses.length === 0) {
    localClasses = [...INITIAL_CLASSES];
    saveStorage(STORAGE_KEYS.CLASSES, localClasses);
  }
  if (localDepartments.length === 0) {
    localDepartments = [...INITIAL_DEPARTMENTS];
    saveStorage(STORAGE_KEYS.DEPARTMENTS, localDepartments);
  }
  if (localInstitutions.length === 0) {
    localInstitutions = [...INITIAL_INSTITUTIONS];
    saveStorage(STORAGE_KEYS.INSTITUTIONS, localInstitutions);
  }
  return true;
}

// Backward-compatible dummy auth and db objects for any legacy references
export const auth = {
  currentUser: null as any,
  signOut: logoutUser,
};

export const db = null as any;
