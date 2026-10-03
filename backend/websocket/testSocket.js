import { SessionService } from '../services/sessionService.js';
import { logger } from '../utils/logger.js';

let globalIo = null;
const sessionSocketMap = new Map();
const webrtcRooms = new Map();

export function broadcastSessionUpdate(sessionId, eventName, data) {
  if (globalIo) {
    globalIo.to(`session_${sessionId}`).emit(eventName, data);
    globalIo.emit(eventName, data);
  }
}

export function broadcastDatabaseUpdate(data) {
  if (globalIo) {
    globalIo.emit('db_sync_event', data);
  }
}

export function setupWebSocket(io) {
  globalIo = io;

  io.on('connection', (socket) => {
    let currentSessionId = null;
    let currentStudentId = null;

    logger.info(`[WebSocket] Client connected: socket ${socket.id}`);
    const roomKey = (payload = {}) => `${payload.assessmentId || ''}:${payload.sessionId || ''}`;

    socket.emit('CONNECT', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      serverTime: new Date().toISOString(),
    });

    socket.on('webrtc_join_room', (payload = {}) => {
      const key = roomKey(payload);
      if (key === ':') return;
      if (!webrtcRooms.has(key)) webrtcRooms.set(key, { candidates: new Set(), faculty: new Set() });
      const room = webrtcRooms.get(key);
      const peers = payload.role === 'FACULTY' ? room.faculty : room.candidates;
      const otherPeers = payload.role === 'FACULTY' ? room.candidates : room.faculty;
      peers.add(socket.id);
      otherPeers.forEach((peerId) => io.to(peerId).emit(
        payload.role === 'FACULTY' ? 'webrtc_faculty_joined' : 'webrtc_candidate_joined',
        { facultySocketId: socket.id, candidateSocketId: socket.id }
      ));
    });

    socket.on('webrtc_request_stream', (payload = {}) => {
      webrtcRooms.get(roomKey(payload))?.candidates.forEach((candidateSocketId) => {
        io.to(candidateSocketId).emit('webrtc_request_stream', { fromSocketId: socket.id });
      });
    });

    for (const eventName of ['webrtc_offer', 'webrtc_answer', 'webrtc_ice_candidate']) {
      socket.on(eventName, (payload = {}) => {
        if (payload.targetSocketId) {
          io.to(payload.targetSocketId).emit(eventName, { ...payload, fromSocketId: socket.id });
        }
      });
    }

    socket.on('webrtc_leave_room', (payload = {}) => {
      const key = roomKey(payload);
      const room = webrtcRooms.get(key);
      if (!room) return;
      const peers = payload.role === 'FACULTY' ? room.faculty : room.candidates;
      const otherPeers = payload.role === 'FACULTY' ? room.candidates : room.faculty;
      peers.delete(socket.id);
      otherPeers.forEach((peerId) => io.to(peerId).emit(
        payload.role === 'FACULTY' ? 'webrtc_faculty_left' : 'webrtc_candidate_left',
        { facultySocketId: socket.id, candidateSocketId: socket.id }
      ));
      if (room.candidates.size === 0 && room.faculty.size === 0) webrtcRooms.delete(key);
    });

    // Authenticate & Join Session Room
    const handleJoinSession = async (payload = {}) => {
      const sessionId = payload.sessionId || payload.session_id;
      const studentId = payload.studentId || payload.student_id;
      if (!sessionId) return;

      currentSessionId = sessionId;
      currentStudentId = studentId;

      // Replace previous socket mapping for this session
      const prevSocketId = sessionSocketMap.get(sessionId);
      if (prevSocketId && prevSocketId !== socket.id) {
        logger.info(`[WebSocket] Replacing socket for session ${sessionId}: ${prevSocketId} -> ${socket.id}`);
        const prevSocket = io.sockets.sockets.get(prevSocketId);
        if (prevSocket) {
          prevSocket.leave(`session_${sessionId}`);
        }
      }
      sessionSocketMap.set(sessionId, socket.id);

      socket.join(`session_${sessionId}`);
      socket.join(sessionId);

      // Mark connection as connected without altering test status
      await SessionService.updateConnectionStatus(sessionId, 'connected');
      const session = await SessionService.getSessionById(sessionId);

      const serverNow = SessionService.getServerTime();
      const remainingSeconds = session ? SessionService.calculateRemainingSeconds(session.end_time, serverNow) : 0;

      // Emit session synchronization and time synchronization
      const syncData = {
        sessionId,
        status: session?.status || 'ACTIVE',
        connectionStatus: 'connected',
        serverTime: serverNow.toISOString(),
        endTime: session?.end_time,
        remainingSeconds,
      };

      socket.emit('SESSION_SYNC', syncData);
      socket.emit('session_restored', syncData);
      socket.emit('TIME_SYNC', {
        serverTime: serverNow.toISOString(),
        remainingSeconds,
      });

      logger.info(`[WebSocket] Session ${sessionId} synchronized. Remaining: ${remainingSeconds}s`);
    };

    socket.on('AUTHENTICATE', handleJoinSession);
    socket.on('join_session', handleJoinSession);

    // Heartbeat handling
    const handleHeartbeat = async (data = {}) => {
      const sessionId = data.sessionId || data.session_id || currentSessionId;
      if (!sessionId) return;

      try {
        const hbResult = await SessionService.recordHeartbeat(sessionId);
        if (!hbResult) return;

        const responsePayload = {
          sessionId,
          serverTime: hbResult.serverTime,
          remainingSeconds: hbResult.remaining_seconds,
          isExpired: hbResult.isExpired,
          status: hbResult.status,
          connectionStatus: 'connected',
        };

        socket.emit('HEARTBEAT', responsePayload);
        socket.emit('HEARTBEAT_ACK', responsePayload);
        socket.emit('heartbeat_ack', responsePayload);


        // If server authoritative clock determines expiration
        if (hbResult.isExpired) {
          logger.info(`[WebSocket] Absolute end time reached for session ${sessionId}. Emitting expiration.`);
          io.to(`session_${sessionId}`).emit('TEST_STATUS', {
            sessionId,
            status: 'EXPIRED',
            reason: 'TIME_EXPIRED',
            serverTime: hbResult.serverTime,
          });
          io.to(`session_${sessionId}`).emit('test_expired', {
            sessionId,
            reason: 'TIME_EXPIRED',
            serverTime: hbResult.serverTime,
          });
        }
      } catch (err) {
        logger.warn(`[WebSocket] Heartbeat error for session ${sessionId}:`, err.message);
      }
    };

    socket.on('HEARTBEAT', handleHeartbeat);
    socket.on('heartbeat', handleHeartbeat);
    socket.on('candidate_heartbeat', handleHeartbeat);

    // Submission Status Broadcast
    socket.on('SUBMISSION_STATUS', (data) => {
      if (currentSessionId) {
        io.to(`session_${currentSessionId}`).emit('SUBMISSION_STATUS', data);
      }
    });

    // Time Sync Request
    socket.on('TIME_SYNC', () => {
      const serverNow = SessionService.getServerTime();
      socket.emit('TIME_SYNC', {
        serverTime: serverNow.toISOString(),
        timestamp: serverNow.getTime(),
      });
    });

    // Disconnect handling
    // RULE: Mark connection_status = disconnected. Do NOT change test status from ACTIVE!
    socket.on('disconnect', async (reason) => {
      logger.info(`[WebSocket] Socket ${socket.id} disconnected. Reason: ${reason}`);

      if (currentSessionId) {
        if (sessionSocketMap.get(currentSessionId) === socket.id) {
          logger.info(`[WebSocket] Session ${currentSessionId}: connection_status = disconnected. Test status remains ACTIVE.`);
          await SessionService.updateConnectionStatus(currentSessionId, 'disconnected');
          sessionSocketMap.delete(currentSessionId);

          io.to(`session_${currentSessionId}`).emit('DISCONNECT', {
            sessionId: currentSessionId,
            connectionStatus: 'disconnected',
            testStatus: 'ACTIVE',
            reason,
          });
        }
      }

      for (const [key, room] of webrtcRooms.entries()) {
        const wasCandidate = room.candidates.delete(socket.id);
        const wasFaculty = room.faculty.delete(socket.id);
        if (wasCandidate) room.faculty.forEach((peerId) => io.to(peerId).emit('webrtc_candidate_left', { candidateSocketId: socket.id }));
        if (wasFaculty) room.candidates.forEach((peerId) => io.to(peerId).emit('webrtc_faculty_left', { facultySocketId: socket.id }));
        if (room.candidates.size === 0 && room.faculty.size === 0) webrtcRooms.delete(key);
      }
    });
  });
}
