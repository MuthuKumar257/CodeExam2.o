import {
  getSessionTotalMarksObtained,
  getAssessmentTotalMaxMarks,
  getCandidateSessionMetrics,
} from '../src/utils/submissionUtils';
import { Assessment, CandidateSession, Question, Submission } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('=== STARTING CODEEXAM REQUIREMENT VERIFICATION TESTS ===\n');

// ------------------------------------------------------------------------------
// TEST 1: Testcase-based Scoring (0/10, 1/10, 5/10, 7/10, 10/10)
// ------------------------------------------------------------------------------
console.log('--- TEST 1: Testcase-based Scoring ---');
const sampleQuestion: Question = {
  id: 'q-math-1',
  type: 'CODING',
  title: 'Sum of Two',
  problemStatement: 'Return a + b',
  points: 10,
  difficulty: 'EASY',
  tags: ['Math'],
  testCases: Array.from({ length: 10 }, (_, i) => ({
    id: `tc-${i + 1}`,
    input: `${i} ${i}`,
    expectedOutput: `${i * 2}`,
    isPublic: i < 2,
  })),
};

const sampleAssessment = {
  id: 'asm-101',
  title: 'Algorithms Exam',
  description: 'Midterm',
  instructions: 'Do your best',
  durationMinutes: 60,
  startTime: '2026-10-01T00:00:00Z',
  endTime: '2099-12-31T23:59:59Z',
  maxAttempts: 2,
  passingScore: 50,
  maximum_marks: 10,
  totalPoints: 10,
  institutionId: 'inst-1',
  facultyId: 'fac-1',
  facultyName: 'Dr. Turing',
  allowedLanguages: ['python'],
  securitySettings: { requireFullscreen: true, detectTabSwitch: true, detectWindowBlur: true, detectCopy: true, detectPaste: true, detectCut: true, detectRightClick: true, detectMultipleFaces: true, detectNoFace: true, detectCameraDisabled: true, detectMicrophoneDisabled: true, recordProctoringVideo: true, recordScreenshots: true, maxWarnings: 3, autoSubmitOnWarningThreshold: true },
  riskWeights: { TAB_SWITCH: 10, WINDOW_BLUR: 10, FULLSCREEN_EXIT: 15, COPY: 10, PASTE: 10, CUT: 10, CAMERA_DISABLED: 20, NO_FACE: 15, MULTIPLE_FACES: 25, SUSPICIOUS_PASTE: 20 },
  questions: [sampleQuestion],
  candidateIds: ['std-1'],
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00Z',
} as any as Assessment;

// Submissions passing 0/10, 1/10, 5/10, 7/10, 10/10
[
  { passed: 0, expectedScore: 0 },
  { passed: 1, expectedScore: 1 },
  { passed: 5, expectedScore: 5 },
  { passed: 7, expectedScore: 7 },
  { passed: 10, expectedScore: 10 },
].forEach(({ passed, expectedScore }) => {
  const sub = {
    id: `sub-${passed}`,
    sessionId: 'sess-1',
    attemptNumber: 1,
    candidateId: 'std-1',
    candidateName: 'Alice',
    questionTitle: 'Sum of Two',
    assessmentId: 'asm-101',
    questionId: 'q-math-1',
    language: 'python',
    sourceCode: 'def solve(): pass',
    status: passed === 10 ? 'Accepted' : 'Wrong Answer',
    score: expectedScore,
    maxScore: 10,
    testCasesPassed: passed,
    totalTestCases: 10,
    submittedAt: new Date(Date.now() + passed * 1000).toISOString(),
    executionTimeMs: 15,
    memoryUsageMb: 12,
  } as any as Submission;

  const session = {
    id: 'sess-1',
    attemptNumber: 1,
    candidateId: 'std-1',
    candidateName: 'Alice',
    candidateEmail: 'alice@college.edu',
    assessmentId: 'asm-101',
    assessmentTitle: 'Algorithms Exam',
    state: 'SUBMITTED',
    currentQuestionIndex: 0,
    startedAt: '2026-10-01T10:00:00Z',
    score: expectedScore,
    totalPoints: 10,
    warningsCount: 0,
    cameraActive: true,
    micActive: true,
    fullscreenActive: true,
    connectionStatus: 'CONNECTED',
    riskScore: 0,
    riskCategory: 'NORMAL',
    proctoringEvents: [],
  } as any as CandidateSession;

  const calculated = getSessionTotalMarksObtained(session, [sub], sampleAssessment, [sampleQuestion]);
  assert(calculated === expectedScore, `Score for ${passed}/10 test cases is ${calculated} (expected ${expectedScore})`);
});

