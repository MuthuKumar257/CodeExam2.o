import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { StudentController } from '../controllers/studentController.js';
import { FacultyController } from '../controllers/facultyController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, AdminController.getAdmins);
router.post('/', authenticate, requireRole('ADMIN'), AdminController.createAdmin);
router.get('/students', optionalAuthenticate, StudentController.getStudents);
router.get('/faculty', optionalAuthenticate, FacultyController.getFaculty);
router.get('/settings', optionalAuthenticate, AdminController.getSettings);
router.put('/settings', authenticate, requireRole('ADMIN'), AdminController.updateSettings);
router.get('/activity', authenticate, requireRole('ADMIN'), AdminController.getSystemActivity);

export default router;
