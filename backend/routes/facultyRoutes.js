import { Router } from 'express';
import { FacultyController } from '../controllers/facultyController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, FacultyController.getFaculty);
router.get('/:id', optionalAuthenticate, FacultyController.getFacultyById);
router.post('/', authenticate, requireRole('ADMIN'), FacultyController.createFaculty);
router.put('/:id', authenticate, requireRole('ADMIN'), FacultyController.updateFaculty);
router.delete('/:id', authenticate, requireRole('ADMIN'), FacultyController.deleteFaculty);

export default router;
