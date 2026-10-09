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

export function evaluateOutput(actual, expected) {
  const normActual = String(actual || '').trim().replace(/\r\n/g, '\n');
  const normExpected = String(expected || '').trim().replace(/\r\n/g, '\n');
  return normActual === normExpected;
}
