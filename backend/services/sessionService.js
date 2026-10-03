import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { logger } from '../utils/logger.js';

const GRACE_PERIOD_MS = 0;

export class SessionService {
  static getServerTime() {
    return new Date();
  }

  static calculateRemainingSeconds(endTimeStr, currentTime = new Date()) {
    if (!endTimeStr) return 0;
    const endMs = new Date(endTimeStr).getTime();
    const nowMs = currentTime.getTime();
    return Math.max(0, Math.floor((endMs - nowMs) / 1000));
  }

  static isSessionExpired(endTimeStr, currentTime = new Date()) {
    if (!endTimeStr) return false;
    const endMs = new Date(endTimeStr).getTime();
    const nowMs = currentTime.getTime();
    return nowMs >= endMs + GRACE_PERIOD_MS;
  }

  static async getSessionById(sessionId) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const remainingTime = this.calculateRemainingSeconds(session.end_time);
    return {
      ...session,
      remaining_seconds: remainingTime,
    };
  }

  static async getStudentSessions(studentId) {
    return memoryStore.sessions.filter((s) => s.student_id === studentId);
  }

  static async getActiveSessions() {
    return memoryStore.sessions.filter((s) => s.status === 'ACTIVE');
  }

  static async startOrRestoreSession(testId, studentId, studentName = 'Student') {
    const test = memoryStore.tests.find((t) => t.id === testId && !t.is_deleted);
    if (!test) {
      throw new Error('Test not found or has been deleted.');
    }
    const now = this.getServerTime();
    const scheduledStart = test.start_time ? new Date(test.start_time).getTime() : null;
    const scheduledEnd = test.end_time ? new Date(test.end_time).getTime() : null;
    if (['DRAFT', 'CLOSED', 'DELETED'].includes(String(test.status || '').toUpperCase())) {
      const error = new Error('Assessment is not available.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_AVAILABLE';
      throw error;
    }
    if (scheduledStart && now.getTime() < scheduledStart) {
      const error = new Error('Assessment has not started yet.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_STARTED';
      throw error;
    }
    if (scheduledEnd && now.getTime() >= scheduledEnd) {
      const error = new Error('Assessment availability has ended.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_CLOSED';
      throw error;
    }

    // 1. Session Locking: check for existing active session for this student + test
    const existingActive = memoryStore.sessions.find(
      (s) => s.test_id === testId && s.student_id === studentId && s.status === 'ACTIVE'
    );

    if (existingActive) {
      // Reconnection: restore existing active session
      existingActive.connection_status = 'connected';
      existingActive.last_heartbeat = now.toISOString();
      existingActive.updated_at = now.toISOString();

      const remainingTime = this.calculateRemainingSeconds(existingActive.end_time, now);
      logger.info(`Restoring existing active session ${existingActive.id} for student ${studentId}. Remaining: ${remainingTime}s`);

      return {
        session: {
          ...existingActive,
          remaining_seconds: remainingTime,
        },
        isRestored: true,
        serverTime: now.toISOString(),
      };
    }

    // 2. Compute absolute server end time based on test duration
    const durationMinutes = Number(test.duration_minutes || test.durationMinutes || test.duration || 60);
    const startedAt = now.toISOString();
    const endTime = new Date(now.getTime() + durationMinutes * 60000).toISOString();
    const sessionId = `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newSession = {
      id: sessionId,
      student_id: studentId,
      student_name: studentName,
      test_id: testId,
      test_title: test.title,
      status: 'ACTIVE',
      attempt_status: 'IN_PROGRESS',
      assessment_status: String(test.status || 'ACTIVE').toUpperCase(),
      started_at: startedAt,
      start_time: startedAt,
      end_time: endTime,
      submitted_at: null,
      connection_status: 'connected',
      last_heartbeat: startedAt,
      score: 0,
      total_marks: test.total_marks || 100,
      warnings_count: 0,
      created_at: startedAt,
      updated_at: startedAt,
    };

    memoryStore.sessions.unshift(newSession);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('sessions').upsert(newSession);
      } catch (err) {
        logger.warn('Supabase create session fallback:', err.message);
      }
    }

    logger.info(`Created active session ${sessionId} for student ${studentId} on test ${testId}. End time: ${endTime}`);

    return {
      session: {
        ...newSession,
        remaining_seconds: durationMinutes * 60,
      },
      isRestored: false,
      serverTime: startedAt,
    };
  }

  static async recordHeartbeat(sessionId) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const now = this.getServerTime();
    session.last_heartbeat = now.toISOString();
    session.connection_status = 'connected';
    session.updated_at = now.toISOString();

    const remainingTime = this.calculateRemainingSeconds(session.end_time, now);
    const isExpired = this.isSessionExpired(session.end_time, now);

    if (isExpired && (session.attempt_status === 'IN_PROGRESS' || session.status === 'ACTIVE')) {
      session.status = 'EXPIRED';
      session.attempt_status = 'AUTO_SUBMITTED';
      session.submitted_at = now.toISOString();
      session.completed_at = now.toISOString();
      logger.info(`Session ${sessionId} marked EXPIRED by authoritative server clock.`);
    }

    return {
      session,
      serverTime: now.toISOString(),
      remaining_seconds: remainingTime,
      isExpired,
      status: session.status,
      connection_status: 'connected',
    };
  }

  static async updateConnectionStatus(sessionId, connectionStatus) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    session.connection_status = connectionStatus; // 'connected' or 'disconnected'
    session.updated_at = new Date().toISOString();
    return session;
  }

  static async submitSession(sessionId, submission = {}) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const nowDate = this.getServerTime();
    const now = nowDate.toISOString();
    if (session.end_time && nowDate.getTime() >= new Date(session.end_time).getTime()) {
      return this.autoSubmitSession(sessionId, nowDate);
    }
    if (session.attempt_status && session.attempt_status !== 'IN_PROGRESS') return session;
    if (submission.score !== undefined) session.score = submission.score;
    if (submission.totalPoints !== undefined) session.total_marks = submission.totalPoints;
    if (submission.state !== undefined) session.latest_submission = submission.state;
    session.status = 'SUBMITTED';
    session.attempt_status = 'SUBMITTED';
    session.submitted_at = now;
    session.updated_at = now;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('sessions').update({ status: 'SUBMITTED', submitted_at: now, updated_at: now }).eq('id', sessionId);
      } catch (err) {
        logger.warn('Supabase submit session fallback:', err.message);
      }
    }

    logger.info(`Session ${sessionId} successfully SUBMITTED.`);
    return session;
  }

  static async autoSubmitSession(sessionId, currentTime = this.getServerTime(), submission = {}) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    if (session.attempt_status && session.attempt_status !== 'IN_PROGRESS') return session;
    if (session.end_time && currentTime.getTime() < new Date(session.end_time).getTime()) {
      const error = new Error('Assessment has not reached its end time.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_EXPIRED';
      throw error;
    }
    const now = currentTime.toISOString();
    if (submission.score !== undefined) session.score = submission.score;
    if (submission.totalPoints !== undefined) session.total_marks = submission.totalPoints;
    if (submission.state !== undefined) session.latest_submission = submission.state;
    session.status = 'EXPIRED';
    session.attempt_status = 'AUTO_SUBMITTED';
    session.submitted_at = session.submitted_at || now;
    session.completed_at = session.completed_at || now;
    session.updated_at = now;
    return session;
  }

  static async getAttempt(testId, studentId) {
    const session = memoryStore.sessions.find(
      (item) => item.test_id === testId && item.student_id === studentId &&
        ['IN_PROGRESS', 'ACTIVE'].includes(item.attempt_status || item.status)
    );
    if (!session) return null;
    const serverTime = this.getServerTime();
    if (this.isSessionExpired(session.end_time, serverTime)) {
      await this.autoSubmitSession(session.id, serverTime);
    }
    return {
      ...session,
      server_time: serverTime.toISOString(),
      remaining_seconds: this.calculateRemainingSeconds(session.end_time, serverTime),
    };
  }

  static async expireDueSessions() {
    const now = this.getServerTime();
    for (const session of memoryStore.sessions) {
      if (['IN_PROGRESS', 'ACTIVE'].includes(session.attempt_status || session.status) &&
          session.end_time && new Date(session.end_time).getTime() <= now.getTime()) {
        await this.autoSubmitSession(session.id, now);
      }
    }
  }

  static async terminateSession(sessionId, reason = 'Terminated by proctor') {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const now = new Date().toISOString();
    session.status = 'TERMINATED';
    session.submitted_at = now;
    session.termination_reason = reason;
    session.updated_at = now;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('sessions').update({ status: 'TERMINATED', submitted_at: now, updated_at: now }).eq('id', sessionId);
      } catch (err) {
        logger.warn('Supabase terminate session fallback:', err.message);
      }
    }

    logger.info(`Session ${sessionId} TERMINATED. Reason: ${reason}`);
    return session;
  }

  static async getSessionsByTestId(testId) {
    return memoryStore.sessions.filter((s) => s.test_id === testId);
  }
}
