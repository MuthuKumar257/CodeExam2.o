import { Router } from 'express';
import { QuestionController } from '../controllers/questionController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, QuestionController.getQuestions);
router.get('/:id', optionalAuthenticate, QuestionController.getQuestionById);
router.post('/', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.createQuestion);
router.put('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.updateQuestion);
router.delete('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.deleteQuestion);

// Testcases management under questions
router.get('/:id/testcases', optionalAuthenticate, QuestionController.getTestcases);
router.post('/:id/testcases', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.addTestcase);
router.put('/testcases/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.updateTestcase);
router.delete('/testcases/:id', authenticate, requireRole('ADMIN', 'FACULTY'), QuestionController.deleteTestcase);

export default router;
