import { SessionService } from '../services/sessionService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class SessionController {
  static async createOrRestoreSession(req, res, next) {
    try {
      const { test_id, testId, student_id, studentId, student_name, studentName } = req.body;
      const targetTestId = test_id || testId;
      const targetStudentId = student_id || studentId || req.user?.id;
      const targetName = student_name || studentName || req.user?.name || 'Student';

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
      return sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentSessions(req, res, next) {
    try {
      const sessions = await SessionService.getStudentSessions(req.params.studentId);
      return sendSuccess(res, sessions);
    } catch (err) {
      next(err);
    }
  }

  static async recordHeartbeat(req, res, next) {
    try {
      const result = await SessionService.recordHeartbeat(req.params.id);
      if (!result) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, result, 'Heartbeat recorded.');
    } catch (err) {
      next(err);
    }
  }

  static async submitSession(req, res, next) {
    try {
      const session = await SessionService.submitSession(req.params.id);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, session, 'Test session submitted.');
    } catch (err) {
      next(err);
    }
  }

  static async terminateSession(req, res, next) {
    try {
      const reason = req.body.reason || 'Terminated by administrative supervisor';
      const session = await SessionService.terminateSession(req.params.id, reason);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, session, 'Test session terminated.');
    } catch (err) {
      next(err);
    }
  }

  static async getSessionsByTest(req, res, next) {
    try {
      const sessions = await SessionService.getSessionsByTestId(req.params.testId);
      return sendSuccess(res, sessions);
    } catch (err) {
      next(err);
    }
  }
}

