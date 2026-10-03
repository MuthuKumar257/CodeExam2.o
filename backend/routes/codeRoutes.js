import { Router } from 'express';
import { SubmissionController } from '../controllers/submissionController.js';

const router = Router();

router.post('/run', SubmissionController.runCode);
router.post('/submit', SubmissionController.submitCode);

export default router;
