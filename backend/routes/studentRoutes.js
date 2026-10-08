import { Router } from 'express';
import { StudentController } from '../controllers/studentController.js';
import { SessionController } from '../controllers/sessionController.js';
import { SubmissionController } from '../controllers/submissionController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, StudentController.getStudents);
router.get('/:id', optionalAuthenticate, StudentController.getStudentById);
router.post('/bulk-import', authenticate, requireRole('ADMIN', 'FACULTY'), StudentController.bulkImport);
router.post('/', authenticate, requireRole('ADMIN', 'FACULTY'), StudentController.createStudent);
router.put('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), StudentController.updateStudent);
router.delete('/:id', authenticate, requireRole('ADMIN'), StudentController.deleteStudent);

// Student sessions and submissions subroutes
router.get('/:studentId/sessions', optionalAuthenticate, SessionController.getStudentSessions);
router.get('/:studentId/submissions', optionalAuthenticate, SubmissionController.getStudentSubmissions);

export default router;
