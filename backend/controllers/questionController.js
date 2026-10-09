import { QuestionService } from '../services/questionService.js';
import { memoryStore } from '../services/supabaseService.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class QuestionController {
  static async getQuestions(req, res, next) {
    try {
      const role = req.user?.role || 'STUDENT';
      const { page = 1, limit = 50, difficulty } = req.query;
      const result = await QuestionService.listQuestions(role, { page, limit, difficulty });
      return sendPaginated(res, result.data, result.pagination, 'Questions retrieved successfully.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }

  static async getTestQuestions(req, res, next) {
    try {
      const testId = req.params.testId;
      const test = memoryStore.tests.find((t) => t.id === testId && !t.is_deleted);
      if (!test) {
        return sendError(res, 'Test not found.', 404, 'TEST_NOT_FOUND');
      }

      const role = req.user?.role || 'STUDENT';
      const questionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
      const questions = [];

      for (const qId of questionIds) {
        const q = await QuestionService.getQuestionById(qId, role);
        if (q) questions.push(q);
      }

      return sendSuccess(res, questions);
    } catch (err) {
      next(err);
    }
  }

  static async getQuestionById(req, res, next) {
    try {
      const role = req.user?.role || 'STUDENT';
      const question = await QuestionService.getQuestionById(req.params.id, role);
      if (!question) {
        return sendError(res, 'Question not found.', 404, 'QUESTION_NOT_FOUND');
      }
      return sendSuccess(res, question);
    } catch (err) {
      next(err);
    }
  }

  static async createQuestion(req, res, next) {
    try {
      const question = await QuestionService.createQuestion(req.body);
      return sendSuccess(res, question, 'Question created successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateQuestion(req, res, next) {
    try {
      const updated = await QuestionService.updateQuestion(req.params.id, req.body);
      if (!updated) {
        return sendError(res, 'Question not found.', 404, 'QUESTION_NOT_FOUND');
      }
      return sendSuccess(res, updated, 'Question updated successfully.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteQuestion(req, res, next) {
    try {
      const success = await QuestionService.deleteQuestion(req.params.id);
      if (!success) {
        return sendError(res, 'Question not found.', 404, 'QUESTION_NOT_FOUND');
      }

      const { broadcastDatabaseUpdate } = await import('../websocket/testSocket.js');
      broadcastDatabaseUpdate({ table: 'questions', id: req.params.id, action: 'delete' });

      return sendSuccess(res, { id: req.params.id, deleted: true }, 'Question deleted.');
    } catch (err) {
      next(err);
    }
  }

  static async getTestcases(req, res, next) {
    try {
      const role = req.user?.role || 'STUDENT';
      const testcases = await QuestionService.getTestcases(req.params.id, role);
      return sendSuccess(res, testcases);
    } catch (err) {
      next(err);
    }
  }

  static async addTestcase(req, res, next) {
    try {
      const testcase = await QuestionService.addTestcase(req.params.id, req.body);
      return sendSuccess(res, testcase, 'Testcase added.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async updateTestcase(req, res, next) {
    try {
      const updated = await QuestionService.updateTestcase(req.params.id, req.body);
      if (!updated) {
        return sendError(res, 'Testcase not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, updated, 'Testcase updated.');
    } catch (err) {
      next(err);
    }
  }

  static async deleteTestcase(req, res, next) {
    try {
      const success = await QuestionService.deleteTestcase(req.params.id);
      if (!success) {
        return sendError(res, 'Testcase not found.', 404, 'NOT_FOUND');
      }

      const { broadcastDatabaseUpdate } = await import('../websocket/testSocket.js');
      broadcastDatabaseUpdate({ table: 'testcases', id: req.params.id, action: 'delete' });

      return sendSuccess(res, { id: req.params.id, deleted: true }, 'Testcase deleted.');
    } catch (err) {
      next(err);
    }
  }
}
