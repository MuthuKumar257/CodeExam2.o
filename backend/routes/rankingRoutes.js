import { Router } from 'express';
import { RankingController } from '../controllers/rankingController.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', optionalAuthenticate, RankingController.getRankings);
router.get('/test/:testId', optionalAuthenticate, RankingController.getTestRankings);
router.get('/:testId', optionalAuthenticate, RankingController.getTestRankings);
router.get('/student/:studentId', optionalAuthenticate, RankingController.getStudentRank);


export default router;