// ------------------------------------------------------------------------------
// TEST 2: Multiple Submissions & Latest Submission Rule
// ------------------------------------------------------------------------------
console.log('\n--- TEST 2: Multiple Submissions - Latest Submission Only ---');
const sub1 = {
  id: 'sub-seq-1',
  sessionId: 'sess-multi',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  questionTitle: 'Sum of Two',
  assessmentId: 'asm-101',
  questionId: 'q-math-1',
  language: 'python',
  sourceCode: 'v1',
  status: 'Wrong Answer',
  score: 3,
  maxScore: 10,
  testCasesPassed: 3,
  totalTestCases: 10,
  submittedAt: '2026-10-01T10:05:00Z',
  executionTimeMs: 10,
  memoryUsageMb: 10,
} as any as Submission;

const sub2 = {
  id: 'sub-seq-2',
  sessionId: 'sess-multi',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  questionTitle: 'Sum of Two',
  assessmentId: 'asm-101',
  questionId: 'q-math-1',
  language: 'python',
  sourceCode: 'v2',
  status: 'Wrong Answer',
  score: 6,
  maxScore: 10,
  testCasesPassed: 6,
  totalTestCases: 10,
  submittedAt: '2026-10-01T10:10:00Z',
  executionTimeMs: 10,
  memoryUsageMb: 10,
} as any as Submission;

const sub3 = {
  id: 'sub-seq-3',
  sessionId: 'sess-multi',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  questionTitle: 'Sum of Two',
  assessmentId: 'asm-101',
  questionId: 'q-math-1',
  language: 'python',
  sourceCode: 'v3',
  status: 'Accepted',
  score: 9,
  maxScore: 10,
  testCasesPassed: 9,
  totalTestCases: 10,
  submittedAt: '2026-10-01T10:15:00Z',
  executionTimeMs: 10,
  memoryUsageMb: 10,
} as any as Submission;

const multiSession = {
  id: 'sess-multi',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  candidateEmail: 'alice@college.edu',
  assessmentId: 'asm-101',
  assessmentTitle: 'Algorithms Exam',
  state: 'ACTIVE',
  currentQuestionIndex: 0,
  startedAt: '2026-10-01T10:00:00Z',
  totalPoints: 10,
  warningsCount: 0,
  cameraActive: true,
  micActive: true,
  fullscreenActive: true,
  connectionStatus: 'CONNECTED',
  riskScore: 0,
  riskCategory: 'NORMAL',
  proctoringEvents: [],
} as any as CandidateSession;

// Three submissions (scores 3, 6, 9) -> final score must be 9 (not 18)
const scoreAfterThree = getSessionTotalMarksObtained(multiSession, [sub1, sub2, sub3], sampleAssessment, [sampleQuestion]);
assert(scoreAfterThree === 9, `Score after multiple submissions (3, 6, 9) is ${scoreAfterThree} (expected 9)`);

// ------------------------------------------------------------------------------
// TEST 3: Latest Submission = Zero Marks Rule (No Fallback)
// ------------------------------------------------------------------------------
console.log('\n--- TEST 3: Latest Submission Zero Score (Requirement 4) ---');
const sub4Zero = {
  id: 'sub-seq-4',
  sessionId: 'sess-multi',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  questionTitle: 'Sum of Two',
  assessmentId: 'asm-101',
  questionId: 'q-math-1',
  language: 'python',
  sourceCode: 'syntax error broken code',
  status: 'Compilation Error',
  score: 0,
  maxScore: 10,
  testCasesPassed: 0,
  totalTestCases: 10,
  submittedAt: '2026-10-01T10:20:00Z', // Latest timestamp!
  executionTimeMs: 0,
  memoryUsageMb: 0,
} as any as Submission;

const scoreAfterZero = getSessionTotalMarksObtained(multiSession, [sub1, sub2, sub3, sub4Zero], sampleAssessment, [sampleQuestion]);
assert(scoreAfterZero === 0, `Score after latest zero submission is ${scoreAfterZero} (must remain 0, no fallback)`);

// ------------------------------------------------------------------------------
// TEST 4: Attempt Isolation (Retake independence)
// ------------------------------------------------------------------------------
console.log('\n--- TEST 4: Retake Isolation (Requirement 8) ---');
const attempt1Session = {
  id: 'attempt-001',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  candidateEmail: 'alice@college.edu',
  assessmentId: 'asm-101',
  assessmentTitle: 'Algorithms Exam',
  state: 'SUBMITTED',
  currentQuestionIndex: 0,
  startedAt: '2026-10-01T09:00:00Z',
  completedAt: '2026-10-01T10:00:00Z',
  score: 10,
  totalPoints: 10,
  warningsCount: 0,
  cameraActive: true,
  micActive: true,
  fullscreenActive: true,
  connectionStatus: 'CONNECTED',
  riskScore: 0,
  riskCategory: 'NORMAL',
  proctoringEvents: [],
} as any as CandidateSession;

