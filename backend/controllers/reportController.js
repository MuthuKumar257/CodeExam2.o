import { ReportService } from '../services/reportService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class ReportController {
  static async getReports(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));
      const activeTests = (await import('../services/supabaseService.js')).memoryStore.tests.filter(
        (t) => !t.is_deleted && t.status !== 'DELETED'
      );
      const total = activeTests.length;
      const paginatedTests = activeTests.slice((p - 1) * l, (p - 1) * l + l);
      const reportsList = await Promise.all(
        paginatedTests.map(async (t) => {
          const report = await ReportService.getTestReport(t.id);
          return report || { test: t, summary: {} };
        })
      );
      return sendPaginated(res, reportsList, { page: p, limit: l, total, hasMore: p * l < total }, 'Reports retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getOverviewReport(req, res, next) {
    try {
      const overview = await ReportService.getOverviewReport();
      return sendSuccess(res, overview);
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getTestReport(req, res, next) {
    try {
      const report = await ReportService.getTestReport(req.params.testId);
      if (!report) {
        return sendError(res, 'Test not found or has been deleted.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentReport(req, res, next) {
    try {
      const report = await ReportService.getStudentReport(req.params.studentId);
      if (!report) {
        return sendError(res, 'Student not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  }
}
