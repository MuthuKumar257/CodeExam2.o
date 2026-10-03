import { RankingService } from '../services/rankingService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class RankingController {
  static async getRankings(req, res, next) {
    try {
      const rankings = await RankingService.getRankings();
      return sendSuccess(res, rankings);
    } catch (err) {
      next(err);
    }
  }

  static async getTestRankings(req, res, next) {
    try {
      const rankings = await RankingService.getRankings(req.params.testId);
      return sendSuccess(res, rankings);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentRank(req, res, next) {
    try {
      const rank = await RankingService.getStudentRank(req.params.studentId);
      if (!rank) {
        return sendError(res, 'Student ranking not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, rank);
    } catch (err) {
      next(err);
    }
  }
}
