import { Router } from 'express';
import { TestController } from '../controllers/testController.js';
import { QuestionController } from '../controllers/questionController.js';
import { SubmissionController } from '../controllers/submissionController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, TestController.getTests);
router.get('/:id', optionalAuthenticate, TestController.getTestById);
router.post('/', authenticate, requireRole('ADMIN', 'FACULTY'), TestController.createTest);
router.put('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), TestController.updateTest);
router.delete('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), TestController.deleteTest);

// Active test flow
router.post('/:id/start', optionalAuthenticate, TestController.startTest);
router.get('/:id/attempt', optionalAuthenticate, TestController.getAttempt);
router.post('/:id/heartbeat', optionalAuthenticate, TestController.heartbeat);
router.get('/:id/server-time', optionalAuthenticate, TestController.serverTime);
router.post('/:id/auto-submit', optionalAuthenticate, TestController.autoSubmit);
router.post('/:id/submit', optionalAuthenticate, TestController.submitTest);
router.post('/:id/terminate', authenticate, requireRole('ADMIN', 'FACULTY'), TestController.terminateTest);

// Subroutes under test
router.get('/:testId/questions', optionalAuthenticate, QuestionController.getTestQuestions);
router.get('/:testId/submissions', optionalAuthenticate, SubmissionController.getTestSubmissions);

export default router;
