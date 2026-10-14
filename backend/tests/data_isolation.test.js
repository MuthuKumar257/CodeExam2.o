import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import http from 'http';
import { app } from '../server.js';
import { memoryStore } from '../services/supabaseService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-tests';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

test('Student Results and History Data Isolation Suite', async (t) => {
  // Set up test users: Student A, Student B, Admin, Faculty
  const studentA = {
    id: 'student-isolation-a',
    name: 'Alice Student',
    email: 'alice.student@drngpit.ac.in',
    role: 'STUDENT',
    department: 'Computer Science and Engineering',
  };

  const studentB = {
    id: 'student-isolation-b',
    name: 'Bob Candidate',
    email: 'bob.candidate@drngpit.ac.in',
    role: 'CANDIDATE',
    department: 'Computer Science and Engineering',
  };

  const facultyUser = {
    id: 'faculty-isolation-1',
    name: 'Faculty Incharge',
    email: 'faculty.incharge@drngpit.ac.in',
    role: 'FACULTY',
    department: 'Computer Science and Engineering',
  };

  const adminUser = {
    id: 'admin-isolation-1',
    name: 'Admin System',
    email: 'admin.system@drngpit.ac.in',
    role: 'ADMIN',
    department: 'Computer Science and Engineering',
  };

  // Register in memoryStore.users
  [studentA, studentB, facultyUser, adminUser].forEach((u) => {
    if (!memoryStore.users.some((x) => x.id === u.id)) {
      memoryStore.users.push(u);
    }
  });

  const testId = 'test-isolation-101';
  if (!memoryStore.tests.some((t) => t.id === testId)) {
    memoryStore.tests.push({
      id: testId,
      title: 'Data Structures and Algorithms Exam',
      start_time: '2026-01-01T00:00:00.000Z',
      end_time: '2026-12-31T23:59:59.000Z',
      duration_minutes: 60,
      total_marks: 100,
      status: 'PUBLISHED',
      is_deleted: false,
    });
  }

  // Session for Student A
  const sessionA = {
    id: 'sess-alice-001',
    test_id: testId,
    assessmentId: testId,
    student_id: studentA.id,
    candidateId: studentA.id,
    student_name: studentA.name,
    student_email: studentA.email,
    candidateEmail: studentA.email,
    status: 'SUBMITTED',
    state: 'SUBMITTED',
    score: 85,
    total_marks: 100,
    started_at: '2026-10-01T10:00:00.000Z',
    end_time: '2026-10-01T11:00:00.000Z',
    submitted_at: '2026-10-01T10:45:00.000Z',
    completedAt: '2026-10-01T10:45:00.000Z',
    warningsCount: 0,
  };

  // Session for Student B
  const sessionB = {
    id: 'sess-bob-002',
    test_id: testId,
    assessmentId: testId,
    student_id: studentB.id,
    candidateId: studentB.id,
    student_name: studentB.name,
    student_email: studentB.email,
    candidateEmail: studentB.email,
    status: 'SUBMITTED',
    state: 'SUBMITTED',
    score: 92,
    total_marks: 100,
    started_at: '2026-10-01T10:00:00.000Z',
    end_time: '2026-10-01T11:00:00.000Z',
    submitted_at: '2026-10-01T10:50:00.000Z',
    completedAt: '2026-10-01T10:50:00.000Z',
    warningsCount: 1,
  };

  memoryStore.sessions = memoryStore.sessions.filter(
    (s) => s.id !== sessionA.id && s.id !== sessionB.id
  );
  memoryStore.sessions.push(sessionA, sessionB);

  // Submissions for Student A and Student B
  const submissionA = {
    id: 'sub-alice-001',
    submission_id: 'sub-alice-001',
    test_id: testId,
    assessmentId: testId,
    student_id: studentA.id,
    candidateId: studentA.id,
    question_id: 'q-iso-1',
    score: 40,
    max_score: 50,
    status: 'ACCEPTED',
    submitted_at: '2026-10-01T10:20:00.000Z',
  };

  const submissionB = {
    id: 'sub-bob-002',
    submission_id: 'sub-bob-002',
    test_id: testId,
    assessmentId: testId,
    student_id: studentB.id,
    candidateId: studentB.id,
    question_id: 'q-iso-1',
    score: 50,
    max_score: 50,
    status: 'ACCEPTED',
    submitted_at: '2026-10-01T10:25:00.000Z',
  };

  memoryStore.submissions = memoryStore.submissions.filter(
    (s) => s.id !== submissionA.id && s.id !== submissionB.id
  );
  memoryStore.submissions.push(submissionA, submissionB);

  // Spin up test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tokenA = createToken(studentA);
  const tokenB = createToken(studentB);
  const tokenFaculty = createToken(facultyUser);
  const tokenAdmin = createToken(adminUser);

  t.after(() => {
    server.close();
  });

  await t.test('1. Unauthenticated requests are rejected with 401', async () => {
    const resHistory = await fetch(`${baseUrl}/api/history`);
    assert.equal(resHistory.status, 401, 'History requires authentication');

    const resAttempts = await fetch(`${baseUrl}/api/attempts`);
    assert.equal(resAttempts.status, 401, 'Attempts requires authentication');

    const resSubmissions = await fetch(`${baseUrl}/api/submissions`);
    assert.equal(resSubmissions.status, 401, 'Submissions requires authentication');
  });

  await t.test('2. Student A querying their own history receives only their own records', async () => {
    const res = await fetch(`${baseUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.some((s) => s.id === sessionA.id));
    assert.ok(!json.data.some((s) => s.id === sessionB.id), 'Must not contain Student B session');
  });

  await t.test('3. Student B querying their own history receives only their own records', async () => {
    const res = await fetch(`${baseUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.some((s) => s.id === sessionB.id));
    assert.ok(!json.data.some((s) => s.id === sessionA.id), 'Must not contain Student A session');
  });

  await t.test('4. Student A querying Student B history via query parameter is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/history?studentId=${studentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject with 403 Forbidden');
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.errorCode, 'FORBIDDEN');
  });

  await t.test('5. Student A querying Student B history via route parameter is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/history/student/${studentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject with 403 Forbidden');
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.errorCode, 'FORBIDDEN');
  });

  await t.test('6. Student A querying all sessions (/api/attempts) only receives their own sessions', async () => {
    const res = await fetch(`${baseUrl}/api/attempts`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.every((s) => s.student_id === studentA.id || s.candidateId === studentA.id));
    assert.ok(!json.data.some((s) => s.id === sessionB.id));
  });

  await t.test('7. Student A querying Student B session by ID is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/attempts/${sessionB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject viewing other student session');
    const json = await res.json();
    assert.equal(json.errorCode, 'FORBIDDEN');
  });

  await t.test('8. Student A querying Student B submissions is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/submissions?student_id=${studentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject with 403 Forbidden');
  });

  await t.test('9. Student A querying Student B submission by ID is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/submissions/${submissionB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject viewing other student submission');
  });

  await t.test('10. Student A querying /api/students/:studentId/sessions for Student B is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/students/${studentB.id}/sessions`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject student viewing another student subroute sessions');
  });

  await t.test('11. Student A querying /api/students/:studentId/submissions for Student B is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/students/${studentB.id}/submissions`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject student viewing another student subroute submissions');
  });

  await t.test('12. Student A querying /api/reports/students/:studentId for Student B is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/reports/students/${studentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject student viewing another student report');
  });

  await t.test('13. Student A querying /api/rankings/student/:studentId for Student B is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/rankings/student/${studentB.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 403, 'Must reject student viewing another student rank');
  });

  await t.test('14. Faculty and Admin retain oversight access to student sessions and history', async () => {
    // Admin querying history
    const resAdminHistory = await fetch(`${baseUrl}/api/history`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdminHistory.status, 200);

    // Faculty querying specific student history
    const resFacultyStudent = await fetch(`${baseUrl}/api/history/student/${studentA.id}`, {
      headers: { Authorization: `Bearer ${tokenFaculty}` },
    });
    assert.equal(resFacultyStudent.status, 200);
    const jsonFac = await resFacultyStudent.json();
    assert.ok(jsonFac.data.some((s) => s.id === sessionA.id));

    // Faculty querying session by ID
    const resFacSess = await fetch(`${baseUrl}/api/attempts/${sessionA.id}`, {
      headers: { Authorization: `Bearer ${tokenFaculty}` },
    });
    assert.equal(resFacSess.status, 200);
  });
});

