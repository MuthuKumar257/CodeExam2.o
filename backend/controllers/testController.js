import { TestService } from '../services/testService.js';
import { SessionService } from '../services/sessionService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class TestController {
  static async getTests(req, res, next) {
    try {
      const { facultyId, status, page = 1, limit = 50 } = req.query;
      const result = await TestService.listTests({ facultyId, status, page, limit });
      return sendPaginated(res, result.data, result.pagination, 'Tests retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getTestById(req, res, next) {
    try {
      const test = await TestService.getTestById(req.params.id);
      if (!test) {
        return sendError(res, 'Test not found.', 404, 'TEST_NOT_FOUND');
      }
      return sendSuccess(res, test);
    } catch (err) {
      next(err);
    }
  }

  static async createTest(req, res, next) {
    try {
      const facultyId = req.user?.id || req.body.faculty_id || 'usr-faculty-01';
      const facultyName = req.user?.name || req.body.faculty_name || 'Faculty Member';
      const newTest = await TestService.createTest(req.body, facultyId, facultyName);
      return sendSuccess(res, newTest, 'Test created successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateTest(req, res, next) {
    try {
      const updated = await TestService.updateTest(req.params.id, req.body);
      if (!updated) {
        return sendError(res, 'Test not found.', 404, 'TEST_NOT_FOUND');
      }
      return sendSuccess(res, updated, 'Test updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteTest(req, res, next) {
    try {
      const success = await TestService.deleteTest(req.params.id);
      if (!success) {
        return sendError(res, 'Test not found.', 404, 'TEST_NOT_FOUND');
      }
      return sendSuccess(res, { id: req.params.id, deleted: true }, 'Test deleted successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async startTest(req, res, next) {
    try {
      const testId = req.params.id;
      const studentId = req.user?.id || req.body.student_id || req.body.studentId || req.body.candidateId;
      const studentName =
        req.user?.name ||
        req.body.student_name ||
        req.body.studentName ||
        req.body.candidateName ||
        'Student';

      if (!studentId) {
        return sendError(res, 'Student ID is required.', 400, 'MISSING_STUDENT_ID');
      }

      const result = await SessionService.startOrRestoreSession(testId, studentId, studentName);
      return sendSuccess(
        res,
        result,
        result.isRestored ? 'Session restored.' : 'Test session started.',
        result.isRestored ? 200 : 201
      );
    } catch (err) {
      next(err);
    }
  }

  static async submitTest(req, res, next) {
    try {
      const sessionId = req.body.session_id || req.body.sessionId;
      if (!sessionId) {
        return sendError(res, 'Session ID is required to submit test.', 400, 'MISSING_SESSION_ID');
      }

      const session = await SessionService.submitSession(sessionId, req.body);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'SESSION_NOT_FOUND');
      }
      if (session.attempt_status === 'AUTO_SUBMITTED') {
        return sendError(res, 'Attempt expired before the submission was accepted.', 409, 'ATTEMPT_EXPIRED');
      }
      return sendSuccess(res, session, 'Test submitted successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async getAttempt(req, res, next) {
    try {
      const studentId = req.user?.id || req.query.studentId || req.headers['x-student-id'];
      if (!studentId) return sendError(res, 'Student ID is required.', 400, 'MISSING_STUDENT_ID');
      const attempt = await SessionService.getAttempt(req.params.id, studentId);
      return sendSuccess(res, attempt || { status: 'NOT_STARTED', server_time: SessionService.getServerTime().toISOString() });
    } catch (err) { next(err); }
  }

  static async heartbeat(req, res, next) {
    try {
      const sessionId = req.body.session_id || req.body.sessionId;
      if (!sessionId) return sendError(res, 'Session ID is required.', 400, 'MISSING_SESSION_ID');
      const result = await SessionService.recordHeartbeat(sessionId);
      return result ? sendSuccess(res, result) : sendError(res, 'Session not found.', 404, 'SESSION_NOT_FOUND');
    } catch (err) { next(err); }
  }

  static async autoSubmit(req, res, next) {
    try {
      const sessionId = req.body.session_id || req.body.sessionId;
      if (!sessionId) return sendError(res, 'Session ID is required.', 400, 'MISSING_SESSION_ID');
      const result = await SessionService.autoSubmitSession(sessionId, SessionService.getServerTime(), req.body);
      return result ? sendSuccess(res, result) : sendError(res, 'Session not found.', 404, 'SESSION_NOT_FOUND');
    } catch (err) { next(err); }
  }

  static async serverTime(req, res) {
    return sendSuccess(res, { serverTime: SessionService.getServerTime().toISOString() });
  }

  static async terminateTest(req, res, next) {
    try {
      const sessionId = req.body.session_id || req.body.sessionId;
      const reason = req.body.reason || 'Terminated by proctor/administrator';
      if (!sessionId) {
        return sendError(res, 'Session ID is required.', 400, 'MISSING_SESSION_ID');
      }
      const session = await SessionService.terminateSession(sessionId, reason);
      if (!session) {
        return sendError(res, 'Session not found.', 404, 'SESSION_NOT_FOUND');
      }
      return sendSuccess(res, session, 'Test session terminated.');
    } catch (err) {
      next(err);
    }
  }
}
