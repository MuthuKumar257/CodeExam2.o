import { RankingService } from '../services/rankingService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class RankingController {
  static async getRankings(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));
      const rankings = await RankingService.getRankings();
      const total = rankings.length;
      const paginated = rankings.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Rankings retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getTestRankings(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));
      const rankings = await RankingService.getRankings(req.params.testId);
      const total = rankings.length;
      const paginated = rankings.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Test rankings retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
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
