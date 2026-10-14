import express from 'express';
import { authenticate, isStudentUser } from '../middleware/authMiddleware.js';
import { SessionService } from '../services/sessionService.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const isStudent = isStudentUser(req.user);
    const requestedStudentId = req.query.studentId || req.query.student_id;

    if (isStudent) {
      if (requestedStudentId && requestedStudentId !== req.user.id && requestedStudentId !== req.user.email) {
        return sendError(res, 'Access denied. You can only view your own history.', 403, 'FORBIDDEN', req.requestId);
      }
      const sessions = await SessionService.getStudentSessions(req.user.id);
      return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE' && session.state !== 'ACTIVE'));
    }

    if (requestedStudentId) {
      const sessions = await SessionService.getStudentSessions(requestedStudentId);
      return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE' && session.state !== 'ACTIVE'));
    }

    const allSessions = await SessionService.getAllCompletedSessions();
    return sendSuccess(res, allSessions);
  } catch (error) {
    return next(error);
  }
});

router.get('/student/:studentId', authenticate, async (req, res, next) => {
  try {
    const isStudent = isStudentUser(req.user);
    if (isStudent && req.params.studentId !== req.user.id && req.params.studentId !== req.user.email) {
      return sendError(res, 'Access denied. You can only view your own history.', 403, 'FORBIDDEN', req.requestId);
    }
    const sessions = await SessionService.getStudentSessions(req.params.studentId);
    return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE' && session.state !== 'ACTIVE'));
  } catch (error) {
    return next(error);
  }
});

router.get('/test/:testId', authenticate, async (req, res, next) => {
  try {
    const isStudent = isStudentUser(req.user);
    const sessions = await SessionService.getSessionsByTestId(req.params.testId);
    if (isStudent) {
      const studentSessions = sessions.filter(
        (s) => (s.student_id === req.user.id || s.candidateId === req.user.id) && s.status !== 'ACTIVE' && s.state !== 'ACTIVE'
      );
      return sendSuccess(res, studentSessions);
    }
    return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE' && session.state !== 'ACTIVE'));
  } catch (error) {
    return next(error);
  }
});

export default router;
