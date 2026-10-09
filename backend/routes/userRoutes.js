import express from 'express';
import { UserController } from '../controllers/userController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', optionalAuthenticate, UserController.getUsers);
router.get('/:id', optionalAuthenticate, UserController.getUserById);
router.post('/', authenticate, requireRole('ADMIN', 'FACULTY'), UserController.createUser);
router.put('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), UserController.updateUser);
router.delete('/:id', authenticate, requireRole('ADMIN', 'FACULTY'), UserController.deleteUser);
router.post('/:id/reset-password', authenticate, requireRole('ADMIN', 'FACULTY'), UserController.resetPassword);
router.post('/:id/update-password', authenticate, UserController.updatePassword);

export default router;

