import { memoryStore } from '../services/supabaseService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class MonitoringController {
  static async getAssessmentMonitoring(req, res, next) {
    try {
      const assessmentId = req.params.assessmentId;
      const students = memoryStore.sessions
        .filter((session) => session.test_id === assessmentId)
        .map((session) => ({
          sessionId: session.id,
          attemptId: session.id,
          assessmentId,
          studentId: session.student_id,
          studentName: session.student_name,
          status: session.status,
          streamStatus: session.status === 'ACTIVE' ? 'LIVE' : 'OFFLINE',
          screenActive: session.status === 'ACTIVE',
          cameraActive: session.status === 'ACTIVE',
          connectionStatus: session.connection_status || 'disconnected',
          warningsCount: session.warnings_count || 0,
          timeSpentSeconds: Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)),
        }));
      return sendSuccess(res, { students });
    } catch (err) {
      next(err);
    }
  }

  static async updateMonitoringStatus(req, res, next) {
    try {
      const session = memoryStore.sessions.find((item) => item.id === req.params.sessionId);
      if (!session) return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      const { status, streamStatus, screenActive, cameraActive, event } = req.body || {};
      if (status) session.status = status;
      if (streamStatus) session.stream_status = streamStatus;
      if (screenActive !== undefined) session.screen_active = Boolean(screenActive);
      if (cameraActive !== undefined) session.camera_active = Boolean(cameraActive);
      if (event) session.last_monitoring_event = { ...event, timestamp: new Date().toISOString() };
      session.updated_at = new Date().toISOString();
      return sendSuccess(res, { session });
    } catch (err) {
      next(err);
    }
  }

  static async getActiveMonitoring(req, res, next) {
    try {
      // ONLY ACTIVE sessions appear in live monitoring!
      const activeSessions = memoryStore.sessions
        .filter((s) => s.status === 'ACTIVE')
        .map((s) => {
          const test = memoryStore.tests.find((t) => t.id === s.test_id);
          return {
            ...s,
            test_title: test?.title || s.test_title,
          };
        });

      return sendSuccess(res, activeSessions);
    } catch (err) {
      next(err);
    }
  }

  static async getSessionMonitoringDetails(req, res, next) {
    try {
      const sessionId = req.params.sessionId;
      const session = memoryStore.sessions.find((s) => s.id === sessionId);

      if (!session) {
        return sendError(res, 'Session not found.', 404, 'NOT_FOUND');
      }

      // If no longer ACTIVE, return notice
      const isStillActive = session.status === 'ACTIVE';
      const submissions = memoryStore.submissions.filter((sub) => sub.session_id === sessionId);

      return sendSuccess(res, {
        session,
        is_active: isStillActive,
        submissions_count: submissions.length,
        submissions,
      });
    } catch (err) {
      next(err);
    }
  }
}
