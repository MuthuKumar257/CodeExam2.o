import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';
import { QuestionController } from '../controllers/questionController.js';

const router = express.Router();

router.put('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.updateTestcase);
router.delete('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.deleteTestcase);

export default router;
