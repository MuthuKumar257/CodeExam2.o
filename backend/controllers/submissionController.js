import { SubmissionService } from '../services/submissionService.js';
import { executeCodeInSandbox } from '../services/codeRunnerService.js';
import { executeCodeBatchInSandbox } from '../services/codeRunnerService.js';
import { getLanguageConfig } from '../services/codeRunnerService.js';
import { SessionService } from '../services/sessionService.js';
import { evaluateOutput } from '../services/scoringService.js';
import { memoryStore } from '../services/supabaseService.js';
import { randomUUID } from 'crypto';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

export class SubmissionController {
  static async getSubmissions(req, res, next) {
    try {
      const { test_id, testId, student_id, studentId, page = 1, limit = 50 } = req.query;
      const targetTest = test_id || testId;
      const targetStudent = student_id || studentId;
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

      let list = memoryStore.submissions;
      if (targetTest) list = list.filter((s) => s.test_id === targetTest || s.assessmentId === targetTest);
      if (targetStudent) list = list.filter((s) => s.student_id === targetStudent || s.candidateId === targetStudent);

      const total = list.length;
      const paginated = list.slice((p - 1) * l, (p - 1) * l + l);
      return sendPaginated(res, paginated, { page: p, limit: l, total, hasMore: p * l < total }, 'Submissions retrieved.');
    } catch (err) {
      return sendError(res, 'Unable to fetch data from the database.', 500, 'DATABASE_FETCH_FAILED', req.requestId);
    }
  }
  static async runCode(req, res, next) {
    try {
      const { language, code, sourceCode, input, testCases, comparisonMode } = req.body;
      const submittedCode = code ?? sourceCode;
      if (!language || submittedCode === undefined) {
        return sendError(res, 'Language and code are required.', 400, 'MISSING_FIELDS');
      }
      const { language: normalizedLanguage } = getLanguageConfig(language);

      if (Array.isArray(testCases)) {
        const batch = await executeCodeBatchInSandbox(normalizedLanguage, submittedCode, testCases);
        const results = batch.results.map((result, index) => ({
          id: testCases[index]?.id || `tc-${index}`,
          passed: result.success && evaluateOutput(result.stdout, testCases[index]?.expectedOutput),
          input: testCases[index]?.isPublic === false ? '[Concealed]' : testCases[index]?.input,
          expectedOutput: testCases[index]?.isPublic === false ? '[Concealed]' : testCases[index]?.expectedOutput,
          actualOutput: testCases[index]?.isPublic === false ? '[Concealed]' : result.stdout,
          isPublic: testCases[index]?.isPublic !== false,
          error: result.stderr || undefined,
          executionTime: result.executionTime,
        }));
        const passed = results.filter((result) => result.passed).length;
        const hasCompilationError = batch.results.some((result) => result.status === 'compilation_error');
        const passedCount = hasCompilationError ? 0 : passed;
        const totalCount = results.length;
        const statusLabel = hasCompilationError
          ? 'Compilation Error'
          : (passedCount === totalCount && totalCount > 0 ? 'Accepted' : 'Wrong Answer');
        return sendSuccess(res, {
          status: statusLabel,
          language: batch.language,
          testCasesPassed: passedCount,
          totalTestCases: totalCount,
          testCaseResults: results,
          executionTimeMs: batch.metrics.executionTime,
          metrics: batch.metrics,
        });
      }

      const result = await executeCodeInSandbox(normalizedLanguage, submittedCode, input || '');
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  static async submitCode(req, res, next) {
    try {
      const { test_id, testId, question_id, questionId, session_id, sessionId, code, sourceCode, language, student_id, studentId, submission_id, submissionId } = req.body;

      const targetTestId = test_id || testId || req.body.assessmentId;
      const targetQuestionId = question_id || questionId;
      const targetSessionId = session_id || sessionId;
      const targetStudentId = student_id || studentId || req.user?.id;
      const studentName = req.user?.name || req.body.student_name || 'Student';

      const submittedCode = code ?? sourceCode;
      if (!targetTestId || !targetQuestionId || !submittedCode || !language) {
        return sendError(res, 'Missing required fields (testId, questionId, code).', 400, 'MISSING_FIELDS');
      }
      const { language: normalizedLanguage } = getLanguageConfig(language);

      if (!targetStudentId) {
        return sendError(res, 'Student ID is required.', 400, 'MISSING_STUDENT_ID');
      }
      if (targetSessionId) {
        const session = await SessionService.getSessionById(targetSessionId);
        if (!session || session.student_id !== targetStudentId || session.test_id !== targetTestId) {
          return sendError(res, 'Assessment attempt is invalid.', 409, 'INVALID_ATTEMPT');
        }
        if (session.end_time && Date.now() >= new Date(session.end_time).getTime()) {
          return sendError(res, 'Assessment attempt has expired.', 409, 'ATTEMPT_EXPIRED');
        }
      }

      const submission = await SubmissionService.submitQuestionCode({
        studentId: targetStudentId,
        studentName,
        testId: targetTestId,
        questionId: targetQuestionId,
        sessionId: targetSessionId,
        code: submittedCode,
        language: normalizedLanguage,
        submissionId: submission_id || submissionId || randomUUID(),
      });

      const statusLabel = submission.resultStatus === 'COMPILATION_ERROR'
        ? 'Compilation Error'
        : (submission.passed_count === submission.total_testcases && submission.total_testcases > 0 ? 'Accepted' : 'Wrong Answer');

      const execResult = {
        status: statusLabel,
        score: submission.score,
        marks: submission.score,
        maxScore: submission.max_score,
        maxMarks: submission.max_score,
        testCasesPassed: submission.passed_count,
        totalTestCases: submission.total_testcases,
        executionTimeMs: submission.executionTime,
        testCaseResults: submission.testcase_results.map((result) => ({
          id: result.testcase_id,
          passed: result.passed,
          input: result.input,
          expectedOutput: result.expected_output,
          actualOutput: result.actual_output,
          isPublic: !result.is_hidden,
          error: result.error,
          executionTime: result.execution_time,
        })),
      };
      return sendSuccess(res, {
        submissionId: submission.submission_id,
        status: statusLabel,
        resultStatus: submission.resultStatus,
        passedTestCases: submission.passed_count,
        totalTestCases: submission.total_testcases,
        score: submission.score,
        marks: submission.score,
        maxScore: submission.max_score,
        maxMarks: submission.max_score,
        executionTime: submission.executionTime,
        results: submission.testcase_results,
        submission,
        execResult,
      }, 'Submission processed successfully.', 201);
    } catch (err) {
      next(err);
    }
  }

  static async getSubmissionById(req, res, next) {
    try {
      const sub = await SubmissionService.getSubmissionById(req.params.id);
      if (!sub) {
        return sendError(res, 'Submission not found.', 404, 'NOT_FOUND');
      }
      return sendSuccess(res, sub);
    } catch (err) {
      next(err);
    }
  }

  static async getTestSubmissions(req, res, next) {
    try {
      const list = await SubmissionService.getTestSubmissions(req.params.testId);
      return sendSuccess(res, list);
    } catch (err) {
      next(err);
    }
  }

  static async getStudentSubmissions(req, res, next) {
    try {
      const list = await SubmissionService.getStudentSubmissions(req.params.studentId, req.query.testId);
      return sendSuccess(res, list);
    } catch (err) {
      next(err);
    }
  }
}
