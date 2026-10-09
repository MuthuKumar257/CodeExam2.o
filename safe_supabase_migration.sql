-- ==============================================================================
-- CodeExam Safe Non-Destructive Supabase PostgreSQL Migration
-- Preserves all existing data, auth accounts, and schemas.
-- Enables all required tables in schema cache with full RLS and permissions.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. PROFILES TABLE (Authoritative user profiles linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'CANDIDATE', -- 'ADMIN', 'FACULTY', 'CANDIDATE', 'STUDENT'
  register_number TEXT,
  department TEXT DEFAULT 'Computer Science & Engineering',
  institution_id TEXT DEFAULT 'inst-01',
  avatar TEXT,
  password TEXT,
  class_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. USERS TABLE (Primary application users table for CodeExam Express API & PostgREST)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'CANDIDATE',
  register_number TEXT,
  department TEXT DEFAULT 'Computer Science & Engineering',
  institution_id TEXT DEFAULT 'inst-01',
  avatar TEXT,
  password TEXT,
  class_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ACADEMIC STRUCTURE (Classes, Departments, Institutions)
CREATE TABLE IF NOT EXISTS public.classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  code TEXT DEFAULT '',
  department TEXT DEFAULT '',
  semester INTEGER DEFAULT 1,
  academic_year TEXT DEFAULT '2025-2026',
  student_count INTEGER DEFAULT 0,
  staff_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  faculty_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  student_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  code TEXT DEFAULT '',
  head_of_department TEXT DEFAULT '',
  faculty_count INTEGER DEFAULT 0,
  student_count INTEGER DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  code TEXT DEFAULT '',
  location TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  established_year INTEGER DEFAULT 1997,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ASSESSMENTS & VERSIONS
CREATE TABLE IF NOT EXISTS public.assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  passing_score INTEGER NOT NULL DEFAULT 50,
  maximum_marks INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  faculty_id TEXT NOT NULL DEFAULT '',
  allowed_languages TEXT[] DEFAULT ARRAY['python', 'javascript', 'cpp', 'java', 'c'],
  security_settings JSONB DEFAULT '{}'::jsonb,
  risk_weights JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

CREATE TABLE IF NOT EXISTS public.tests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  passing_score INTEGER NOT NULL DEFAULT 50,
  maximum_marks INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  faculty_id TEXT NOT NULL DEFAULT '',
  allowed_languages TEXT[] DEFAULT ARRAY['python', 'javascript', 'cpp', 'java', 'c'],
  security_settings JSONB DEFAULT '{}'::jsonb,
  risk_weights JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_versions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  maximum_marks INTEGER NOT NULL DEFAULT 100,
  settings JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. QUESTIONS & TEST CASES
CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'CODING',
  problem_statement TEXT NOT NULL DEFAULT '',
  input_format TEXT DEFAULT '',
  output_format TEXT DEFAULT '',
  constraints TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  points INTEGER NOT NULL DEFAULT 20,
  difficulty TEXT NOT NULL DEFAULT 'EASY',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  starter_code TEXT DEFAULT '',
  function_signature JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.testcases (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  expected_output TEXT NOT NULL DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  weight NUMERIC DEFAULT 1.0,
  explanation TEXT DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_cases (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  expected_output TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT true,
  weight NUMERIC DEFAULT 1.0,
  explanation TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. SESSIONS & ATTEMPTS
CREATE TABLE IF NOT EXISTS public.sessions (
  id TEXT PRIMARY KEY,
  test_id TEXT,
  assessment_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  candidate_id TEXT,
  candidate_name TEXT DEFAULT '',
  candidate_email TEXT DEFAULT '',
  candidate_register_no TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  attempt_status TEXT DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMPTZ DEFAULT now(),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  remaining_time INTEGER DEFAULT 3600,
  final_score NUMERIC DEFAULT 0,
  total_points NUMERIC DEFAULT 100,
  warnings_count INTEGER DEFAULT 0,
  tab_switch_count INTEGER DEFAULT 0,
  copy_paste_count INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  risk_category TEXT DEFAULT 'NORMAL',
  connection_status TEXT DEFAULT 'connected',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  remaining_time INTEGER DEFAULT 3600,
  final_score NUMERIC DEFAULT 0,
  total_points NUMERIC DEFAULT 100,
  warnings_count INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  risk_category TEXT DEFAULT 'NORMAL',
  exit_reason TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. SUBMISSIONS & QUESTION RESULTS
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  session_id TEXT,
  assessment_id TEXT,
  test_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  question_id TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'python',
  source_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Submitted',
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 20,
  test_cases_passed INTEGER NOT NULL DEFAULT 0,
  total_test_cases INTEGER NOT NULL DEFAULT 1,
  execution_time_ms INTEGER DEFAULT 0,
  memory_usage_mb NUMERIC DEFAULT 0,
  test_case_results JSONB DEFAULT '[]'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  session_id TEXT,
  question_id TEXT NOT NULL,
  latest_submission_id TEXT,
  passed_testcases INTEGER NOT NULL DEFAULT 0,
  total_testcases INTEGER NOT NULL DEFAULT 1,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'Submitted',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. SETTINGS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  institution_name TEXT DEFAULT 'CodeExam Technical University',
  allow_registrations BOOLEAN DEFAULT true,
  maintenance_mode BOOLEAN DEFAULT false,
  session_timeout_minutes INTEGER DEFAULT 120,
  max_concurrent_sessions INTEGER DEFAULT 1000,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faculty_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT 'CANDIDATE',
  action TEXT NOT NULL DEFAULT '',
  details TEXT DEFAULT '',
  ip_address TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.monitoring_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  session_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  assessment_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  stream_status TEXT DEFAULT 'LIVE',
  screen_active BOOLEAN DEFAULT true,
  camera_active BOOLEAN DEFAULT true,
  last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.monitoring_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  session_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  assessment_id TEXT,
  type TEXT NOT NULL DEFAULT 'INFO',
  severity TEXT NOT NULL DEFAULT 'LOW',
  description TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.recordings (
  id TEXT PRIMARY KEY,
  attempt_id TEXT,
  session_id TEXT,
  student_id TEXT NOT NULL DEFAULT '',
  assessment_id TEXT,
  drive_file_id TEXT,
  drive_folder_id TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  file_size BIGINT DEFAULT 0,
  error TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testcases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- 11. POLICIES: SERVICE ROLE & CLIENT ACCESS
DO $$
BEGIN
  -- Service Role Full Access Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_profiles') THEN
    CREATE POLICY service_role_full_profiles ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_users') THEN
    CREATE POLICY service_role_full_users ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_classes') THEN
    CREATE POLICY service_role_full_classes ON public.classes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_departments') THEN
    CREATE POLICY service_role_full_departments ON public.departments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_institutions') THEN
    CREATE POLICY service_role_full_institutions ON public.institutions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_assessments') THEN
    CREATE POLICY service_role_full_assessments ON public.assessments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_tests') THEN
    CREATE POLICY service_role_full_tests ON public.tests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_questions') THEN
    CREATE POLICY service_role_full_questions ON public.questions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_sessions') THEN
    CREATE POLICY service_role_full_sessions ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_full_submissions') THEN
    CREATE POLICY service_role_full_submissions ON public.submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Authenticated and Anon Read Policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_users') THEN
    CREATE POLICY client_read_users ON public.users FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_classes') THEN
    CREATE POLICY client_read_classes ON public.classes FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_departments') THEN
    CREATE POLICY client_read_departments ON public.departments FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_institutions') THEN
    CREATE POLICY client_read_institutions ON public.institutions FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_assessments') THEN
    CREATE POLICY client_read_assessments ON public.assessments FOR SELECT TO anon, authenticated USING (is_deleted = false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'client_read_questions') THEN
    CREATE POLICY client_read_questions ON public.questions FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 12. PERMISSIONS GRANTS (Exposes tables to PostgREST)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 13. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

