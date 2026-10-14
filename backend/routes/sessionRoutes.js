import { Router } from 'express';
import { SessionController } from '../controllers/sessionController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticate, SessionController.getAllSessions);
router.post('/', authenticate, SessionController.createOrRestoreSession);
router.get('/test/:testId', authenticate, SessionController.getSessionsByTest);
router.get('/test/:testId/active', authenticate, SessionController.getSessionsByTest);
router.get('/:id', authenticate, SessionController.getSessionById);
router.put('/:id/heartbeat', authenticate, SessionController.recordHeartbeat);
router.post('/:id/heartbeat', authenticate, SessionController.recordHeartbeat); // Support POST as well
router.post('/:id/submit', authenticate, SessionController.submitSession);
router.post('/:id/terminate', authenticate, SessionController.terminateSession);

export default router;

