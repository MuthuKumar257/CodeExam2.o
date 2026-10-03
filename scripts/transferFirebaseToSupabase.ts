import 'dotenv/config';
import { assertDestructiveOperationAllowed } from '../backend/services/databaseSafety.js';
import { supabaseServer, isSupabaseConfigured, syncDataToSupabase } from '../server/supabaseServer';
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
} from '../src/data/seedData';

export async function runTransfer() {
  assertDestructiveOperationAllowed('seed/transfer');
  console.log('=====================================================');
  console.log('  STARTING SEED & DATA SYNC TO SUPABASE');
  console.log('=====================================================');

  if (!isSupabaseConfigured || !supabaseServer) {
    console.warn('⚠️ Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) are not set.');
    return {
      success: false,
      error: 'Supabase credentials missing',
    };
  }

  console.log('1. Preparing records for Supabase tables...');
  const users = DEMO_USERS;
  const assessments = INITIAL_ASSESSMENTS;
  const questions = INITIAL_QUESTIONS;
  const attempts = INITIAL_SESSIONS;
  const submissions = INITIAL_SUBMISSIONS;
  const classes = INITIAL_CLASSES;
  const departments = INITIAL_DEPARTMENTS;
  const institutions = INITIAL_INSTITUTIONS;
  const auditLogs = INITIAL_AUDIT_LOGS;

  console.log('2. Syncing datasets to Supabase tables...');
  const result = await syncDataToSupabase({
    users,
    assessments,
    questions,
    attempts,
    submissions,
    classes,
    departments,
    institutions,
    auditLogs,
  });

  console.log('=====================================================');
  console.log('  SYNC COMPLETE');
  console.log('  Result Summary:', JSON.stringify(result, null, 2));
  console.log('=====================================================');

  return {
    success: true,
    result,
  };
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].includes('transferFirebaseToSupabase')) {
  runTransfer()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Sync Error:', err);
      process.exit(1);
    });
}
