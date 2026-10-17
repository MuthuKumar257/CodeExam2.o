import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { QuestionService } from './questionService.js';
import { executeCodeInSandbox } from './codeRunnerService.js';
import { executeCodeBatchInSandbox, getLanguageConfig } from './codeRunnerService.js';
import { calculateQuestionScore, calculateTestcaseScore, calculateTestCaseBasedScore, evaluateOutput } from './scoringService.js';
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

    let questionMarks = Number(question.marks || question.points || 20);
    const test = testId ? memoryStore.tests.find((t) => t.id === testId) : null;
    let isEqualMarks = true;
    if (test) {
      isEqualMarks = Boolean(test.is_equal_marks ?? test.isEqualMarks ?? true);
      const marksPerQ = test.marks_per_question ?? test.marksPerQuestion;
      if (isEqualMarks && marksPerQ) {
        questionMarks = Number(marksPerQ);
      }
    }

    const testcaseResults = [];
    let passedCount = 0;
    const executionStarted = Date.now();
    const batch = await executeCodeBatchInSandbox(language, code, testcases);
    const hasCompilationError = batch.results.some((result) => result.status === 'compilation_error');
    const isToolchainUnavailable = batch.results.some((result) => result.status === 'compiler_unavailable');

    const tcMarksConfigured = testcases.some(
      (tc) => (tc.marks !== undefined && tc.marks !== null) || (tc.points !== undefined && tc.points !== null)
    );
    const defaultMarkPerTc = totalCount > 0 ? questionMarks / totalCount : 0;

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const runResult = batch.results[i] || {};
      const isPassed = !hasCompilationError && !isToolchainUnavailable && runResult.success && evaluateOutput(runResult.stdout, tc.expected_output);

      if (isPassed) {
        passedCount++;
      }

      const tcWeight = (!isEqualMarks && tcMarksConfigured)
        ? Number(tc.marks ?? tc.points ?? 0)
        : defaultMarkPerTc;
      const marksAwarded = isPassed ? tcWeight : 0;

      testcaseResults.push({
        testcase_id: tc.id,
        index: i + 1,
        is_hidden: Boolean(tc.is_hidden),
        passed: isPassed,
        input: tc.is_hidden ? '[Hidden]' : tc.input,
        expected_output: tc.is_hidden ? '[Hidden]' : tc.expected_output,
        actual_output: tc.is_hidden ? (isPassed ? '[Matched]' : '[Mismatch]') : runResult.stdout,
        error: runResult.stderr || null,
        execution_time: runResult.executionTime || 0,
        marks_awarded: Math.round((marksAwarded + Number.EPSILON) * 100) / 100,
        max_marks: Math.round((tcWeight + Number.EPSILON) * 100) / 100,
      });
    }

    if (hasCompilationError || isToolchainUnavailable) {
      passedCount = 0;
    }

    let score = 0;
    let maxScore = questionMarks;

    if (!hasCompilationError && !isToolchainUnavailable) {
      if (isEqualMarks) {
        // Equal Marks per Question is ON: standard ratio formula
        score = calculateQuestionScore({
          passedTestCases: passedCount,
          totalTestCases: totalCount,
          maxMarks: questionMarks,
        });
        maxScore = questionMarks;
      } else {
        // Equal Marks per Question is OFF: Sum of marks for all passed test cases
        const tcBased = calculateTestCaseBasedScore({
          testcases,
          testcaseResults,
          totalQuestionMarks: questionMarks,
        });
        score = tcBased.score;
        maxScore = tcBased.maxScore;
      }
    }

    const calculatedStatus = isToolchainUnavailable
      ? 'COMPILER_UNAVAILABLE'
      : hasCompilationError
        ? 'COMPILATION_ERROR'
        : (passedCount === totalCount && totalCount > 0 ? 'ACCEPTED' : (passedCount > 0 ? 'PARTIAL' : 'WRONG_ANSWER'));

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
      max_score: maxScore,
      is_equal_marks: isEqualMarks,
      status: calculatedStatus,
      resultStatus: calculatedStatus,
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

        // Determine authoritative maximum marks for the assessment
        let assessmentTotalMarks = Number(test?.total_marks || 100);
        if (test) {
          const testQuestionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
          if (isEqualMarks) {
            const marksPerQ = Number(test.marks_per_question ?? test.marksPerQuestion ?? questionMarks);
            if (testQuestionIds.length > 0) {
              assessmentTotalMarks = testQuestionIds.length * marksPerQ;
            }
          } else {
            // When Equal Marks is OFF, sum configured question test-case marks
            let calculatedMax = 0;
            for (const qId of testQuestionIds) {
              const qObj = memoryStore.questions.find((x) => x.id === qId);
              const qTcs = memoryStore.testcases.filter((tc) => tc.question_id === qId);
              const hasCustom = qTcs.some((tc) => tc.marks !== undefined || tc.points !== undefined);
              if (hasCustom && qTcs.length > 0) {
                calculatedMax += qTcs.reduce((acc, tc) => acc + Number(tc.marks ?? tc.points ?? 0), 0);
              } else if (qObj) {
                calculatedMax += Number(qObj.marks || qObj.points || 20);
              }
            }
            if (calculatedMax > 0) assessmentTotalMarks = calculatedMax;
          }
        }

        session.score = Math.round((totalSessionScore + Number.EPSILON) * 100) / 100;
        session.total_marks = Math.round((assessmentTotalMarks + Number.EPSILON) * 100) / 100;
        session.percentage = session.total_marks > 0
          ? Math.round(((session.score / session.total_marks) * 100) * 100) / 100
          : 0;
        session.updated_at = new Date().toISOString();
        logger.info(`Updated session ${sessionId} total score to: ${session.score}/${session.total_marks} (${session.percentage}%)`);

        if (supabaseSubmissionsAvailable) {
          try {
            await supabase.from('sessions').update({
              final_score: session.score,
              total_points: session.total_marks,
              updated_at: session.updated_at,
              data: session,
            }).eq('id', sessionId);
          } catch (sessionErr) {
            logger.warn('Failed to update session score in Supabase:', sessionErr.message);
          }
        }
      }
    }

    if (supabaseSubmissionsAvailable) {
      const databaseStarted = Date.now();
      try {
        const sbSubmissionRow = {
          id: newSubmission.id,
          attempt_id: newSubmission.session_id,
          session_id: newSubmission.session_id,
          test_id: newSubmission.test_id,
          assessment_id: newSubmission.test_id,
          student_id: newSubmission.student_id,
          question_id: newSubmission.question_id,
          language: newSubmission.language,
          source_code: newSubmission.code,
          status: newSubmission.status,
          score: newSubmission.score,
          max_score: newSubmission.max_score,
          test_cases_passed: newSubmission.passed_count,
          total_test_cases: newSubmission.total_testcases,
          execution_time_ms: newSubmission.execution_metrics?.executionTime || 0,
          test_case_results: newSubmission.testcase_results || [],
          data: newSubmission,
          submitted_at: newSubmission.submitted_at,
        };
        const { error } = await supabase.from('submissions').upsert(sbSubmissionRow);
        if (error) throw error;
        newSubmission.execution_metrics.databaseTime = Date.now() - databaseStarted;
      } catch (err) {
        logger.error(`[Submission ${submissionId}] Supabase persistence failed:`, err.message);
        if (err.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(err.message || '')) {
          supabaseSubmissionsAvailable = false;
        }
        if (process.env.NODE_ENV === 'production') throw err;
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
    let sub = memoryStore.submissions.find((s) => s.id === id || s.submission_id === id);
    if (!sub && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('submissions').select('*').or(`id.eq.${id},submission_id.eq.${id}`).maybeSingle();
        if (!error && data) {
          sub = data.data && typeof data.data === 'object' ? { ...data.data, ...data } : data;
          if (!memoryStore.submissions.some((x) => x.id === sub.id)) {
            memoryStore.submissions.push(sub);
          }
        }
      } catch (err) {
        logger.warn('Supabase getSubmissionById error:', err.message);
      }
    }
    return sub || null;
  }

  static async getTestSubmissions(testId) {
    return memoryStore.submissions.filter((s) => s.test_id === testId || s.assessmentId === testId);
  }

  static async getStudentSubmissions(studentId, testId = null) {
    let list = memoryStore.submissions.filter(
      (s) => s.student_id === studentId || s.candidateId === studentId
    );
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase
          .from('submissions')
          .select('*')
          .or(`student_id.eq.${studentId},candidate_id.eq.${studentId}`);
        if (testId) {
          query = query.or(`test_id.eq.${testId},assessment_id.eq.${testId}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          for (const s of data) {
            const unpacked = s.data && typeof s.data === 'object' ? { ...s.data, ...s } : s;
            if (!list.some((x) => x.id === unpacked.id)) {
              list.push(unpacked);
              if (!memoryStore.submissions.some((x) => x.id === unpacked.id)) {
                memoryStore.submissions.push(unpacked);
              }
            }
          }
        }
      } catch (err) {
        logger.warn('Supabase getStudentSubmissions error:', err.message);
      }
    }
    if (testId) {
      list = list.filter((s) => s.test_id === testId || s.assessmentId === testId);
    }
    return list;
  }
}
