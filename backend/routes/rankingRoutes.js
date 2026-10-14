import { Router } from 'express';
import { RankingController } from '../controllers/rankingController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, RankingController.getRankings);
router.get('/test/:testId', optionalAuthenticate, RankingController.getTestRankings);
router.get('/:testId', optionalAuthenticate, RankingController.getTestRankings);
router.get('/student/:studentId', authenticate, RankingController.getStudentRank);

export default router;
