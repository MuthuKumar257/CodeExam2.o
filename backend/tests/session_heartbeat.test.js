import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { app } from '../server.js';
import { memoryStore } from '../services/supabaseService.js';

const JWT_SECRET = process.env.JWT_SECRET;
const student = { id: 'heartbeat-student-a', email: 'heartbeat-a@example.test', role: 'STUDENT' };
const otherStudent = { id: 'heartbeat-student-b', email: 'heartbeat-b@example.test', role: 'STUDENT' };
const makeToken = (user, options = {}) => jwt.sign(user, JWT_SECRET, options);

function makeSession(id, overrides = {}) {
  return {
    id,
    student_id: student.id,
    student_email: student.email,
    test_id: 'heartbeat-test',
    status: 'ACTIVE',
    attempt_status: 'IN_PROGRESS',
    end_time: '2027-01-01T00:00:00.000Z',
    connection_status: 'disconnected',
    ...overrides,
  };
}

test('session heartbeat authenticates, enforces ownership, and preserves terminal state', async (t) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const priorSessions = memoryStore.sessions;
  memoryStore.sessions = [];
  t.after(async () => {
    memoryStore.sessions = priorSessions;
    await new Promise((resolve) => server.close(resolve));
  });

  const postHeartbeat = (id, token, extraHeaders = {}) => fetch(`${baseUrl}/api/sessions/${id}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: '{}',
  });

  await t.test('valid application JWT updates an active owned session', async () => {
    const session = makeSession('heartbeat-active');
    memoryStore.sessions.push(session);
    const response = await postHeartbeat(session.id, makeToken(student));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.success, true);
    assert.equal(session.connection_status, 'connected');
  });

  await t.test('missing and invalid credentials return 401', async () => {
    const missing = await postHeartbeat('heartbeat-active');
    assert.equal(missing.status, 401);
    const spoofed = await postHeartbeat('heartbeat-active', null, { 'X-User-Id': student.id, 'X-User-Role': 'STUDENT' });
    assert.equal(spoofed.status, 401);
    const invalid = await postHeartbeat('heartbeat-active', 'not-a-signed-token');
    assert.equal(invalid.status, 401);
  });

  await t.test('a different student cannot update another student session', async () => {
    const session = makeSession('heartbeat-owned');
    memoryStore.sessions.push(session);
    const response = await postHeartbeat(session.id, makeToken(otherStudent));
    assert.equal(response.status, 403);
    assert.equal(session.connection_status, 'disconnected');
  });

  await t.test('expired JWT returns 401 for the login reauthentication flow', async () => {
    const expiredToken = makeToken(student, { expiresIn: -1 });
    const response = await postHeartbeat('heartbeat-active', expiredToken);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'INVALID_TOKEN');
  });

  await t.test('completed sessions cannot be reactivated or have heartbeat state changed', async () => {
    const session = makeSession('heartbeat-completed', {
      status: 'SUBMITTED',
      attempt_status: 'SUBMITTED',
      connection_status: 'disconnected',
      last_heartbeat: '2026-10-01T10:00:00.000Z',
    });
    memoryStore.sessions.push(session);
    const response = await postHeartbeat(session.id, makeToken(student));
    assert.equal(response.status, 409);
    assert.equal(session.status, 'SUBMITTED');
    assert.equal(session.connection_status, 'disconnected');
    assert.equal(session.last_heartbeat, '2026-10-01T10:00:00.000Z');
  });
});
