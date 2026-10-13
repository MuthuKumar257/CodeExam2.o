import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuestionScore, calculateTestCaseBasedScore } from '../services/scoringService.js';
import { SessionService } from '../services/sessionService.js';
import { TestService } from '../services/testService.js';
import { memoryStore } from '../services/supabaseService.js';

test('1. calculateTestCaseBasedScore (Equal Marks per Question is OFF)', async (t) => {
  await t.test('Calculates score based on individual configured test-case marks', () => {
    const testcases = [
      { id: 'tc-1', marks: 5 },
      { id: 'tc-2', marks: 10 },
      { id: 'tc-3', marks: 5 },
    ];
    const testcaseResults = [
      { testcase_id: 'tc-1', passed: true },
      { testcase_id: 'tc-2', passed: true },
      { testcase_id: 'tc-3', passed: false },
    ];

    const result = calculateTestCaseBasedScore({ testcases, testcaseResults, totalQuestionMarks: 20 });
    assert.equal(result.score, 15);
    assert.equal(result.maxScore, 20);
    assert.equal(result.passedCount, 2);
    assert.equal(result.totalCount, 3);
    assert.equal(result.testcaseScores[0].marks_awarded, 5);
    assert.equal(result.testcaseScores[1].marks_awarded, 10);
    assert.equal(result.testcaseScores[2].marks_awarded, 0);
  });

  await t.test('All test cases pass awards full configured marks', () => {
    const testcases = [
      { id: 'tc-1', points: 8 },
      { id: 'tc-2', points: 12 },
    ];
    const testcaseResults = [
      { testcase_id: 'tc-1', passed: true },
      { testcase_id: 'tc-2', passed: true },
    ];

    const result = calculateTestCaseBasedScore({ testcases, testcaseResults });
    assert.equal(result.score, 20);
    assert.equal(result.maxScore, 20);
    assert.equal(result.passedCount, 2);
  });

  await t.test('Zero test cases pass awards 0 marks', () => {
    const testcases = [
      { id: 'tc-1', marks: 10 },
      { id: 'tc-2', marks: 10 },
    ];
    const testcaseResults = [
      { testcase_id: 'tc-1', passed: false },
      { testcase_id: 'tc-2', passed: false },
    ];

    const result = calculateTestCaseBasedScore({ testcases, testcaseResults, totalQuestionMarks: 20 });
    assert.equal(result.score, 0);
    assert.equal(result.maxScore, 20);
    assert.equal(result.passedCount, 0);
  });

  await t.test('Divides total question marks evenly when individual marks are not configured', () => {
    const testcases = [
      { id: 'tc-1' },
      { id: 'tc-2' },
      { id: 'tc-3' },
      { id: 'tc-4' },
    ];
    const testcaseResults = [
      { testcase_id: 'tc-1', passed: true },
      { testcase_id: 'tc-2', passed: true },
      { testcase_id: 'tc-3', passed: true },
      { testcase_id: 'tc-4', passed: false },
    ];

    // 20 marks total / 4 = 5 marks per test case. 3 passed = 15 marks.
    const result = calculateTestCaseBasedScore({ testcases, testcaseResults, totalQuestionMarks: 20 });
    assert.equal(result.score, 15);
    assert.equal(result.maxScore, 20);
    assert.equal(result.passedCount, 3);
    assert.equal(result.testcaseScores[0].marks_awarded, 5);
    assert.equal(result.testcaseScores[3].marks_awarded, 0);
  });

  await t.test('Proper decimal rounding when total question marks cannot be evenly divided', () => {
    const testcases = [
      { id: 'tc-1' },
      { id: 'tc-2' },
      { id: 'tc-3' },
    ];
    const testcaseResults = [
      { testcase_id: 'tc-1', passed: true },
      { testcase_id: 'tc-2', passed: false },
      { testcase_id: 'tc-3', passed: false },
    ];

    // 10 marks total / 3 = 3.3333... => rounded to 3.33
    const result = calculateTestCaseBasedScore({ testcases, testcaseResults, totalQuestionMarks: 10 });
    assert.equal(result.score, 3.33);
    assert.equal(result.maxScore, 10);
    assert.equal(result.passedCount, 1);
  });
});

