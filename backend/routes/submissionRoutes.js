import { Router } from 'express';
import { SubmissionController } from '../controllers/submissionController.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, SubmissionController.getSubmissions);
router.post('/', optionalAuthenticate, SubmissionController.submitCode);
router.post('/run', SubmissionController.runCode);
router.get('/:id', optionalAuthenticate, SubmissionController.getSubmissionById);

export default router;
