import { Router } from 'express';
import { SessionController } from '../controllers/sessionController.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', optionalAuthenticate, SessionController.createOrRestoreSession);
router.get('/test/:testId', optionalAuthenticate, SessionController.getSessionsByTest);
router.get('/test/:testId/active', optionalAuthenticate, SessionController.getSessionsByTest);
router.get('/:id', optionalAuthenticate, SessionController.getSessionById);
router.put('/:id/heartbeat', SessionController.recordHeartbeat);
router.post('/:id/heartbeat', SessionController.recordHeartbeat); // Support POST as well
router.post('/:id/submit', optionalAuthenticate, SessionController.submitSession);
router.post('/:id/terminate', optionalAuthenticate, SessionController.terminateSession);

export default router;

