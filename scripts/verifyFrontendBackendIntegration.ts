import http from 'http';
import { io as createClientSocket } from 'socket.io-client';
import { app } from '../server/src/server';
import { setupWebSocket } from '../server/src/websocket/socketHandler';
import { Server as SocketIOServer } from 'socket.io';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runIntegrationTest() {
  console.log('=== STARTING FRONTEND-TO-BACKEND INTEGRATION TESTS ===\n');

  // Start test HTTP + Socket server on ephemeral port
  const testServer = http.createServer(app);
  const ioServer = new SocketIOServer(testServer, {
    cors: { origin: '*' },
    transports: ['polling', 'websocket'],
  });
  setupWebSocket(ioServer);

  await new Promise<void>((resolve) => {
    testServer.listen(0, () => resolve());
  });

  const address = testServer.address();
  const port = typeof address === 'object' && address ? address.port : 5000;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  let clientSocket: any = null;

  try {
    // 1. Health & Server Time
    console.log('--- 1. Health & Server-Time API Verification ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert(healthRes.ok, 'GET /api/health responded 200 OK');
    const healthJson = await healthRes.json();
    assert(healthJson.status === 'healthy', 'Health status is healthy');

    const timeRes = await fetch(`${baseUrl}/api/server-time`);
    assert(timeRes.ok, 'GET /api/server-time responded 200 OK');
    const timeJson = await timeRes.json();
    assert(typeof timeJson.serverTime === 'string', 'serverTime returned in ISO format');
    assert(typeof timeJson.timestamp === 'number', 'timestamp returned in numeric ms');

    // 2. Database Hydration: GET /api/db/all
    console.log('\n--- 2. Database Hydration: GET /api/db/all ---');
    const dbAllRes = await fetch(`${baseUrl}/api/db/all`);
    assert(dbAllRes.ok, 'GET /api/db/all responded 200 OK');
    const dbAllJson = await dbAllRes.json();
    assert(dbAllJson.success === true, 'dbAll returned success = true');
    assert(Array.isArray(dbAllJson.data.users), 'dbAll contains users array');
    assert(Array.isArray(dbAllJson.data.assessments), 'dbAll contains assessments array');
    assert(Array.isArray(dbAllJson.data.questions), 'dbAll contains questions array');
    assert(Array.isArray(dbAllJson.data.sessions), 'dbAll contains sessions array');

    // 3. Create Assessment: POST /api/tests & POST /api/assessments alias
    console.log('\n--- 3. Create Assessment & Alias Routing ---');
    const createAsmRes = await fetch(`${baseUrl}/api/assessments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'usr-admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({
        id: 'asm-integration-test-01',
        title: 'End-to-End Integration Assessment',
        durationMinutes: 45,
        totalPoints: 100,
        status: 'ACTIVE',
      }),
    });
    assert(createAsmRes.ok, 'POST /api/assessments responded 200/201 OK');
    const createAsmJson = await createAsmRes.json();
    assert(createAsmJson.data.id === 'asm-integration-test-01', 'Created assessment ID matches');

    // 4. Start Test Session: POST /api/tests/:id/start
    console.log('\n--- 4. Start Test Session: POST /api/tests/:id/start ---');
    const startTestRes = await fetch(`${baseUrl}/api/tests/asm-integration-test-01/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 'student-e2e-01',
        candidateName: 'Jane Doe',
        candidateEmail: 'jane@example.com',
      }),
    });
    assert(startTestRes.ok, 'POST /api/tests/:id/start responded 200 OK');
    const startTestJson = await startTestRes.json();
    const createdSession = startTestJson.data.session;
    assert(createdSession.candidateId === 'student-e2e-01', 'Session candidateId matches');
    assert(createdSession.state === 'ACTIVE', 'Session state is ACTIVE');
    assert(typeof startTestJson.data.remainingTime === 'number', 'Server remaining time calculated');

    // 5. Test Session Heartbeat: POST /api/sessions/:id/heartbeat (alias)
    console.log('\n--- 5. Session Heartbeat: POST /api/sessions/:id/heartbeat ---');
    const hbRes = await fetch(`${baseUrl}/api/sessions/${createdSession.id}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeLeftSec: 2500,
        warningsCount: 0,
      }),
    });
    assert(hbRes.ok, 'POST /api/sessions/:id/heartbeat responded 200 OK');
    const hbJson = await hbRes.json();
    assert(hbJson.success === true, 'Heartbeat acknowledged successfully');
    assert(hbJson.status === 'ACTIVE', 'Session status remains ACTIVE');
    assert(typeof hbJson.serverTime === 'string', 'Heartbeat includes authoritative serverTime');

    // 6. ClientWriteQueue Dispatch: POST /api/db/save
    console.log('\n--- 6. ClientWriteQueue Dispatch: POST /api/db/save ---');
    const saveRes = await fetch(`${baseUrl}/api/db/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'assessments',
        id: 'asm-integration-test-01',
        data: { title: 'Updated Integration Assessment' },
      }),
    });
    assert(saveRes.ok, 'POST /api/db/save responded 200 OK');
    const saveJson = await saveRes.json();
    assert(saveJson.success === true, 'db/save succeeded');

    // 7. WebSocket Handshake & Events
    console.log('\n--- 7. WebSocket Realtime Handshake & Events ---');
    clientSocket = createClientSocket(baseUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);

      clientSocket.on('connect', () => {
        clearTimeout(timeout);
        assert(clientSocket.connected, `WebSocket connected with socket ID: ${clientSocket.id}`);
        resolve();
      });
    });

    // Test join_session and receive session_restored
    const sessionRestoredPromise = new Promise<any>((resolve) => {
      clientSocket.on('session_restored', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('join_session', {
      sessionId: createdSession.id,
      studentId: 'student-e2e-01',
    });

    const restoredData = await sessionRestoredPromise;
    assert(restoredData.sessionId === createdSession.id, 'Received session_restored for session ID');
    assert(restoredData.connectionStatus === 'CONNECTED', 'session_restored has connectionStatus = CONNECTED');
    assert(typeof restoredData.remainingSeconds === 'number', 'Authoritative remainingSeconds received');

    // Test heartbeat_ack
    const hbAckPromise = new Promise<any>((resolve) => {
      clientSocket.on('heartbeat_ack', (data) => {
        resolve(data);
      });
    });

    clientSocket.emit('candidate_heartbeat', {
      sessionId: createdSession.id,
      assessmentId: 'asm-integration-test-01',
      candidateId: 'student-e2e-01',
    });

    const hbAckData = await hbAckPromise;
    assert(hbAckData.connectionStatus === 'CONNECTED', 'heartbeat_ack received with CONNECTED status');
    assert(typeof hbAckData.serverTime === 'string', 'heartbeat_ack includes serverTime');

    // 8. End Session & Expiration Check
    console.log('\n--- 8. Explicit Test Submission & End Session ---');
    const endRes = await fetch(`${baseUrl}/api/sessions/${createdSession.id}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'SUBMITTED' }),
    });
    assert(endRes.ok, 'POST /api/sessions/:id/end responded 200 OK');
    const endJson = await endRes.json();
    assert(endJson.data.state === 'SUBMITTED', 'Session state transitioned to SUBMITTED');

    // Clean up
    clientSocket.disconnect();
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        testServer.close(() => resolve());
      });
    });

    console.log('\n=== ALL FRONTEND-TO-BACKEND INTEGRATION TESTS PASSED PERFECTLY! ===');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed with error:', err);
    clientSocket && clientSocket.disconnect();
    testServer.close();
    process.exit(1);
  }
}

runIntegrationTest();
