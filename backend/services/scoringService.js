/**
 * Testcase scoring calculation service
 * Formula: score = (passed_testcases / total_testcases) * question_marks
 */
export function calculateTestcaseScore(passedCount, totalCount, questionMarks) {
  if (!totalCount || totalCount <= 0) return 0;
  if (!passedCount || passedCount <= 0) return 0;
  const rawScore = (Number(passedCount) / Number(totalCount)) * Number(questionMarks || 0);
  return Math.round(rawScore * 100) / 100;
}

export function evaluateOutput(actual, expected) {
  const normActual = String(actual || '').trim().replace(/\r\n/g, '\n');
  const normExpected = String(expected || '').trim().replace(/\r\n/g, '\n');
  return normActual === normExpected;
}
