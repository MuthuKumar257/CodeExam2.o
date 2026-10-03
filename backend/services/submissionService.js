import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { QuestionService } from './questionService.js';
import { executeCodeInSandbox } from './codeRunnerService.js';
import { executeCodeBatchInSandbox, getLanguageConfig } from './codeRunnerService.js';
import { calculateTestcaseScore, evaluateOutput } from './scoringService.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

let supabaseSubmissionsAvailable = Boolean(isSupabaseConfigured && supabase);

export class SubmissionService {
  static inFlight = new Map();
  static completed = new Map();

  static async submitQuestionCode({
    studentId,
    studentName = 'Student',
    testId,
    questionId,
    sessionId,
    code,
    language = 'javascript',
    submissionId = randomUUID(),
  }) {
    const { language: normalizedLanguage } = getLanguageConfig(language);
    const existing = this.completed.get(submissionId);
    if (existing) return existing;
    const pending = this.inFlight.get(submissionId);
    if (pending) return pending;

    const execution = this.processSubmission({
      studentId, studentName, testId, questionId, sessionId, code, language: normalizedLanguage, submissionId,
    });
    this.inFlight.set(submissionId, execution);
    try {
      const result = await execution;
      this.completed.set(submissionId, result);
      return result;
    } finally {
      this.inFlight.delete(submissionId);
    }
  }

  static async processSubmission({
    studentId,
    studentName,
    testId,
    questionId,
    sessionId,
    code,
    language,
    submissionId,
  }) {
    const requestStarted = Date.now();
    const question = await QuestionService.getQuestionById(questionId, 'FACULTY');
    if (!question) {
      throw new Error('Question not found.');
    }

    const testcases = await QuestionService.getAllTestcasesForEvaluation(questionId);
    const totalCount = testcases.length > 0 ? testcases.length : 1;
    const questionMarks = Number(question.marks || 20);

    const testcaseResults = [];
    let passedCount = 0;
    const executionStarted = Date.now();
    const batch = await executeCodeBatchInSandbox(language, code, testcases);
    const hasCompilationError = batch.results.some((result) => result.status === 'compilation_error');
    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const runResult = batch.results[i];
      const isPassed = runResult.success && evaluateOutput(runResult.stdout, tc.expected_output);

      if (isPassed) {
        passedCount++;
      }

      testcaseResults.push({
        testcase_id: tc.id,
        index: i + 1,
        is_hidden: Boolean(tc.is_hidden),
        passed: isPassed,
        input: tc.is_hidden ? '[Hidden]' : tc.input,
        expected_output: tc.is_hidden ? '[Hidden]' : tc.expected_output,
        actual_output: tc.is_hidden ? (isPassed ? '[Matched]' : '[Mismatch]') : runResult.stdout,
        error: runResult.stderr || null,
        execution_time: runResult.executionTime,
      });
    }

    const score = calculateTestcaseScore(passedCount, totalCount, questionMarks);

    const newSubmission = {
      id: submissionId,
      submission_id: submissionId,
      student_id: studentId,
      student_name: studentName,
      test_id: testId,
      question_id: questionId,
      question_title: question.title,
      session_id: sessionId,
      code,
      language,
      testcase_results: testcaseResults,
      passed_count: passedCount,
      total_testcases: totalCount,
      score,
      max_score: questionMarks,
      status: hasCompilationError
        ? 'COMPILATION_ERROR'
        : (passedCount === totalCount ? 'ACCEPTED' : (passedCount > 0 ? 'PARTIAL' : 'WRONG_ANSWER')),
      submitted_at: new Date().toISOString(),
      execution_metrics: {
        requestTime: executionStarted - requestStarted,
        queueTime: 0,
        compileTime: batch.metrics.compileTime,
        executionTime: batch.metrics.executionTime,
        databaseTime: 0,
        totalTime: Date.now() - requestStarted,
      },
    };

    // Rule: Keep latest submission for scoring.
    // Replace prior submission for (student_id, test_id, question_id) in memoryStore.submissions
    const existingIndex = memoryStore.submissions.findIndex(
      (s) => s.student_id === studentId && s.test_id === testId && s.question_id === questionId
    );

    if (existingIndex !== -1) {
      memoryStore.submissions[existingIndex] = newSubmission;
    } else {
      memoryStore.submissions.push(newSubmission);
    }

    // Atomically recalculate session score:
    // Session score = SUM of scores for the latest submission of each question in this test
    if (sessionId) {
      const session = memoryStore.sessions.find((s) => s.id === sessionId);
      if (session) {
        const studentTestSubmissions = memoryStore.submissions.filter(
          (s) => s.student_id === studentId && s.test_id === testId
        );
        const questionScoreMap = new Map();
        for (const sub of studentTestSubmissions) {
          questionScoreMap.set(sub.question_id, Number(sub.score || 0));
        }

        let totalSessionScore = 0;
        for (const sScore of questionScoreMap.values()) {
          totalSessionScore += sScore;
        }

        session.score = Math.round(totalSessionScore * 100) / 100;
        session.updated_at = new Date().toISOString();
        logger.info(`Updated session ${sessionId} total score to: ${session.score}`);
      }
    }

    if (supabaseSubmissionsAvailable) {
      const databaseStarted = Date.now();
      try {
        const { error } = await supabase.from('submissions').upsert(newSubmission);
        if (error) throw error;
        newSubmission.execution_metrics.databaseTime = Date.now() - databaseStarted;
      } catch (err) {
        if (err.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(err.message || '')) {
          supabaseSubmissionsAvailable = false;
        }
        logger.warn('Supabase create submission fallback:', err.message);
      }
    }
    newSubmission.execution_metrics.totalTime = Date.now() - requestStarted;

    const completedSubmission = {
      ...newSubmission,
      status: 'COMPLETED',
      resultStatus: newSubmission.status,
      passedTestCases: passedCount,
      totalTestCases: totalCount,
      marks: score,
      executionTime: batch.metrics.executionTime,
      results: testcaseResults,
    };
    logger.info(
      `[Submission ${submissionId}] queue=${completedSubmission.execution_metrics.queueTime}ms ` +
      `compile=${completedSubmission.execution_metrics.compileTime}ms ` +
      `execution=${completedSubmission.execution_metrics.executionTime}ms ` +
      `database=${completedSubmission.execution_metrics.databaseTime}ms ` +
      `total=${completedSubmission.execution_metrics.totalTime}ms`
    );
    return completedSubmission;
  }

  static async getSubmissionById(id) {
    return memoryStore.submissions.find((s) => s.id === id || s.submission_id === id);
  }

  static async getTestSubmissions(testId) {
    return memoryStore.submissions.filter((s) => s.test_id === testId);
  }

  static async getStudentSubmissions(studentId, testId = null) {
    let list = memoryStore.submissions.filter((s) => s.student_id === studentId);
    if (testId) {
      list = list.filter((s) => s.test_id === testId);
    }
    return list;
  }
}
