/**
 * Testcase scoring calculation service
 * Formula: Question Score = (Passed Test Cases / Total Test Cases) * Maximum Question Marks
 */
export function calculateQuestionScore(arg1, arg2, arg3) {
  let passedTestCases = 0;
  let totalTestCases = 0;
  let maxMarks = 0;

  if (typeof arg1 === 'object' && arg1 !== null) {
    passedTestCases = Number(arg1.passedTestCases ?? arg1.passedCount ?? arg1.passed ?? 0);
    totalTestCases = Number(arg1.totalTestCases ?? arg1.totalCount ?? arg1.total ?? 0);
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
  // Ensure partial score never equals or exceeds maxMarks when passed < total
  return Math.min(rounded, maxMarks > 0.01 ? maxMarks - 0.01 : 0);
}

export function calculateTestcaseScore(passedCount, totalCount, questionMarks) {
  return calculateQuestionScore({
    passedTestCases: passedCount,
    totalTestCases: totalCount,
    maxMarks: questionMarks,
  });
}

export function normalizeOutputLines(output) {
  if (output === null || output === undefined) return '';
  return String(output)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function evaluateOutput(actual, expected) {
  const normActual = normalizeOutputLines(actual);
  const normExpected = normalizeOutputLines(expected);
  return normActual === normExpected;
}

/**
 * Calculate test-case-based question score (Equal Marks per Question is OFF).
 * Question Score = Sum of marks for all passed test cases.
 * Handles both individually configured test-case marks and question-level allocations.
 */
export function calculateTestCaseBasedScore({ testcases = [], testcaseResults = [], totalQuestionMarks = 20 } = {}) {
  const cases = testcases.length > 0 ? testcases : testcaseResults;
  if (!Array.isArray(cases) || cases.length === 0) {
    return {
      score: 0,
      maxScore: Number(totalQuestionMarks) || 20,
      testcaseScores: [],
      passedCount: 0,
      totalCount: 0,
    };
  }

  const totalCount = cases.length;
  const hasConfiguredMarks = cases.some(
    (tc) => (tc.marks !== undefined && tc.marks !== null) || (tc.points !== undefined && tc.points !== null)
  );

  const defaultMarkPerTc = totalCount > 0 ? Number(totalQuestionMarks) / totalCount : 0;
  let earnedScore = 0;
  let maxScore = 0;
  let passedCount = 0;
  const testcaseScores = [];

  for (let i = 0; i < totalCount; i++) {
    const tc = cases[i];
    const res = testcaseResults[i] || tc;
    const isPassed = Boolean(res.passed);

    const tcMarks = hasConfiguredMarks
      ? Number(tc.marks ?? tc.points ?? 0)
      : defaultMarkPerTc;

    maxScore += tcMarks;

    const awarded = isPassed ? tcMarks : 0;
    if (isPassed) {
      passedCount++;
      earnedScore += awarded;
    }

    testcaseScores.push({
      testcase_id: tc.id || tc.testcase_id,
      index: i + 1,
      passed: isPassed,
      marks_awarded: Math.round((awarded + Number.EPSILON) * 100) / 100,
      max_marks: Math.round((tcMarks + Number.EPSILON) * 100) / 100,
    });
  }

  const roundedScore = Math.round((earnedScore + Number.EPSILON) * 100) / 100;
  const roundedMax = Math.round((maxScore + Number.EPSILON) * 100) / 100;

  return {
    score: roundedScore,
    maxScore: roundedMax,
    testcaseScores,
    passedCount,
    totalCount,
  };
}
