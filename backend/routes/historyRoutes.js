import express from 'express';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';
import { SessionService } from '../services/sessionService.js';
import { sendSuccess } from '../utils/response.js';

const router = express.Router();

router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const studentId = req.query.studentId || req.user?.id;
    const sessions = studentId ? await SessionService.getStudentSessions(studentId) : [];
    return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE'));
  } catch (error) {
    return next(error);
  }
});

router.get('/student/:studentId', optionalAuthenticate, async (req, res, next) => {
  try {
    const sessions = await SessionService.getStudentSessions(req.params.studentId);
    return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE'));
  } catch (error) {
    return next(error);
  }
});

router.get('/test/:testId', optionalAuthenticate, async (req, res, next) => {
  try {
    const sessions = await SessionService.getSessionsByTestId(req.params.testId);
    return sendSuccess(res, sessions.filter((session) => session.status !== 'ACTIVE'));
  } catch (error) {
    return next(error);
  }
});

export default router;
