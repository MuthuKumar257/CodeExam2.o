import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuestionScore, calculateTestcaseScore } from '../services/scoringService.js';

test('Scoring Table from Requirements', async (t) => {
  await t.test('0/10 test cases passed with max 20 marks => 0 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 0, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 0);
  });

  await t.test('5/10 test cases passed with max 20 marks => 10 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 5, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 10);
  });

  await t.test('7/10 test cases passed with max 20 marks => 14 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 7, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 14);
  });

  await t.test('9/10 test cases passed with max 20 marks => 18 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 9, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 18);
  });

  await t.test('10/10 test cases passed with max 20 marks => 20 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 10, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 20);
  });

  await t.test('3/10 test cases passed with max 15 marks => 4.5 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 3, totalTestCases: 10, maxMarks: 15 });
    assert.equal(score, 4.5);
  });

  await t.test('1/3 test cases passed with max 10 marks => 3.33 marks (proper 2-decimal rounding)', () => {
    const score = calculateQuestionScore({ passedTestCases: 1, totalTestCases: 3, maxMarks: 10 });
    assert.equal(score, 3.33);
  });
});

test('calculateTestcaseScore compatibility adapter', () => {
  assert.equal(calculateTestcaseScore(7, 10, 20), 14);
  assert.equal(calculateTestcaseScore(0, 10, 20), 0);
  assert.equal(calculateTestcaseScore(10, 10, 20), 20);
  assert.equal(calculateTestcaseScore(1, 3, 10), 3.33);
});

test('Edge cases and security', async (t) => {
  await t.test('Never awards full marks when any test case fails', () => {
    // 99 out of 100 on 20 marks => 19.8
    const score = calculateQuestionScore({ passedTestCases: 99, totalTestCases: 100, maxMarks: 20 });
    assert.ok(score < 20);
    assert.equal(score, 19.8);
  });

  await t.test('Zero test cases or negative values return 0', () => {
    assert.equal(calculateQuestionScore({ passedTestCases: 0, totalTestCases: 0, maxMarks: 20 }), 0);
    assert.equal(calculateQuestionScore({ passedTestCases: -1, totalTestCases: 5, maxMarks: 20 }), 0);
    assert.equal(calculateQuestionScore({ passedTestCases: 5, totalTestCases: -5, maxMarks: 20 }), 0);
    assert.equal(calculateQuestionScore({ passedTestCases: 5, totalTestCases: 10, maxMarks: -20 }), 0);
  });

  await t.test('Passed test cases exceeding total is clamped safely to maxMarks', () => {
    assert.equal(calculateQuestionScore({ passedTestCases: 15, totalTestCases: 10, maxMarks: 20 }), 20);
  });

  await t.test('Positional arguments work as well', () => {
    assert.equal(calculateQuestionScore(7, 10, 20), 14);
    assert.equal(calculateQuestionScore(10, 10, 20), 20);
    assert.equal(calculateQuestionScore(0, 10, 20), 0);
  });
});
