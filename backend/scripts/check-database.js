import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF || '';
const tables = [
  'users', 'profiles', 'assessments', 'questions', 'classes', 'departments',
  'sessions', 'attempts', 'submissions', 'institutions',
];

function fail(message) {
  console.error(`[DB Check] ${message}`);
  process.exitCode = 1;
}

let projectRef = '';
try {
  projectRef = new URL(url).hostname.split('.')[0];
} catch {
  fail('SUPABASE_URL is missing or invalid.');
}

if (!expectedRef || !/^[a-z0-9]{20}$/.test(expectedRef)) fail('SUPABASE_EXPECTED_PROJECT_REF must be set to the intended project reference.');
if (projectRef && expectedRef && projectRef !== expectedRef) fail('Configured Supabase URL does not match the expected project reference.');
if (!key || key.length < 10) fail('A server-side Supabase service key is required.');
if (process.exitCode) process.exit(1);

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`[DB Check] Read-only identity check for project ${projectRef}.`);
for (const table of tables) {
  const { data, count, error } = await client.from(table).select('id', { count: 'exact' }).limit(5);
  if (error) {
    console.error(`[DB Check] ${table}: query failed (${error.code || 'unknown'}).`);
    process.exitCode = 1;
  } else {
    const ids = (data || []).map((row) => String(row.id)).join(', ') || '(none)';
    console.log(`[DB Check] ${table}: ${count} rows; sample ids: ${ids}.`);
  }
}