test('2. calculateQuestionScore (Equal Marks per Question is ON)', async (t) => {
  await t.test('Question Score = (Passed / Total) * Maximum Question Marks', () => {
    // 7/10 passed on 20 marks => 14 marks
    const score = calculateQuestionScore({ passedTestCases: 7, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 14);
  });

  await t.test('Never awards full marks when some test cases fail', () => {
    const score = calculateQuestionScore({ passedTestCases: 9, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 18);
    assert.ok(score < 20);
  });

  await t.test('0 passed awards 0 marks', () => {
    const score = calculateQuestionScore({ passedTestCases: 0, totalTestCases: 10, maxMarks: 20 });
    assert.equal(score, 0);
  });
});

test('3. Test Service handles camelCase and snake_case properties consistently', async (t) => {
  const sampleTest = {
    title: 'CS 101 Midterm',
    startTime: '2026-10-15T09:00:00.000Z',
    endTime: '2026-10-15T11:00:00.000Z',
    isEqualMarks: false,
    marksPerQuestion: 25,
    durationMinutes: 60,
  };

  const created = await TestService.createTest(sampleTest);
  assert.equal(created.start_time, '2026-10-15T09:00:00.000Z');
  assert.equal(created.end_time, '2026-10-15T11:00:00.000Z');
  assert.equal(created.is_equal_marks, false);
  assert.equal(created.isEqualMarks, false);
  assert.equal(created.marks_per_question, 25);
});

test('4. Session Service startOrRestoreSession Scheduling Window', async (t) => {
  const scheduledStart = new Date('2026-10-20T10:00:00.000Z');
  const scheduledEnd = new Date('2026-10-20T12:00:00.000Z');

  const testRecord = {
    id: 'test-sched-1',
    title: 'Timed Assessment',
    status: 'PUBLISHED',
    start_time: scheduledStart.toISOString(),
    end_time: scheduledEnd.toISOString(),
    duration_minutes: 60,
    questions: [],
  };

  memoryStore.tests = [testRecord];

  await t.test('Rejects early start before scheduled start time with 409 ASSESSMENT_NOT_STARTED', async () => {
    const earlyTime = new Date('2026-10-20T09:59:00.000Z');
    await assert.rejects(
      async () => {
        await SessionService.startOrRestoreSession('test-sched-1', 'student-early-1', 'Early Student', earlyTime);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.errorCode, 'ASSESSMENT_NOT_STARTED');
        return true;
      }
    );
  });

  await t.test('Allows start at or after scheduled start time within window', async () => {
    const validStartTime = new Date('2026-10-20T10:00:01.000Z');
    const result = await SessionService.startOrRestoreSession('test-sched-1', 'student-valid-1', 'Valid Student', validStartTime);
    assert.ok(result.session);
    assert.equal(result.session.test_id, 'test-sched-1');
    assert.equal(result.session.student_id, 'student-valid-1');
    assert.equal(result.session.status, 'ACTIVE');
  });

  await t.test('Rejects new attempt after scheduled end time with 409 ASSESSMENT_CLOSED', async () => {
    const lateTime = new Date('2026-10-20T12:00:01.000Z');
    await assert.rejects(
      async () => {
        await SessionService.startOrRestoreSession('test-sched-1', 'student-late-1', 'Late Student', lateTime);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.errorCode, 'ASSESSMENT_CLOSED');
        return true;
      }
    );
  });

  await t.test('Allows active in-progress session to resume even if reconnected after start time', async () => {
    // Valid student reconnects 10 minutes later
    const reconnectTime = new Date('2026-10-20T10:10:00.000Z');
    const result = await SessionService.startOrRestoreSession('test-sched-1', 'student-valid-1', 'Valid Student', reconnectTime);
    assert.ok(result.session);
    assert.equal(result.isRestored, true);
    assert.equal(result.session.student_id, 'student-valid-1');
  });
});
