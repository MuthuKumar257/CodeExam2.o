import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';

import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import facultyRoutes from './routes/facultyRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import testRoutes from './routes/testRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testcaseRoutes from './routes/testcaseRoutes.js';
import codeRoutes from './routes/codeRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import monitoringRoutes from './routes/monitoringRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dbRoutes from './routes/dbRoutes.js';
import recordingRoutes, { registerRecordingLookups } from './routes/recordingRoutes.js';

import { errorMiddleware } from './middleware/errorMiddleware.js';
import { setupWebSocket } from './websocket/testSocket.js';
import { isSupabaseConfigured } from './services/supabaseService.js';
import { logger } from './utils/logger.js';
import { SessionService } from './services/sessionService.js';
import { sendSuccess } from './utils/response.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role'],
  })
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health and server-time endpoints
app.get(['/api/health', '/health'], (_req, res) => {
  return sendSuccess(res, {
    status: 'healthy',
    supabase_configured: isSupabaseConfigured,
    uptime_seconds: process.uptime(),
    server_time: new Date().toISOString(),
  });
});

app.get(['/api/server-time', '/server-time'], (_req, res) => {
  return sendSuccess(res, {
    server_time: new Date().toISOString(),
    timestamp: Date.now(),
  });
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/assessments', testRoutes);
setInterval(() => {
  SessionService.expireDueSessions().catch((err) => logger.error('Assessment expiration worker failed:', err));
}, 1000);
app.use('/api/questions', questionRoutes);
app.use('/api/testcases', testcaseRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use(['/api/test-sessions', '/api/sessions'], sessionRoutes);
app.use('/api/rankings', rankingRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/reports', reportRoutes);
app.use(['/api/live-monitoring', '/api/monitoring'], monitoringRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/db', dbRoutes);
app.use('/api/recordings', recordingRoutes);
registerRecordingLookups(app);


// Error Handling Middleware
app.use(errorMiddleware);

// Create HTTP & WebSocket Server
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 5000,
  transports: ['polling', 'websocket'],
});

setupWebSocket(io);

// Graceful Shutdown
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    io.close(() => {
      logger.info('Socket.IO closed.');
    });
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

setupGracefulShutdown();

// Port collision error handler
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use by another process.`);
    process.exit(1);
  }
  logger.error('Server error:', err);
});

// Start listening
server.listen(PORT, () => {
  logger.info(`[SERVER] CodeExam server started on port ${PORT}`);
  logger.info(`🔌 WebSocket Realtime engine active on port ${PORT}`);
  logger.info(`📦 Database: ${isSupabaseConfigured ? 'Supabase PostgreSQL' : 'Resilient In-Memory Mode'}`);
});

export { app, server, io };
