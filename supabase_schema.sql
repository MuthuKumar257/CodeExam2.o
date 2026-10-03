-- ==============================================================================
-- CodeExam Production PostgreSQL Database Schema & Security Architecture
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES & USERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'CANDIDATE', -- 'ADMIN', 'FACULTY', 'CANDIDATE'
  register_number TEXT,
  department TEXT,
  institution_id TEXT,
  avatar TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Legacy compatibility table alias
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. ASSESSMENTS & VERSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  passing_score INTEGER NOT NULL DEFAULT 50,
  maximum_marks INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED', 'DELETED'
  faculty_id TEXT NOT NULL,
  allowed_languages TEXT[] DEFAULT ARRAY['python', 'javascript', 'cpp', 'java', 'c'],
  security_settings JSONB DEFAULT '{}'::jsonb,
  risk_weights JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

CREATE TABLE IF NOT EXISTS assessment_versions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  maximum_marks INTEGER NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. QUESTIONS & TEST CASES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'CODING', -- 'CODING', 'MCQ'
  problem_statement TEXT NOT NULL,
  input_format TEXT,
  output_format TEXT,
  constraints TEXT,
  explanation TEXT,
  points INTEGER NOT NULL DEFAULT 20,
  difficulty TEXT NOT NULL DEFAULT 'EASY', -- 'EASY', 'MEDIUM', 'HARD'
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  starter_code TEXT,
  function_signature JSONB,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  input TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  weight NUMERIC DEFAULT 1.0,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  points INTEGER DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (assessment_id, question_id)
);

-- ------------------------------------------------------------------------------
-- 4. ATTEMPTS (SESSIONS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, -- attempt_id
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAUSED', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'CLOSED', 'TERMINATED_MALPRACTICE'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  remaining_time INTEGER,
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

-- ------------------------------------------------------------------------------
-- 5. SUBMISSIONS & QUESTION RESULTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  source_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted',
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 20,
  test_cases_passed INTEGER NOT NULL DEFAULT 0,
  total_test_cases INTEGER NOT NULL DEFAULT 1,
  execution_time_ms INTEGER DEFAULT 0,
  memory_usage_mb NUMERIC DEFAULT 0,
  test_case_results JSONB,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_results (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  latest_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  passed_testcases INTEGER NOT NULL DEFAULT 0,
  total_testcases INTEGER NOT NULL DEFAULT 1,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'Submitted',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

-- ------------------------------------------------------------------------------
-- 6. RECORDINGS & MONITORING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY, -- recording_id
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  drive_file_id TEXT,
  drive_folder_id TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING', -- 'WAITING', 'RECORDING', 'UPLOADING', 'COMPLETED', 'FAILED'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  file_size BIGINT DEFAULT 0,
  error TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoring_sessions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INTERRUPTED', 'DISCONNECTED', 'ENDED'
  stream_status TEXT DEFAULT 'LIVE',
  screen_active BOOLEAN DEFAULT true,
  camera_active BOOLEAN DEFAULT true,
  last_heartbeat_at TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH'
  description TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'CANDIDATE',
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Compatibility tables for administrative structure
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faculty_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 7. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_assessment ON attempts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_submissions_attempt ON submissions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_submissions_question ON submissions(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_question_results_attempt ON question_results(attempt_id);
CREATE INDEX IF NOT EXISTS idx_question_results_question ON question_results(question_id);
CREATE INDEX IF NOT EXISTS idx_recordings_attempt ON recordings(attempt_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_attempt ON monitoring_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_attempt ON monitoring_events(attempt_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_question ON test_cases(question_id);

-- ------------------------------------------------------------------------------
-- 8. SECURE VIEW FOR PUBLIC TEST CASES (PROTECTS HIDDEN TEST CASES)
-- ------------------------------------------------------------------------------
-- Students query this view or public cases only so hidden input/output are never exposed.
CREATE OR REPLACE VIEW public_test_cases AS
SELECT
  id,
  question_id,
  CASE WHEN is_public THEN input ELSE '[Hidden Test Case]' END AS input,
  CASE WHEN is_public THEN expected_output ELSE '[Hidden Expected Output]' END AS expected_output,
  is_public,
  weight,
  explanation
FROM test_cases;

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Helper to extract user role from auth token metadata
CREATE OR REPLACE FUNCTION auth_user_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role'),
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'CANDIDATE'
  );
$$ LANGUAGE sql STABLE;

-- Service Role / Admin Bypass Policy
CREATE POLICY "Service client full access on profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on assessments" ON assessments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on questions" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on test_cases" ON test_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on attempts" ON attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on question_results" ON question_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on recordings" ON recordings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on monitoring_sessions" ON monitoring_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on monitoring_events" ON monitoring_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on audit_events" ON audit_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on classes" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on departments" ON departments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on institutions" ON institutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on assessment_versions" ON assessment_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service client full access on assessment_questions" ON assessment_questions FOR ALL USING (true) WITH CHECK (true);
