import { io, Socket } from 'socket.io-client';

// Session-specific socket pool to ensure exactly ONE resilient WebSocket connection per active test session
const sessionSockets = new Map<string, Socket>();

/**
 * Creates or retrieves a resilient Socket.IO client configured for cloud proxies and high availability
 */
export function createResilientSocket(namespace: string = '/'): Socket {
  const socket = io(namespace, {
    transports: ['polling', 'websocket'], // Start with HTTP long-polling, upgrade to WebSocket
    upgrade: true,
    rememberUpgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity, // Keep attempting reconnects with exponential backoff
    reconnectionDelay: 1000, // Initial delay: 1s
    reconnectionDelayMax: 10000, // Maximum delay: 10s
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log(`[WebSocket] Connected: Socket ID ${socket.id} on namespace ${namespace}`);
  });

  socket.on('disconnect', (reason) => {
    console.warn(`[WebSocket] Disconnected: reason=${reason}. (Test session remains ACTIVE; reconnecting...)`);
  });

  socket.io?.on('reconnect_attempt', (attempt) => {
    console.log(`[WebSocket] Reconnect attempt #${attempt}...`);
  });

  socket.io?.on('reconnect', (attempt) => {
    console.log(`[WebSocket] Reconnected successfully after ${attempt} attempts! Socket ID ${socket.id}`);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WebSocket] Connection error (retrying with exponential backoff):', err.message);
  });

  return socket;
}

/**
 * Returns or creates the unique, authoritative WebSocket connection for a given candidate test session.
 * Prevents duplicate WebSocket connections per active test session.
 */
export function getOrCreateSessionSocket(sessionId: string, namespace: string = '/'): Socket {
  if (!sessionId) {
    return getSharedSocket();
  }

  const existing = sessionSockets.get(sessionId);
  if (existing) {
    if (existing.disconnected) {
      console.log(`[WebSocket] Reconnecting existing socket for session ${sessionId}...`);
      existing.connect();
    }
    return existing;
  }

  console.log(`[WebSocket] Initializing new authoritative session socket for session ${sessionId}`);
  const socket = createResilientSocket(namespace);
  sessionSockets.set(sessionId, socket);
  return socket;
}

/**
 * Properly closes and disposes the WebSocket connection ONLY when the test session actually ends.
 */
export function closeSessionSocket(sessionId: string): void {
  if (!sessionId) return;
  const socket = sessionSockets.get(sessionId);
  if (socket) {
    console.log(`[WebSocket] Explicitly closing session socket for ended session ${sessionId}`);
    try {
      socket.disconnect();
    } catch (e) {
      console.warn('[WebSocket] Error disconnecting session socket:', e);
    }
    sessionSockets.delete(sessionId);
  }
}

// Shared singleton socket for general app alerts and synchronization
let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket {
  if (!sharedSocket || sharedSocket.disconnected) {
    sharedSocket = createResilientSocket();
  }
  return sharedSocket;
}