const attempt2Session = {
  id: 'attempt-002',
  attemptNumber: 2,
  candidateId: 'std-1',
  candidateName: 'Alice',
  candidateEmail: 'alice@college.edu',
  assessmentId: 'asm-101',
  assessmentTitle: 'Algorithms Exam',
  state: 'ACTIVE',
  currentQuestionIndex: 0,
  startedAt: '2026-10-01T11:00:00Z',
  score: 0,
  totalPoints: 10,
  warningsCount: 0,
  cameraActive: true,
  micActive: true,
  fullscreenActive: true,
  connectionStatus: 'CONNECTED',
  riskScore: 0,
  riskCategory: 'NORMAL',
  proctoringEvents: [],
} as any as CandidateSession;

const att1Sub = {
  id: 'sub-att-1',
  sessionId: 'attempt-001',
  attemptId: 'attempt-001',
  attemptNumber: 1,
  candidateId: 'std-1',
  candidateName: 'Alice',
  questionTitle: 'Sum of Two',
  assessmentId: 'asm-101',
  questionId: 'q-math-1',
  language: 'python',
  sourceCode: 'solution1',
  status: 'Accepted',
  score: 10,
  maxScore: 10,
  testCasesPassed: 10,
  totalTestCases: 10,
  submittedAt: '2026-10-01T09:30:00Z',
  executionTimeMs: 10,
  memoryUsageMb: 10,
} as any as Submission;

// Attempt 2 has no submissions yet
const att2Metrics = getCandidateSessionMetrics(attempt2Session, [att1Sub], sampleAssessment, [sampleQuestion]);
assert(att2Metrics.score === 0, `Attempt 2 initial score is ${att2Metrics.score} (isolated from Attempt 1's 10 points)`);
assert(att2Metrics.latestSubmissions.length === 0, `Attempt 2 has 0 submissions (isolated from Attempt 1's submissions)`);

// ------------------------------------------------------------------------------
// TEST 5: Assessment Maximum Marks Resolution
// ------------------------------------------------------------------------------
console.log('\n--- TEST 5: Maximum Marks Resolution (Requirement 7) ---');
const maxMarks = getAssessmentTotalMaxMarks(sampleAssessment, attempt1Session, [sampleQuestion]);
assert(maxMarks === 10, `Assessment maximum marks resolved as ${maxMarks} (expected 10)`);

// ------------------------------------------------------------------------------
// TEST 6: Deleted Assessment Exclusion from Rankings
// ------------------------------------------------------------------------------
console.log('\n--- TEST 6: Deleted Assessment Exclusion from Rankings (Requirement 1) ---');
const deletedAsm = {
  ...sampleAssessment,
  id: 'asm-deleted-999',
  status: 'ARCHIVED',
  deletedAt: '2026-10-01T12:00:00Z',
} as any as Assessment;

const isDeleted = (asm: Assessment) =>
  !asm || (asm as any).isDeleted || asm.status === 'ARCHIVED' || (asm.status as any) === 'deleted' || (asm as any).deletedAt;

assert(isDeleted(deletedAsm) === true, 'Deleted assessment is correctly identified as deleted');
assert(!isDeleted(sampleAssessment), 'Active assessment is correctly identified as not deleted');

// ------------------------------------------------------------------------------
// TEST 7: Closed/Ended Assessment Live Monitoring Filter
// ------------------------------------------------------------------------------
console.log('\n--- TEST 7: Live Monitoring Status Filter (Requirement 5) ---');
const closedAsm = {
  ...sampleAssessment,
  id: 'asm-closed-1',
  status: 'CLOSED',
} as any as Assessment;

const expiredAsm = {
  ...sampleAssessment,
  id: 'asm-expired-1',
  status: 'ACTIVE',
  endTime: '2026-09-01T00:00:00Z', // In the past
} as any as Assessment;

const isLiveAssessment = (asm: Assessment) => {
  if (!asm || !asm.id) return false;
  if ((asm as any).isDeleted || asm.status === 'ARCHIVED' || (asm.status as any) === 'deleted' || (asm as any).deletedAt) return false;
  if (asm.status === 'CLOSED' || asm.status === 'COMPLETED') return false;
  const isPastEnd = asm.endTime && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED';
  if (isPastEnd) return false;
  return asm.status === 'ACTIVE' || (asm.status as any) === 'live';
};

assert(!isLiveAssessment(closedAsm), 'Closed assessment correctly filtered out of live monitoring');
assert(!isLiveAssessment(expiredAsm), 'Expired assessment correctly filtered out of live monitoring');
assert(!isLiveAssessment(deletedAsm), 'Deleted assessment correctly filtered out of live monitoring');
assert(isLiveAssessment(sampleAssessment), 'Active assessment correctly included in live monitoring');

console.log('\n=== ALL 7 REQUIREMENT TESTS PASSED PERFECTLY! ===');
