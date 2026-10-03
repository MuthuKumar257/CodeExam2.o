import { ReportService } from '../services/reportService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class ReportController {
  static async getOverviewReport(req, res, next) {
    try {
      const overview = await ReportService.getOverviewReport();
      return sendSuccess(res, overview);
    } catch (err) {
      next(err);
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
