import { Router } from 'express';
import { ReportController } from '../controllers/reportController.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, ReportController.getReports);
router.get('/overview', optionalAuthenticate, ReportController.getOverviewReport);
router.get('/tests/:testId', optionalAuthenticate, ReportController.getTestReport);
router.get('/students/:studentId', optionalAuthenticate, ReportController.getStudentReport);

export default router;
