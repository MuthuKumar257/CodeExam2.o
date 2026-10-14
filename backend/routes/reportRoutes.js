import { Router } from 'express';
import { ReportController } from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticate, ReportController.getReports);
router.get('/overview', authenticate, ReportController.getOverviewReport);
router.get('/tests/:testId', authenticate, ReportController.getTestReport);
router.get('/students/:studentId', authenticate, ReportController.getStudentReport);

export default router;
