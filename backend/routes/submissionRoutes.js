import { Router } from 'express';
import { SubmissionController } from '../controllers/submissionController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticate, SubmissionController.getSubmissions);
router.post('/', authenticate, SubmissionController.submitCode);
router.post('/run', SubmissionController.runCode);
router.get('/student/:studentId', authenticate, SubmissionController.getStudentSubmissions);
router.get('/test/:testId', authenticate, SubmissionController.getTestSubmissions);
router.get('/:id', authenticate, SubmissionController.getSubmissionById);

export default router;
