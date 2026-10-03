import { Router } from 'express';
import { MonitoringController } from '../controllers/monitoringController.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/active', optionalAuthenticate, MonitoringController.getActiveMonitoring);
router.get('/session/:sessionId', optionalAuthenticate, MonitoringController.getSessionMonitoringDetails);
router.post('/:sessionId/status', optionalAuthenticate, MonitoringController.updateMonitoringStatus);
router.get('/:assessmentId', optionalAuthenticate, MonitoringController.getAssessmentMonitoring);

export default router;
