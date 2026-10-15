import { SessionService } from '../services/sessionService.js';
import { memoryStore } from '../services/supabaseService.js';
import { isStudentUser } from '../middleware/authMiddleware.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export class SessionController {
  static async getAllSessions(req, res, next) {
    try {
      const { test_id, testId, student_id, studentId, status, page = 1, limit = 50 } = req.query;
      const targetTest = test_id || testId;
      const requestedStudent = student_id || studentId;
      const isStudent = isStudentUser(req.user);

      let targetStudent = requestedStudent;
      if (isStudent) {
        if (requestedStudent && requestedStudent !== req.user.id && requestedStudent !== req.user.email) {
          return sendError(res, 'Access denied. You can only access your own sessions.', 403, 'FORBIDDEN', req.requestId);
        }
        targetStudent = req.user.id;
      }

      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let sessions = memoryStore.sessions;
      if (targetTest) sessions = sessions.filter((s) => s.test_id === targetTest || s.assessmentId === targetTest);
      if (targetStudent) sessions = sessions.filter((s) => s.student_id === targetStudent || s.candidateId === targetStudent);
      if (status) sessions = sessions.filter((s) => s.status?.toUpperCase() === status.toUpperCase());

      const total = sessions.length;
      const paginated = sessions.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Sessions retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async createOrRestoreSession(req, res, next) {
    try {
      const { test_id, testId, student_id, studentId, student_name, studentName } = req.body;
      const targetTestId = test_id || testId;
      const requestedStudentId = student_id || studentId;
      const isStudent = isStudentUser(req.user);

      let targetStudentId = requestedStudentId || req.user?.id;
      let targetName = student_name || studentName || req.user?.name || 'Student';

      if (isStudent) {
        if (requestedStudentId && requestedStudentId !== req.user.id && requestedStudentId !== req.user.email) {
          return sendError(res, 'Access denied. You cannot start a session for another student.', 403, 'FORBIDDEN', req.requestId);
        }
        targetStudentId = req.user.id;
        targetName = req.user.name || 'Student';
      }

      if (!targetTestId || !targetStudentId) {
        return sendError(res, 'Test ID and Student ID are required.', 400, 'MISSING_FIELDS');
      }

      const result = await SessionService.startOrRestoreSession(targetTestId, targetStudentId, targetName);
      return sendSuccess(
        res,
        result.session,
        result.isRestored ? 'Active session restored.' : 'New session started.',
        result.isRestored ? 200 : 201
      );
    } catch (err) {
      next(err);
    }
  }

  static async getSessionById(req, res, next) {
    try {
      const session = await SessionService.getSessionById(req.params.id);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      const isStudent = isStudentUser(req.user);
      if (isStudent) {
        const ownerId = session.student_id || session.candidateId;
        const ownerEmail = session.student_email || session.candidateEmail;
        if (ownerId !== req.user.id && ownerEmail !== req.user.email) {
          return sendError(res, 'Access denied. You can only access your own session.', 403, 'FORBIDDEN', req.requestId);
        }
      }
      return sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentSessions(req, res, next) {
    try {
      const isStudent = isStudentUser(req.user);
      if (isStudent && req.params.studentId !== req.user.id && req.params.studentId !== req.user.email) {
        return sendError(res, 'Access denied. You can only view your own sessions.', 403, 'FORBIDDEN', req.requestId);
      }
      const sessions = await SessionService.getStudentSessions(req.params.studentId);
      return sendSuccess(res, sessions);
    } catch (err) {
      next(err);
    }
  }

  static async recordHeartbeat(req, res, next) {
    try {
      const session = await SessionService.getSessionById(req.params.id);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      const isStudent = isStudentUser(req.user);
      if (!isStudent) {
        logger.warn(`[${req.requestId || 'NO_REQUEST_ID'}] Heartbeat rejected: authenticated_user_not_student.`);
        return sendError(res, 'Only the student who owns this session can send its heartbeat.', 403, 'FORBIDDEN', req.requestId);
      }
      const ownerId = session.student_id || session.candidateId;
      const ownerEmail = session.student_email || session.candidateEmail;
      if (ownerId !== req.user.id && ownerEmail !== req.user.email) {
        logger.warn(`[${req.requestId || 'NO_REQUEST_ID'}] Heartbeat rejected: session_owner_mismatch.`);
        return sendError(res, 'Access denied. You can only update heartbeat for your own session.', 403, 'FORBIDDEN', req.requestId);
      }
      if (session.status?.toUpperCase() !== 'ACTIVE' || (session.attempt_status && session.attempt_status !== 'IN_PROGRESS')) {
        logger.warn(`[${req.requestId || 'NO_REQUEST_ID'}] Heartbeat rejected: session_not_active.`);
        return sendError(res, 'This assessment session is no longer active.', 409, 'SESSION_NOT_ACTIVE', req.requestId);
      }
      const result = await SessionService.recordHeartbeat(req.params.id);
      if (!result) return sendError(res, 'Session not found.', 404, 'NOT_FOUND', req.requestId);
      return sendSuccess(res, result, 'Heartbeat recorded.');
    } catch (err) {
      next(err);
    }
  }

  static async submitSession(req, res, next) {
    try {
      const existing = await SessionService.getSessionById(req.params.id);
      if (!existing) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      const isStudent = isStudentUser(req.user);
      if (isStudent) {
        const ownerId = existing.student_id || existing.candidateId;
        const ownerEmail = existing.student_email || existing.candidateEmail;
        if (ownerId !== req.user.id && ownerEmail !== req.user.email) {
          return sendError(res, 'Access denied. You can only submit your own session.', 403, 'FORBIDDEN', req.requestId);
        }
      }
      const session = await SessionService.submitSession(req.params.id);
      return sendSuccess(res, session, 'Test session submitted.');
    } catch (err) {
      next(err);
    }
  }

  static async terminateSession(req, res, next) {
    try {
      const existing = await SessionService.getSessionById(req.params.id);
      if (!existing) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      const isStudent = isStudentUser(req.user);
      if (isStudent) {
        const ownerId = existing.student_id || existing.candidateId;
        const ownerEmail = existing.student_email || existing.candidateEmail;
        if (ownerId !== req.user.id && ownerEmail !== req.user.email) {
          return sendError(res, 'Access denied. You can only terminate your own session.', 403, 'FORBIDDEN', req.requestId);
        }
      }
      const reason = req.body.reason || 'Terminated by administrative supervisor';
      const session = await SessionService.terminateSession(req.params.id, reason);
      return sendSuccess(res, session, 'Test session terminated.');
    } catch (err) {
      next(err);
    }
  }

  static async getSessionsByTest(req, res, next) {
    try {
      let sessions = await SessionService.getSessionsByTestId(req.params.testId);
      const isStudent = isStudentUser(req.user);
      if (isStudent) {
        sessions = sessions.filter(
          (s) => s.student_id === req.user.id || s.candidateId === req.user.id
        );
      }
      return sendSuccess(res, sessions);
    } catch (err) {
      next(err);
    }
  }
}


