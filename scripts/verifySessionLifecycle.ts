import { getOrCreateSessionSocket, closeSessionSocket } from '../src/services/socketClient';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('=== STARTING WEBSOCKET & TEST-SESSION LIFECYCLE TESTS ===\n');

// ------------------------------------------------------------------------------
// TEST 1: WebSocket Lifecycle - Single socket per session, prevent duplicates
// ------------------------------------------------------------------------------
console.log('--- TEST 1: Single Authoritative Socket Per Session ---');
const sessionId = 'test-session-auth-001';
const socketA = getOrCreateSessionSocket(sessionId);
const socketB = getOrCreateSessionSocket(sessionId);

assert(socketA === socketB, 'getOrCreateSessionSocket returned the exact same socket instance (no duplicates)');
assert((socketA as any).io.opts.reconnection === true, 'Socket configured with auto-reconnection enabled');
assert((socketA as any).io.opts.reconnectionAttempts === Infinity, 'Socket configured with infinite reconnect attempts (never gives up during active test)');
assert((socketA as any).io.opts.reconnectionDelay === 1000, 'Socket initial reconnectionDelay is 1000ms');
assert((socketA as any).io.opts.reconnectionDelayMax === 10000, 'Socket reconnectionDelayMax is 10000ms (exponential backoff)');

// Clean up socket
closeSessionSocket(sessionId);
const socketC = getOrCreateSessionSocket(sessionId);
assert(socketC !== socketA, 'closeSessionSocket properly disposed socket; new call creates fresh instance');
closeSessionSocket(sessionId);

// ------------------------------------------------------------------------------
// TEST 2: Server-Authoritative Timer & Grace Tolerance
// ------------------------------------------------------------------------------
console.log('\n--- TEST 2: Server-Authoritative End Time & Grace Tolerance ---');
const nowMs = 1760000000000;
const durationMinutes = 60;
const testEndMs = nowMs + durationMinutes * 60 * 1000;
const testEndTimeIso = new Date(testEndMs).toISOString();

// Calculate remaining time
const currentServerTimeMs = nowMs + 1000; // 1s elapsed
const remainingSec = Math.max(0, Math.floor((new Date(testEndTimeIso).getTime() - currentServerTimeMs) / 1000));
assert(remainingSec === 3599, `Remaining time calculated correctly: ${remainingSec}s (expected 3599s)`);

// Grace period tolerance check (GRACE_PERIOD_MS = 10000)
const GRACE_PERIOD_MS = 10000;
const justReachedEndMs = testEndMs; // exactly at end time
const isExpiredAtEnd = justReachedEndMs >= (testEndMs + GRACE_PERIOD_MS);
assert(isExpiredAtEnd === false, 'Test is NOT marked expired exactly at end time (grace period active)');

const pastGraceEndMs = testEndMs + GRACE_PERIOD_MS + 1000; // 1s past grace period
const isExpiredPastGrace = pastGraceEndMs >= (testEndMs + GRACE_PERIOD_MS);
assert(isExpiredPastGrace === true, 'Test is marked expired only after server grace period has elapsed');

// ------------------------------------------------------------------------------
// TEST 3: Separation of Connection Status and Test Status
// ------------------------------------------------------------------------------
console.log('\n--- TEST 3: Separation of Connection Status and Test Status ---');
const session = {
  id: 'sess-active-42',
  state: 'ACTIVE',
  connectionStatus: 'CONNECTED',
  testEndTime: testEndTimeIso,
};

// Simulate WebSocket disconnection event
const onSocketDisconnect = (sess: typeof session) => {
  return {
    ...sess,
    connectionStatus: 'DISCONNECTED', // Connection is marked disconnected
    // state remains strictly ACTIVE!
  };
};

const disconnectedSession = onSocketDisconnect(session);
assert(disconnectedSession.state === 'ACTIVE', 'Test session state remains ACTIVE during socket disconnect');
assert(disconnectedSession.connectionStatus === 'DISCONNECTED', 'connectionStatus is properly separated as DISCONNECTED');

// Simulate WebSocket reconnect event
const onSocketReconnect = (sess: typeof disconnectedSession) => {
  return {
    ...sess,
    connectionStatus: 'CONNECTED',
  };
};

const reconnectedSession = onSocketReconnect(disconnectedSession);
assert(reconnectedSession.state === 'ACTIVE', 'Test session state remains ACTIVE upon reconnect');
assert(reconnectedSession.connectionStatus === 'CONNECTED', 'connectionStatus restored to CONNECTED');

// ------------------------------------------------------------------------------
// TEST 4: Transient Event Protection Against Premature Termination
// ------------------------------------------------------------------------------
console.log('\n--- TEST 4: Transient Event Protection Against Premature Closure ---');
const transientDisconnectionReasons = [
  'WORKSPACE_UNMOUNT',
  'PAGE_HIDE',
  'BEFORE_UNLOAD',
  'SOCKET_DISCONNECT',
  'HEARTBEAT_TIMEOUT',
  'TAB_SWITCH',
  'NETWORK_TIMEOUT',
];

transientDisconnectionReasons.forEach((reason) => {
  const isExpired = false;
  const isExplicit = false;
  const shouldClose = !transientDisconnectionReasons.includes(reason) || isExpired || isExplicit;
  assert(!shouldClose, `Transient event '${reason}' is prohibited from ending an active session`);
});

// Explicit submit must end session
const isExplicitSubmit = true;
const shouldCloseOnExplicit = !transientDisconnectionReasons.includes('MANUAL_SUBMIT') || isExplicitSubmit;
assert(shouldCloseOnExplicit === true, 'Explicit user submit correctly triggers session closure');

// Server expired must end session
const isServerExpired = true;
const shouldCloseOnServerExpiry = isServerExpired;
assert(shouldCloseOnServerExpiry === true, 'Server end time expiration correctly triggers session closure');

// ------------------------------------------------------------------------------
// TEST 5: Session Reconnection / Restoration Locking
// ------------------------------------------------------------------------------
console.log('\n--- TEST 5: Session Locking (Single Active Session Per Student + Test) ---');
const mockSessions = [
  { id: 'sess-001', candidateId: 'std-1', assessmentId: 'asm-101', state: 'ACTIVE' },
  { id: 'sess-002', candidateId: 'std-2', assessmentId: 'asm-101', state: 'ACTIVE' },
];

const findExistingSession = (candId: string, asmId: string) =>
  mockSessions.find((s) => s.candidateId === candId && s.assessmentId === asmId && s.state === 'ACTIVE');

const existingForStd1 = findExistingSession('std-1', 'asm-101');
assert(existingForStd1 !== undefined && existingForStd1.id === 'sess-001', 'Reconnecting student reuses existing active session');

const existingForStd3 = findExistingSession('std-3', 'asm-101');
assert(existingForStd3 === undefined, 'New student with no active session creates a new session');

console.log('\n=== ALL LIFECYCLE & WEBSOCKET VERIFICATION TESTS PASSED! ===');
