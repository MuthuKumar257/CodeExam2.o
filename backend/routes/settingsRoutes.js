import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, AdminController.getSettings);
router.put('/', authenticate, requireRole('ADMIN'), AdminController.updateSettings);

export default router;
