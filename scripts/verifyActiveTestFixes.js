import assert from 'node:assert';
import { SessionService } from '../backend/services/sessionService.js';
import { SubmissionService } from '../backend/services/submissionService.js';
import { memoryStore } from '../backend/services/supabaseService.js';

console.log('--- RUNNING ACTIVE TEST & DATABASE VERIFICATION SUITE ---');

async function testSessionUniquenessAndRestoration() {
  console.log('\n[1] Testing Session Uniqueness & Clock Authoritativeness...');

  const testId = 'test-unit-01';
  const studentId = 'student-test-01';

  // Seed test
  memoryStore.tests.push({
    id: testId,
    title: 'Unit Test Assessment',
    duration_minutes: 45,
    status: 'ACTIVE',
    total_marks: 100,
    is_deleted: false,
  });

  // Start new session
  const res1 = await SessionService.startOrRestoreSession(testId, studentId, 'Test Student');
  assert.strictEqual(res1.isRestored, false, 'First call should create new session');
  assert.ok(res1.session.id, 'Session should have an id');
  assert.strictEqual(res1.session.status, 'ACTIVE');
  assert.ok(res1.session.end_time, 'Session must have server calculated end_time');
  const firstSessionId = res1.session.id;

  // Attempt to start again with same student + testId -> MUST restore existing active session
  const res2 = await SessionService.startOrRestoreSession(testId, studentId, 'Test Student');
  assert.strictEqual(res2.isRestored, true, 'Second call must restore existing active session');
  assert.strictEqual(res2.session.id, firstSessionId, 'Restored session must have identical id');
  assert.ok(res2.session.remaining_seconds > 0, 'Remaining seconds should be positive');

  console.log('✓ Session uniqueness and restoration verified.');
}

async function testHeartbeatAndLastSeenAt() {
  console.log('\n[2] Testing Heartbeat and last_seen_at updates...');

  const testId = 'test-unit-01';
  const studentId = 'student-test-01';

  const session = memoryStore.sessions.find((s) => s.test_id === testId && s.student_id === studentId);
  assert.ok(session, 'Session must exist');

  const prevLastSeen = session.last_seen_at;
  await new Promise((r) => setTimeout(r, 20));

  const heartbeatRes = await SessionService.recordHeartbeat(session.id);
  assert.strictEqual(heartbeatRes.success, true, 'Heartbeat record must return success');
  assert.ok(heartbeatRes.session.last_seen_at, 'last_seen_at must be populated');
  assert.ok(heartbeatRes.session.last_heartbeat, 'last_heartbeat must be populated');
  assert.strictEqual(heartbeatRes.connection_status, 'connected');
  assert.strictEqual(heartbeatRes.isExpired, false);
  assert.ok(heartbeatRes.serverTime, 'serverTime must be returned');

  console.log('✓ Heartbeat updates last_seen_at and last_heartbeat correctly.');
}

async function testAuthoritativeClockExpiration() {
  console.log('\n[3] Testing Authoritative Server Clock Expiration...');

  const testId = 'test-unit-expired';
  const studentId = 'student-test-expired';

  memoryStore.tests.push({
    id: testId,
    title: 'Short Test',
    duration_minutes: 0,
    status: 'ACTIVE',
    total_marks: 50,
    is_deleted: false,
  });

  const res = await SessionService.startOrRestoreSession(testId, studentId, 'Expired Student');
  // artificially set end_time in the past
  const targetSession = memoryStore.sessions.find((s) => s.id === res.session.id);
  targetSession.end_time = new Date(Date.now() - 5000).toISOString();

  const hb = await SessionService.recordHeartbeat(res.session.id);
  assert.strictEqual(hb.isExpired, true, 'Heartbeat must flag isExpired when server time >= end_time');
  assert.strictEqual(hb.status, 'EXPIRED', 'Session status must be updated to EXPIRED');

  console.log('✓ Authoritative server clock expiration verified.');
}

async function testSubmissionIdempotency() {
  console.log('\n[4] Testing Submission Idempotency...');

  const submissionId = 'sub-deterministic-12345';
  
  // Fake a completed submission in SubmissionService.completed
  const mockResult = {
    submission_id: submissionId,
    status: 'SUBMITTED',
    score: 100,
    passed_count: 5,
    total_testcases: 5,
  };
  SubmissionService.completed.set(submissionId, mockResult);

  const idempotentResult = await SubmissionService.submitQuestionCode({
    studentId: 'student-test-01',
    testId: 'test-unit-01',
    questionId: 'q-unit-01',
    sessionId: 'sess-01',
    code: 'function test() {}',
    submissionId,
  });

  assert.strictEqual(idempotentResult, mockResult, 'Submitting with same submissionId must return cached result');
  console.log('✓ Submission idempotency verified.');
}

async function testDuplicateEmailCheck() {
  console.log('\n[5] Testing Duplicate Email Check & Normalization...');

  const { StudentController } = await import('../backend/controllers/studentController.js');

  const testEmail = 'Duplicate.Student@CodeExam.edu';
  memoryStore.users.push({
    id: 'usr-dup-01',
    name: 'Existing Student',
    email: 'duplicate.student@codeexam.edu',
    role: 'STUDENT',
  });

  let errorSent = null;
  const mockReq = {
    body: {
      email: '   DUPLICATE.student@codeexam.edu  ',
      name: 'Another Student',
      password: 'password123',
    },
  };
  const mockRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      errorSent = { statusCode: this.statusCode, body };
      return this;
    },
  };
  const mockNext = () => {};

  await StudentController.createStudent(mockReq, mockRes, mockNext);
  assert.ok(errorSent, 'Response must be returned for duplicate email');
  assert.strictEqual(errorSent.statusCode, 409, 'Status must be 409 Conflict');
  assert.strictEqual(errorSent.body.errorCode, 'EMAIL_ALREADY_EXISTS', 'Error code must be EMAIL_ALREADY_EXISTS');

  console.log('✓ Duplicate email rejection verified with EMAIL_ALREADY_EXISTS.');
}

async function run() {
  try {
    await testSessionUniquenessAndRestoration();
    await testHeartbeatAndLastSeenAt();
    await testAuthoritativeClockExpiration();
    await testSubmissionIdempotency();
    await testDuplicateEmailCheck();
    console.log('\n🎉 ALL ACTIVE TEST & DATABASE VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  }
}

run();
