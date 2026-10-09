import { Assessment, CandidateSession, Question, Result, Submission } from '../types';

/**
 * Deterministic hash of string into 32-bit unsigned integer.
 * Produces well-distributed hashes for any seed format.
 */
export function hashStringSeed(str: string): number {
  let hash = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export function createSeededPRNG(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array with a seed string using Fisher-Yates algorithm.
 */
export function shuffleArrayWithSeed<T>(array: T[], seedStr: string): T[] {
  const result = [...array];
  if (result.length <= 1) return result;
  const rng = createSeededPRNG(hashStringSeed(seedStr));
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export interface QuestionScoringInput {
  passedTestCases?: number;
  totalTestCases?: number;
  maxMarks?: number;
  passedCount?: number;
  totalCount?: number;
  questionMarks?: number;
  maxScore?: number;
  marks?: number;
}

/**
 * Calculates score strictly according to passed test cases:
 * Question Score = (Passed Test Cases / Total Test Cases) * Maximum Question Marks
 * 
 * Never awards full marks if any test case failed.
 * Returns 0 if passed <= 0 or total <= 0.
 * Rounds to 2 decimal places.
 */
export function calculateQuestionScore(
  arg1?: QuestionScoringInput | number,
  arg2?: number,
  arg3?: number
): number {
  let passedTestCases = 0;
  let totalTestCases = 0;
  let maxMarks = 0;

  if (typeof arg1 === 'object' && arg1 !== null) {
    passedTestCases = Number(arg1.passedTestCases ?? arg1.passedCount ?? 0);
    totalTestCases = Number(arg1.totalTestCases ?? arg1.totalCount ?? 0);
    maxMarks = Number(arg1.maxMarks ?? arg1.questionMarks ?? arg1.maxScore ?? arg1.marks ?? 0);
  } else {
    passedTestCases = Number(arg1 ?? 0);
    totalTestCases = Number(arg2 ?? 0);
    maxMarks = Number(arg3 ?? 0);
  }

  if (
    !Number.isFinite(passedTestCases) ||
    !Number.isFinite(totalTestCases) ||
    !Number.isFinite(maxMarks) ||
    totalTestCases <= 0 ||
    passedTestCases <= 0 ||
    maxMarks <= 0
  ) {
    return 0;
  }

  const effectivePassed = Math.min(passedTestCases, totalTestCases);
  if (effectivePassed === totalTestCases) {
    return Math.round((maxMarks + Number.EPSILON) * 100) / 100;
  }

  const rawScore = (effectivePassed / totalTestCases) * maxMarks;
  const rounded = Math.round((rawScore + Number.EPSILON) * 100) / 100;
  return Math.min(rounded, maxMarks > 0.01 ? maxMarks - 0.01 : 0);
}

/**
 * Generates the specific list of question IDs for a candidate according to:
 * 1. assessment.randomizeQuestions (if true, shuffles questions uniquely per candidate and attempt)
 * 2. assessment.questionsPerCandidate (if specified and > 0, serves that exact number of questions)
 */
export function generateCandidateQuestionOrder(
  assessment: Partial<Assessment> | null | undefined,
  candidateOrSession: Partial<CandidateSession> | { id?: string; studentId?: string; candidateId?: string; candidateEmail?: string; candidateRegisterNo?: string; attemptNumber?: number } | string | null | undefined,
  questionsPool?: Question[]
): string[] {
  const allQuestions = (questionsPool && Array.isArray(questionsPool) && questionsPool.length > 0)
    ? questionsPool
    : (assessment?.questions && Array.isArray(assessment.questions) ? assessment.questions : []);
  if (!allQuestions || !Array.isArray(allQuestions) || allQuestions.length === 0) return [];

  const candidateId = typeof candidateOrSession === 'string'
    ? candidateOrSession
    : (candidateOrSession?.candidateId || candidateOrSession?.studentId || (candidateOrSession as any)?.candidateRegisterNo || (candidateOrSession as any)?.candidateEmail || candidateOrSession?.id || 'candidate');

  const attemptNum = (typeof candidateOrSession === 'object' && candidateOrSession?.attemptNumber) ? candidateOrSession.attemptNumber : 1;
  const asmId = assessment?.id || 'assessment';

  let orderedQuestions = [...allQuestions];

  // If randomizeQuestions is enabled, perform deterministic candidate-specific Fisher-Yates shuffle
  if (assessment?.randomizeQuestions) {
    const seed = `${candidateId}_att${attemptNum}_${asmId}`;
    orderedQuestions = shuffleArrayWithSeed(orderedQuestions, seed);
  }

  // Pick questionsPerCandidate subset
  const count = assessment?.questionsPerCandidate && assessment.questionsPerCandidate > 0
    ? Math.min(assessment.questionsPerCandidate, orderedQuestions.length)
    : orderedQuestions.length;

  return orderedQuestions.slice(0, count).map((q) => q.id);
}

/**
 * Resolves the final hydrated Question objects for a candidate attempt.
 * Preserves equal marks weightage if enabled.
 */
export function getCandidateAssignedQuestions(
  assessment: Partial<Assessment> | null | undefined,
  session: Partial<CandidateSession> | null | undefined,
  questionsPool?: Question[]
): Question[] {
  const allQuestions = (questionsPool && Array.isArray(questionsPool) && questionsPool.length > 0)
    ? questionsPool
    : (assessment?.questions && Array.isArray(assessment.questions) ? assessment.questions : []);
  if (!allQuestions || !Array.isArray(allQuestions) || allQuestions.length === 0) return [];

  const qMap = new Map(allQuestions.map((q) => [q.id, q]));
  let assignedIds: string[] = [];

  const targetCount = assessment?.questionsPerCandidate && assessment.questionsPerCandidate > 0
    ? Math.min(assessment.questionsPerCandidate, allQuestions.length)
    : allQuestions.length;

  // 1. If session already has a valid stored questionOrder that matches count constraints
  if (
    session?.questionOrder &&
    Array.isArray(session.questionOrder) &&
    session.questionOrder.length > 0 &&
    (!assessment?.questionsPerCandidate || session.questionOrder.length === targetCount)
  ) {
    assignedIds = session.questionOrder;
  } else {
    // 2. Otherwise generate questionOrder based on candidate seed and assessment settings
    assignedIds = generateCandidateQuestionOrder(assessment, session, allQuestions);
  }

  let finalQuestions: Question[] = [];
  for (const qid of assignedIds) {
    const found = qMap.get(qid);
    if (found) {
      finalQuestions.push(found);
    }
  }

  // Fallback if question resolution was empty
  if (finalQuestions.length === 0) {
    finalQuestions = allQuestions.slice(0, targetCount);
  }

  // Apply equal marks if configured
  if (assessment?.isEqualMarks && assessment?.marksPerQuestion) {
    const pts = Math.max(1, Number(assessment.marksPerQuestion) || 10);
    finalQuestions = finalQuestions.map((q) => ({ ...q, points: pts }));
  }

  return finalQuestions;
}

/**
 * Returns the maximum mark for a specific question given an assessment.
 * Correctly accounts for equal marks (marksPerQuestion) vs individual question points.
 */
export function getQuestionMaxMarks(question?: Partial<Question> | null, assessment?: Assessment | null): number {
  if (assessment?.isEqualMarks && assessment?.marksPerQuestion) {
    return Math.max(1, Number(assessment.marksPerQuestion) || 10);
  }
  return Math.max(1, Number(question?.points) || 10);
}

/**
 * Returns the total max marks for an assessment (or for a candidate session).
 * 1. If session has a specific questionOrder, computes max marks for those exact assigned questions.
 * 2. If assessment has questionsPerCandidate, computes max marks for that assigned subset size.
 * 3. Correctly handles isEqualMarks & marksPerQuestion.
 * 4. Never defaults to 100 when actual questions exist.
 */
export function getAssessmentTotalMaxMarks(
  assessment?: Assessment | null,
  session?: CandidateSession | null,
  questionsPool?: Question[]
): number {
  if (!assessment && !session) return 100;

  const allQuestions = questionsPool && questionsPool.length > 0
    ? questionsPool
    : (assessment?.questions || []);

  const marksPerQ = assessment?.isEqualMarks && assessment?.marksPerQuestion
    ? Math.max(1, Number(assessment.marksPerQuestion) || 10)
    : null;

  // 1. If session has specific questionOrder
  if (session?.questionOrder && Array.isArray(session.questionOrder) && session.questionOrder.length > 0) {
    if (marksPerQ !== null) {
      return session.questionOrder.length * marksPerQ;
    }
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));
    const sum = session.questionOrder.reduce((acc, qid) => {
      const q = qMap.get(qid);
      return acc + (q ? (Number(q.points) || 10) : 10);
    }, 0);
    if (sum > 0) return sum;
  }

  // 2. If assessment specifies questionsPerCandidate
  if (assessment?.questionsPerCandidate && assessment.questionsPerCandidate > 0) {
    if (marksPerQ !== null) {
      return assessment.questionsPerCandidate * marksPerQ;
    }
    const subset = allQuestions.slice(0, assessment.questionsPerCandidate);
    if (subset.length > 0) {
      return subset.reduce((acc, q) => acc + (Number(q.points) || 10), 0);
    }
    return assessment.questionsPerCandidate * 10;
  }

  // 3. All questions in assessment
  if (marksPerQ !== null && allQuestions.length > 0) {
    return allQuestions.length * marksPerQ;
  }

  if (allQuestions.length > 0) {
    const sum = allQuestions.reduce((acc, q) => acc + (Number(q.points) || 10), 0);
    if (sum > 0) return sum;
  }

  // 4. Assessment configured maximum_marks, maximumMarks, or totalPoints property
  const configuredMax = (assessment as any)?.maximum_marks || (assessment as any)?.maximumMarks || assessment?.totalPoints;
  if (configuredMax && Number(configuredMax) > 0) {
    return Number(configuredMax);
  }

  // 5. Session totalPoints if already stored and valid
  if (session?.totalPoints && session.totalPoints > 0) {
    return session.totalPoints;
  }

  return 100;
}

/**
 * Resolves the maximum allowed attempts for an assessment.
 * When a test is allowed to retake (via allowRetake or maxAttempts > 1),
 * candidates can retake strictly ONCE (exactly 2 attempts maximum: 1 initial + 1 retake).
 * Otherwise, only 1 attempt is permitted.
 */
export function getMaxAllowedAttempts(assessment?: Assessment | null): number {
  if (!assessment) return 1;
  if (assessment.allowRetake) return 2;
  if (assessment.maxAttempts !== undefined && assessment.maxAttempts !== null) {
    const parsed = Number(assessment.maxAttempts);
    if (parsed > 1) return 2; // When retake test is allowed, exactly one retake (2 attempts total) is permitted
    return Math.max(1, parsed);
  }
  return 1;
}

/**
 * Checks whether a candidate session/attempt has completed its lifecycle.
 */
export function isCandidateSessionCompleted(session: CandidateSession): boolean {
  if (!session) return false;
  const st = (session.state || '').toUpperCase();
  const subSt = ((session as any).submissionStatus || '').toUpperCase();
  const isFinishedState =
    st === 'SUBMITTED' ||
    st === 'AUTO_SUBMITTED' ||
    st === 'TERMINATED_MALPRACTICE' ||
    st === 'EXPIRED' ||
    st === 'COMPLETED' ||
    st === 'CLOSED' ||
    subSt === 'SUBMITTED' ||
    subSt === 'COMPLETED' ||
    subSt === 'EXPIRED' ||
    subSt === 'CLOSED';
  const hasCompletionTime = Boolean(session.completedAt);
  return isFinishedState || hasCompletionTime;
}

/**
 * Extracts candidate identifier aliases from a session or string
 */
export function getCandidateAliases(candidateOrSession: string | CandidateSession | null | undefined): string[] {
  if (!candidateOrSession) return [];
  if (typeof candidateOrSession === 'string') {
    return [candidateOrSession.trim().toLowerCase()];
  }
  const keys = [
    candidateOrSession.candidateId,
    (candidateOrSession as any).studentId,
    (candidateOrSession as any).userId,
    candidateOrSession.candidateEmail,
    candidateOrSession.candidateRegisterNo,
  ].filter(Boolean) as string[];
  return Array.from(new Set(keys.map((k) => k.trim().toLowerCase())));
}

/**
 * Synthesizes submission objects for viewing unsubmitted draft questions.
 * NOTE: Unsubmitted questions or drafts are NEVER awarded marks.
 * Marks are considered IF AND ONLY IF code was officially submitted and test cases pass.
 */
export function synthesizeSubmissionsFromSession(
  session: CandidateSession,
  existingSubmissions: Submission[] = [],
  assessment?: Assessment | null,
  questionsPool?: Question[]
): Submission[] {
  if (!session) return [];

  const questions = questionsPool && questionsPool.length > 0
    ? questionsPool
    : (assessment?.questions || []);

  const existingMap = new Map<string, Submission>();
  existingSubmissions.forEach((s) => {
    if (s && s.questionId) {
      existingMap.set(s.questionId, s);
    }
  });

  const codeSource: Record<string, string> = {
    ...(session.codeMap || {}),
    ...((session.selectedAnswers as any) || {}),
  };

  const synthesized: Submission[] = [];

  for (const q of questions) {
    if (existingMap.has(q.id)) {
      continue;
    }
    const rawCode = codeSource[q.id];
    const hasCode = typeof rawCode === 'string' && rawCode.trim().length > 0;

    if (hasCode) {
      const qMax = getQuestionMaxMarks(q, assessment);
      const totalTc = q.testCases?.length || (q.sampleTestCases?.length ? q.sampleTestCases.length + (q.hiddenTestCases?.length || 0) : 1);

      // Unsubmitted code: 0 marks, 0 test cases passed
      synthesized.push({
        id: `draft-${session.id}-${q.id}`,
        sessionId: session.id,
        attemptId: session.id,
        attemptNumber: session.attemptNumber || 1,
        candidateId: session.candidateId || (session as any).studentId || 'candidate',
        candidateName: session.candidateName,
        assessmentId: session.assessmentId,
        questionId: q.id,
        questionTitle: q.title || 'Question',
        language: (session as any).language || (session as any).selectedLanguage || 'python',
        sourceCode: typeof rawCode === 'string' ? rawCode : '',
        status: 'Not Submitted',
        score: 0,
        maxScore: qMax,
        executionTimeMs: 0,
        memoryUsageMb: 0,
        submittedAt: session.completedAt || session.updatedAt || session.startedAt || new Date().toISOString(),
        testCasesPassed: 0,
        totalTestCases: totalTc,
      });
    }
  }

  return synthesized;
}

/**
 * Returns the exact total marks obtained by a candidate in a session.
 * RULES:
 * 1. Marks are considered ONLY for questions where code was explicitly submitted.
 * 2. If code was only opened or typed without submission, it is NOT considered for marks (0 marks).
 * 3. For submitted questions, marks are awarded IF AND ONLY IF test cases are passed.
 * 4. Ensures terminated malpractice returns 0.
 */
export function getSessionTotalMarksObtained(
  session?: CandidateSession | null,
  submissions: Submission[] = [],
  assessment?: Assessment | null,
  questionsPool?: Question[],
  results?: Result[]
): number {
  if (!session) return 0;
  const isMalpractice =
    session.state === 'TERMINATED_MALPRACTICE' ||
    (session as any).submissionStatus === 'TERMINATED_MALPRACTICE' ||
    session.riskCategory === 'MALPRACTICE_TERMINATED';

  if (isMalpractice) {
    return 0;
  }

  const maxTotalMarks = getAssessmentTotalMaxMarks(assessment, session, questionsPool);

  const candidateKeys = [
    session.candidateId,
    (session as any).studentId,
    session.candidateEmail,
    session.candidateRegisterNo
  ].filter(Boolean) as string[];

  let latestSubs = getLatestCandidateSubmissions(
    submissions,
    session,
    session.assessmentId,
    session.id
  );

  if (latestSubs.length === 0) {
    for (const cKey of candidateKeys) {
      const found = getLatestCandidateSubmissions(
        submissions,
        cKey,
        session.assessmentId,
        session.id
      );
      if (found.length > 0) {
        latestSubs = found;
        break;
      }
    }
  }

  const allQuestions = questionsPool && questionsPool.length > 0
    ? questionsPool
    : (assessment?.questions || []);

  // ONLY consider valid, submitted solutions (filter out unsubmitted drafts)
  const validSubmittedSubs = latestSubs.filter(
    (sub) => sub && sub.questionId && (sub.status as string) !== 'Not Submitted'
  );

  const subMapByQ = new Map<string, Submission>();
  for (const s of validSubmittedSubs) {
    if (s.questionId) {
      subMapByQ.set(s.questionId, s);
    }
  }

  // Collect all unique question IDs that were submitted either in submissions or session.questionStatuses
  const submittedQIds = new Set<string>();
  subMapByQ.forEach((_, qId) => submittedQIds.add(qId));
  if (session.questionStatuses) {
    Object.entries(session.questionStatuses).forEach(([qId, qs]) => {
      if (qs && (qs.status !== 'Unattempted' || (qs.score !== undefined && Number(qs.score) > 0) || qs.isPassed)) {
        submittedQIds.add(qId);
      }
    });
  }

  if (submittedQIds.size > 0) {
    let sum = 0;
    submittedQIds.forEach((qId) => {
      const sub = subMapByQ.get(qId);
      const qs = session.questionStatuses?.[qId];
      const q = allQuestions.find((item) => item.id === qId);
      const qMax = q
        ? getQuestionMaxMarks(q, assessment)
        : (sub?.maxScore || (assessment?.isEqualMarks && assessment?.marksPerQuestion ? Number(assessment.marksPerQuestion) : 10));

      let qScore = 0;
      if (sub) {
        if (sub.score !== undefined && sub.score !== null) {
          qScore = Math.min(Number(sub.score), qMax);
        } else {
          const testResults = sub.testCaseResults || [];
          const passedCount = sub.testCasesPassed ?? (testResults.length > 0 ? testResults.filter((tc: any) => tc.passed).length : 0);
          const totalCount = sub.totalTestCases || testResults.length || 0;
          qScore = calculateQuestionScore({ passedTestCases: passedCount, totalTestCases: totalCount, maxMarks: qMax });
        }
      } else if (qs) {
        if (qs.score !== undefined && qs.score !== null) {
          qScore = Math.min(Number(qs.score), qMax);
        } else {
          const passedCount = qs.testCasesPassed ?? (qs.status === 'Accepted' && qs.totalTestCases ? qs.totalTestCases : 0);
          const totalCount = qs.totalTestCases ?? 0;
          qScore = calculateQuestionScore({ passedTestCases: passedCount, totalTestCases: totalCount, maxMarks: qMax });
        }
      }

      sum += qScore;
    });

    return Math.min(Math.max(0, sum), maxTotalMarks);
  }

  // If no submissions or question statuses were available, check if session has recorded score
  if (session.score !== undefined && session.score !== null && Number(session.score) > 0) {
    return Math.min(Number(session.score), maxTotalMarks);
  }

  // If no code was submitted for any question, marks are strictly 0
  return 0;
}

/**
 * Normalizes student ID from submission (checking candidateId, studentId, email, or registerNo)
 */
export function getSubmissionStudentId(sub: Partial<Submission>): string {
  return (
    sub.candidateId ||
    (sub as any).studentId ||
    (sub as any).userId ||
    (sub as any).candidateEmail ||
    (sub as any).candidateRegisterNo ||
    ''
  ).trim();
}

/**
 * Deterministic timestamp comparison with secondary tie-breaker (id)
 * Returns negative if a is newer than b, positive if b is newer than a (standard sort comparison: newer first)
 */
export function compareSubmissionsChronological(a: Submission, b: Submission): number {
  const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
  const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;

  if (timeB !== timeA) {
    return timeB - timeA; // Newer first
  }
  // Deterministic tie-breaker on ID if timestamps are identical
  const idA = a.id || '';
  const idB = b.id || '';
  return idB.localeCompare(idA);
}

/**
 * Returns only the LATEST submitted attempt for each unique questionId
 * for every studentId + assessmentId + questionId combination.
 *
 * Core Rule:
 * For every unique combination of studentId + assessmentId + questionId,
 * only the latest submitted attempt is used for the final result.
 * Previous attempts remain preserved for audit/history but contribute 0 to the final score.
 */
export function getLatestSubmissionsByQuestion(submissions: Submission[]): Submission[] {
  if (!submissions || submissions.length === 0) return [];

  // Group submissions by studentId + assessmentId + questionId
  const groups = new Map<string, Submission[]>();

  for (const sub of submissions) {
    if (!sub || !sub.questionId) continue;
    const sId = getSubmissionStudentId(sub);
    const aId = (sub.assessmentId || '').trim();
    const qId = (sub.questionId || '').trim();
    const groupKey = `${sId}:::${aId}:::${qId}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(sub);
  }

  const latestList: Submission[] = [];

  groups.forEach((subsInGroup) => {
    // Sort so the latest submission is at index 0
    subsInGroup.sort(compareSubmissionsChronological);
    if (subsInGroup[0]) {
      latestList.push(subsInGroup[0]);
    }
  });

  return latestList;
}

/**
 * Filters submissions for a candidate & assessment (and optionally sessionId/attemptId)
 * and returns ONLY the latest attempt per question.
 */
export function getLatestCandidateSubmissions(
  submissions: Submission[],
  candidateOrSession: string | CandidateSession,
  assessmentId?: string,
  sessionId?: string
): Submission[] {
  if (!submissions || submissions.length === 0) return [];

  const aliases = getCandidateAliases(candidateOrSession);
  const targetSessionId = typeof candidateOrSession === 'object' && candidateOrSession !== null
    ? (candidateOrSession.id || (candidateOrSession as any).attemptId || sessionId)
    : sessionId;
  const targetAssessmentId = assessmentId || (typeof candidateOrSession === 'object' && candidateOrSession !== null ? candidateOrSession.assessmentId : undefined);

  const filtered = submissions.filter((sub) => {
    if (!sub) return false;
    const subCandId = getSubmissionStudentId(sub).toLowerCase();
    const matchCand = aliases.length === 0 || aliases.includes(subCandId);
    if (!matchCand) return false;

    // If sub has sessionId, matching by sessionId is authoritative
    if (targetSessionId && (sub.sessionId || sub.attemptId)) {
      const matchSession = sub.sessionId === targetSessionId || sub.attemptId === targetSessionId;
      if (matchSession) return true;
      return false;
    }

    if (sessionId) {
      const matchSession =
        sub.sessionId === sessionId ||
        sub.attemptId === sessionId ||
        (!sub.sessionId && !sub.attemptId);
      if (!matchSession) return false;
    }

    if (targetAssessmentId && sub.assessmentId && sub.assessmentId !== targetAssessmentId) {
      return false;
    }

    return true;
  });

  return getLatestSubmissionsByQuestion(filtered);
}

export interface UnifiedCandidateMetrics {
  score: number;
  maxScore: number;
  percentage: number;
  isPassed: boolean;
  isFailed: boolean;
  isMalpractice: boolean;
  passedTC: number;
  totalTC: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  latestSubmissions: Submission[];
}

/**
 * Single source of truth calculation for candidate assessment metrics.
 * Guarantee identical scores, percentages, test cases passed, and question breakdowns
 * across HistoryView, ReportsPage, and Monitoring.
 */
export function getCandidateSessionMetrics(
  session: CandidateSession,
  submissions: Submission[] = [],
  assessment?: Assessment | null,
  questionsPool?: Question[],
  results?: Result[],
  passThresholdPercent?: number
): UnifiedCandidateMetrics {
  const isMalpractice =
    session.state === 'TERMINATED_MALPRACTICE' ||
    (session as any).submissionStatus === 'TERMINATED_MALPRACTICE' ||
    session.riskCategory === 'MALPRACTICE_TERMINATED' ||
    Boolean(
      session.exitReason &&
        (session.exitReason.toLowerCase().includes('malpractice') ||
          session.exitReason.toLowerCase().includes('warnings exceeded') ||
          session.exitReason.toLowerCase().includes('disqualified'))
    );

  const assigned = getCandidateAssignedQuestions(assessment, session, questionsPool);
  const questions = assigned.length > 0
    ? assigned
    : (questionsPool && questionsPool.length > 0 ? questionsPool : (assessment?.questions || []));

  const maxScore = getAssessmentTotalMaxMarks(assessment, session, questions);
  const rawScore = getSessionTotalMarksObtained(session, submissions, assessment, questions, results);
  const score = isMalpractice ? 0 : Math.min(rawScore, maxScore);
  const percentage = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;

  const threshold = passThresholdPercent !== undefined && passThresholdPercent !== null
    ? passThresholdPercent
    : (assessment?.passingScore !== undefined && assessment?.passingScore !== null ? assessment.passingScore : 50);

  const isPassed = !isMalpractice && (percentage >= threshold || score >= threshold);
  const isFailed = !isMalpractice && !isPassed;

  const rawLatestSubs = getLatestCandidateSubmissions(
    submissions,
    session,
    session.assessmentId,
    session.id
  );

  // ONLY actual submissions are considered - unsubmitted code is never considered for marks or test case passes
  const latestSubmissions = rawLatestSubs.filter(
    (sub) => sub && sub.questionId && (sub.status as string) !== 'Not Submitted'
  );

  let passedTC = 0;
  let totalTC = 0;
  let correctCount = 0;
  let wrongCount = 0;

  if (questions.length > 0) {
    questions.forEach((q) => {
      const sub = latestSubmissions.find((s) => s.questionId === q.id);
      const qMax = getQuestionMaxMarks(q, assessment);
      const qTotalTc = q.testCases?.length || 1;

      if (sub) {
        passedTC += sub.testCasesPassed || 0;
        totalTC += sub.totalTestCases || qTotalTc;
        const subScore = sub.score !== undefined && sub.score !== null ? Number(sub.score) : 0;
        const isAccepted = sub.status === 'Accepted' || subScore >= (sub.maxScore || qMax);
        if (isAccepted || subScore > 0) {
          correctCount++;
        } else {
          wrongCount++;
        }
      } else {
        totalTC += qTotalTc;
      }
    });
  } else {
    latestSubmissions.forEach((sub) => {
      passedTC += sub.testCasesPassed || 0;
      totalTC += sub.totalTestCases || 1;
      const subScore = sub.score !== undefined && sub.score !== null ? Number(sub.score) : 0;
      if (sub.status === 'Accepted' || subScore >= (sub.maxScore || 10)) {
        correctCount++;
      } else if (subScore > 0) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });
  }

  // If latestSubmissions is empty but candidate has completed session with valid score
  if (latestSubmissions.length === 0 && score > 0 && questions.length > 0) {
    const qCount = questions.length;
    const estCorrect = Math.min(qCount, Math.max(1, Math.round((score / maxScore) * qCount)));
    correctCount = estCorrect;
    wrongCount = 0;
    passedTC = estCorrect;
    totalTC = qCount;
  }

  const totalQuestions = questions.length > 0 ? questions.length : Math.max(1, latestSubmissions.length);
  const unansweredCount = Math.max(0, totalQuestions - (correctCount + wrongCount));

  return {
    score,
    maxScore,
    percentage,
    isPassed,
    isFailed,
    isMalpractice,
    passedTC,
    totalTC,
    correctCount,
    wrongCount,
    unansweredCount,
    totalQuestions,
    latestSubmissions,
  };
}

export interface CalculatedScoringResult {
  score: number;
  maxScore: number;
  percentage: number;
  testCasesPassed: number;
  totalTestCases: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  latestSubmissions: Submission[];
}

/**
 * Calculates accurate non-cumulative scoring metrics strictly using the latest submission per question.
 */
export function calculateAssessmentMetrics(
  submissions: Submission[],
  assessment?: Assessment | null,
  questions?: Question[]
): CalculatedScoringResult {
  const latestSubs = getLatestSubmissionsByQuestion(submissions);
  const asmQuestions = questions || assessment?.questions || [];

  let testCasesPassed = 0;
  let totalTestCases = 0;
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;

  if (asmQuestions.length > 0) {
    const totalPointsPossible = getAssessmentTotalMaxMarks(assessment, null, asmQuestions);

    asmQuestions.forEach((q) => {
      const qMax = getQuestionMaxMarks(q, assessment);
      const latestSub = latestSubs.find((s) => s.questionId === q.id);
      if (latestSub) {
        testCasesPassed += latestSub.testCasesPassed || 0;
        totalTestCases += latestSub.totalTestCases || (q.testCases?.length || 1);
        const rawSubScore = latestSub.score !== undefined && latestSub.score !== null ? Number(latestSub.score) : 0;
        let subScore = rawSubScore;
        if (latestSub.maxScore && latestSub.maxScore > qMax && rawSubScore > qMax) {
          subScore = Math.round((rawSubScore / latestSub.maxScore) * qMax);
        } else {
          subScore = Math.min(rawSubScore, qMax);
        }
        totalScore += subScore;

        const isAccepted = latestSub.status === 'Accepted' || subScore >= qMax;
        if (isAccepted || subScore > 0) {
          correctCount++;
        } else {
          wrongCount++;
        }
      } else {
        totalTestCases += q.testCases?.length || 1;
      }
    });

    totalScore = Math.min(totalScore, totalPointsPossible);
    const unansweredCount = Math.max(0, asmQuestions.length - (correctCount + wrongCount));
    const percentage = totalPointsPossible > 0 ? Math.min(100, Math.round((totalScore / totalPointsPossible) * 100)) : 0;

    return {
      score: totalScore,
      maxScore: totalPointsPossible,
      percentage,
      testCasesPassed,
      totalTestCases,
      correctCount,
      wrongCount,
      unansweredCount,
      latestSubmissions: latestSubs,
    };
  } else {
    // Fallback if no questions array is provided
    latestSubs.forEach((sub) => {
      testCasesPassed += sub.testCasesPassed || 0;
      totalTestCases += sub.totalTestCases || 1;
      const subScore = sub.score !== undefined && sub.score !== null ? sub.score : 0;
      totalScore += subScore;
      if (sub.status === 'Accepted' || subScore >= (sub.maxScore || 1)) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    const maxScore = latestSubs.reduce((acc, s) => acc + (s.maxScore || 10), 0) || 100;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    return {
      score: totalScore,
      maxScore,
      percentage,
      testCasesPassed,
      totalTestCases,
      correctCount,
      wrongCount,
      unansweredCount: 0,
      latestSubmissions: latestSubs,
    };
  }
}
