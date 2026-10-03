export type UserRole = 'ADMIN' | 'FACULTY' | 'CANDIDATE' | 'admin' | 'faculty' | 'student';

export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: UserRole;
  institutionId?: string;
  institutionName?: string;
  avatar?: string;
  createdAt: string;
  updatedAt?: string;
  registerNo?: string;
  registerNumber?: string;
  rollNumber?: string;
  employeeId?: string;
  department?: string;
  batch?: string;
  year?: string;
  section?: string;
  classIds?: string[];
  status?: 'ACTIVE' | 'INACTIVE';
  isActive?: boolean;
  accountStatus?: 'active' | 'disabled' | 'pending' | 'provisioning' | 'failed';
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  provisioningState?: 'pending' | 'provisioning' | 'active' | 'failed' | 'disabled';
  password?: string;
  facultySettings?: FacultySettings;
  studentSettings?: StudentSettings;
}

export interface StudentProfile {
  uid: string;
  name: string;
  email: string;
  registerNumber: string;
  role: 'student' | 'CANDIDATE';
  createdAt: string;
  updatedAt?: string;
}

export interface FacultyProfile {
  uid: string;
  name: string;
  email: string;
  role: 'faculty' | 'FACULTY';
  createdAt: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  institutionId?: string;
  hodName?: string;
  facultyCount?: number;
  studentCount?: number;
  createdAt: string;
}

export interface Classroom {
  id: string;
  name: string;
  className?: string;
  department?: string;
  batch?: string;
  year?: string;
  section?: string;
  academicYear?: string;
  institutionId: string;
  staffIds: string[];      // Faculty IDs assigned to this class
  facultyIds?: string[];   // Alias for faculty IDs
  studentIds: string[];    // Student (CANDIDATE User) IDs belonging to this class
  status?: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt?: string;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  domain: string;
  facultyCount: number;
  candidateCount: number;
  assessmentCount: number;
  createdAt: string;
}

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionType = 'CODING' | 'MCQ';

export interface SampleTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface HiddenTestCase {
  input: string;
  output: string;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isPublic: boolean;
  explanation?: string;
}

export interface MCQOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  // Questions are reusable across classes; class access is controlled by assessments.
  scope?: 'UNIVERSAL';
  institutionId?: string;
  type: QuestionType;
  title: string;
  problemStatement: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string;
  explanation?: string;
  sampleTestCases?: SampleTestCase[];
  hiddenTestCases?: HiddenTestCase[];
  difficulty: QuestionDifficulty;
  tags: string[];
  points: number;
  comparisonMode?: 'EXACT' | 'TRIM_WHITESPACE' | 'TOKEN_BASED';
  inputsCount?: number; // No. of inputs per testcase
  pointsPerHiddenTestCase?: number; // Points awarded per hidden testcase passed
  enableStarterCode?: boolean; // Default false (empty editor)
  starterCodeEnabled?: boolean; // Required alias
  starterCode?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  // For coding questions
  functionSignature?: Record<string, string>; // Optional template code if enabled
  testCases?: TestCase[]; // Compiled test cases for execution engine
  // For MCQ questions
  mcqOptions?: MCQOption[];
  mcqExplanation?: string;
}

export interface SecuritySettings {
  enableCamera?: boolean;
  enableMicrophone?: boolean;
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  detectCopy: boolean;
  detectPaste: boolean;
  detectCut: boolean;
  detectRightClick: boolean;
  detectMultipleFaces: boolean;
  detectNoFace: boolean;
  detectCameraDisabled: boolean;
  detectMicrophoneDisabled: boolean;
  recordProctoringVideo: boolean;
  recordScreenshots: boolean;
  maxWarnings: number;
  autoSubmitOnWarningThreshold: boolean;
  fullscreenTimeoutSec?: number;
  detectMultipleFacesAsWarning?: boolean;
  detectCameraObstruction?: boolean;
  detectVideoFreeze?: boolean;
  liveFacultyMonitoring?: boolean;
  showCameraPreviewToStudent?: boolean;
  showResultsToStudents?: boolean;
  recordScreenRecording?: boolean;
  allowPause?: boolean;
  maxPauseDurationMinutes?: number;
}

export interface RiskWeights {
  TAB_SWITCH: number;
  WINDOW_BLUR: number;
  FULLSCREEN_EXIT: number;
  COPY: number;
  PASTE: number;
  CUT: number;
  CAMERA_DISABLED: number;
  NO_FACE: number;
  MULTIPLE_FACES: number;
  SUSPICIOUS_PASTE: number;
  PHONE_DETECTED?: number;
}

export type AssessmentStatus = 'DRAFT' | 'UPCOMING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'CLOSED';

export interface Assessment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  maxAttempts: number;
  passingScore: number;
  institutionId: string;
  facultyId: string;
  facultyName: string;
  allowedLanguages: string[]; // e.g. ['python', 'javascript', 'cpp', 'java', 'c', 'go', 'rust']
  securitySettings: SecuritySettings;
  riskWeights: RiskWeights;
  questions: Question[];
  candidateIds: string[];
  status: AssessmentStatus;
  classId?: string;
  assignedClassIds?: string[];
  category?: string;
  questionIds?: string[];
  isPasswordProtected?: boolean;
  password?: string;
  questionsPerCandidate?: number;
  randomizeQuestions?: boolean;
  isEqualMarks?: boolean;
  marksPerQuestion?: number;
  allowRetake?: boolean; // When true or maxAttempts === 2, retake test is allowed only once
  totalPoints?: number;
  showResultsToStudents?: boolean;
  restartPermissions?: Record<
    string,
    {
      allowed: boolean;
      consumed?: boolean;
      consumedAt?: string;
      consumedByAttemptId?: string;
      grantedAt: string;
      grantedBy?: string;
      mode?: 'RESET' | 'RETAKE';
      extraAttempts?: number;
      resetWarnings?: boolean;
      customDurationMinutes?: number;
      facultyNotes?: string;
      note?: string;
    }
  >;
  createdAt: string;
}

export type SessionState =
  | 'NOT_STARTED'
  | 'ENVIRONMENT_CHECK'
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED'
  | 'EXPIRED'
  | 'FLAGGED'
  | 'UNDER_REVIEW'
  | 'TERMINATED_MALPRACTICE'
  | 'CLOSED'
  | 'ENDED'
  | 'DISCONNECTED';

export type ProctoringEventType =
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'WINDOW_FOCUS'
  | 'FULLSCREEN_EXIT'
  | 'FULLSCREEN_ENTER'
  | 'COPY'
  | 'PASTE'
  | 'CUT'
  | 'RIGHT_CLICK'
  | 'CAMERA_DISABLED'
  | 'CAMERA_OBSTRUCTED'
  | 'VIDEO_FROZEN'
  | 'MIC_DISABLED'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'FACE_OUT_OF_FRAME'
  | 'WEBSOCKET_DISCONNECTED'
  | 'SUSPICIOUS_PASTE'
  | 'PHONE_DETECTED';

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ProctoringEvent {
  id: string;
  candidateId: string;
  candidateName?: string;
  assessmentId: string;
  sessionId: string;
  questionId?: string;
  type: ProctoringEventType;
  timestamp: string;
  severity: EventSeverity;
  metadata?: Record<string, unknown>;
  reviewStatus?: 'UNREVIEWED' | 'REVIEWED' | 'NEEDS_INVESTIGATION' | 'FALSE_POSITIVE';
  notes?: string;
}

export type RiskCategory = 'NORMAL' | 'REVIEW' | 'HIGH_ATTENTION' | 'MANUAL_REVIEW_REQUIRED' | 'MALPRACTICE_TERMINATED';

export interface RiskIndicator {
  score: number;
  category: RiskCategory;
  breakdown: Record<string, number>;
}

export type QuestionStatusType =
  | 'NOT_VISITED'
  | 'NOT_ANSWERED'
  | 'ANSWERED'
  | 'MARKED_FOR_REVIEW'
  | 'ANSWERED_AND_MARKED'
  | 'Accepted'
  | 'Wrong Answer'
  | 'Compilation Error'
  | 'Runtime Error'
  | 'Time Limit Exceeded'
  | 'Memory Limit Exceeded'
  | 'Submitted'
  | 'Unattempted';

export interface QuestionStatusItem {
  status: QuestionStatusType;
  selectedLanguage?: string;
  language?: string;
  isPassed?: boolean;
  score?: number;
  testCasesPassed?: number;
  totalTestCases?: number;
}

export interface TestAttempt {
  id: string; // attemptId
  attemptId: string;
  studentId: string; // candidateId
  studentName: string;
  studentEmail: string;
  studentRegisterNo?: string;
  assessmentId: string;
  assessmentTitle: string;
  attemptNumber: number;
  timer: number; // in seconds
  timeLeftSec?: number;
  durationMinutes?: number;
  testEndTime?: string;
  test_end_time?: string;
  startTime: string; // startedAt
  startedAt?: string;
  submissionTime?: string; // completedAt
  completedAt?: string;
  currentQuestion: number; // 0-based index
  currentQuestionIndex?: number;
  questionOrder: string[]; // List of question IDs in this candidate's specific order
  selectedAnswers: Record<string, string>; // questionId -> submitted code or answer
  codeMap?: Record<string, string>;
  languageMap?: Record<string, string>;
  selectedLanguage?: string;
  submissionStatus: 'ACTIVE' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'TERMINATED_MALPRACTICE' | 'EXPIRED' | 'IN_PROGRESS';
  state?: SessionState;
  score?: number;
  totalPoints?: number;
  result?: {
    score: number;
    totalPoints: number;
    percentage: number;
    status: 'PASSED' | 'FAILED' | 'UNDER_REVIEW' | 'TERMINATED_MALPRACTICE';
  };
  recording?: string; // webcam video url
  proctoringVideoUrl?: string;
  screenRecording?: string; // screen recording url
  screenVideoUrl?: string;
  cameraRecording?: string;
  flags: ProctoringEvent[];
  proctoringEvents?: ProctoringEvent[];
  warningsCount: number;
  isActive?: boolean;
  isLive?: boolean;
  status?: string;
  endedAt?: string;
  lastHeartbeatAt?: string;
  retakeInformation?: {
    allowed: boolean;
    maxAttempts: number;
    attemptNumber: number;
    attemptsUsed: number;
    canRetake: boolean;
    reason?: string;
  };
  questionStatuses?: Record<string, QuestionStatusItem>;
  createdAt?: string;
  updatedAt?: string;
}

export type Attempt = TestAttempt;

export interface CandidateSession {
  id: string; // Unique attemptId / sessionId
  attemptId?: string;
  attemptNumber?: number;
  studentId?: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateRegisterNo?: string;
  assessmentId: string;
  assessmentTitle: string;
  state: SessionState;
  submissionStatus?: 'ACTIVE' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'TERMINATED_MALPRACTICE' | 'EXPIRED' | 'IN_PROGRESS';
  currentQuestionIndex: number;
  currentQuestion?: number;
  questionOrder?: string[];
  selectedAnswers?: Record<string, string>;
  codeMap?: Record<string, string>;
  languageMap?: Record<string, string>;
  selectedLanguage?: string;
  timer?: number;
  timeLeftSec?: number;
  durationMinutes?: number;
  testEndTime?: string;
  test_end_time?: string;
  startTime?: string;
  startedAt?: string;
  submissionTime?: string;
  completedAt?: string;
  warningsCount: number;
  cameraActive: boolean;
  micActive: boolean;
  fullscreenActive: boolean;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  riskScore?: number;
  riskCategory?: RiskCategory;
  score?: number;
  totalPoints?: number;
  proctoringEvents: ProctoringEvent[];
  flags?: ProctoringEvent[];
  facultyNotes?: string;
  exitReason?: string;
  recording?: string;
  proctoringVideoUrl?: string;
  screenRecording?: string;
  screenVideoUrl?: string;
  cameraRecording?: string;
  isActive?: boolean;
  isLive?: boolean;
  status?: string;
  endedAt?: string;
  updatedAt?: string;
  lastHeartbeatAt?: string;
  isPaused?: boolean;
  pausedAt?: string;
  resumedAt?: string;
  isScreenRecordingActive?: boolean;
  screenActive?: boolean;
  videoRecordedAt?: string;
  videoExpiresAt?: string;
  videoRetentionDays?: number;
  videoSizeBytes?: number;
  isVideoExpired?: boolean;
  retakeInformation?: {
    allowed: boolean;
    maxAttempts: number;
    attemptNumber: number;
    attemptsUsed: number;
    canRetake: boolean;
    reason?: string;
  };
  result?: {
    score: number;
    totalPoints: number;
    percentage: number;
    status: 'PASSED' | 'FAILED' | 'UNDER_REVIEW' | 'TERMINATED_MALPRACTICE';
  };
  questionStatuses?: Record<string, QuestionStatusItem>;
  restartedByFaculty?: boolean;
  restartedAt?: string;
  restartNote?: string;
}

export interface CodeExecutionResult {
  status: 'Accepted' | 'Wrong Answer' | 'Compilation Error' | 'Runtime Error' | 'Time Limit Exceeded' | 'Memory Limit Exceeded';
  stdout?: string;
  stderr?: string;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  testCasesPassed?: number;
  totalTestCases?: number;
  testCaseResults?: {
    id: string;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    isPublic: boolean;
    error?: string;
  }[];
}

export interface Submission {
  id: string;
  sessionId?: string;
  attemptId?: string;
  attemptNumber?: number;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  questionId: string;
  questionTitle: string;
  language: string;
  sourceCode: string;
  status: CodeExecutionResult['status'] | 'Not Submitted';
  score: number;
  maxScore: number;
  executionTimeMs: number;
  memoryUsageMb: number;
  submittedAt: string;
  testCasesPassed: number;
  totalTestCases: number;
  testCaseResults?: CodeExecutionResult['testCaseResults'];
  stderr?: string;
  stdout?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface AnalyticsSummary {
  totalInstitutions: number;
  totalFaculty: number;
  totalCandidates: number;
  activeAssessments: number;
  completedAssessments: number;
  submittedAssessments?: number;
  flaggedAssessments: number;
  avgCompletionRate: number;
  avgScorePercentage: number;
}

export interface SystemSettings {
  id?: string;
  cameraRequired: boolean;
  microphoneRequired: boolean;
  liveFacultyMonitoring: boolean;
  showCameraPreviewToStudent: boolean;
  detectMultiplePersons: boolean;
  detectNoPerson: boolean;
  detectCameraObstruction: boolean;
  detectVideoFreeze: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  requireFullscreen: boolean;
  allowPageRefresh: boolean;
  allowReconnect: boolean;
  allowPauseAssessment?: boolean;
  maxPauseDurationMinutes?: number;
  maxPausesAllowedPerCandidate?: number;
  maxWarnings: number;
  autoSubmitOnWarningLimit: boolean;
  allowedLanguages: string[];
  assessmentDuration: number;
  questionNavigation: boolean;
  randomizeQuestions: boolean;
  videoRetentionDays: number;
  autoPurgeExpiredVideos?: boolean;
  codeExecutionTimeoutSec?: number;
  strictIpLock?: boolean;
  watermarkStudentId?: boolean;
  sessionTimeoutMinutes?: number;
  showResultsToStudents?: boolean;
  recordScreenRecording?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface FacultySettings {
  id?: string;
  defaultEnableCamera?: boolean;
  defaultEnableMicrophone?: boolean;
  defaultDurationMinutes: number;
  defaultPassingScore: number;
  defaultRandomizeQuestions: boolean;
  defaultQuestionNavigation: boolean;
  allowPartialMarking: boolean;
  defaultShowSolutionsImmediately: boolean;
  defaultShowResultsToStudents?: boolean;
  defaultAllowPauseAssessment?: boolean;
  defaultMaxPauseDurationMinutes?: number;
  liveGridDensity: 'compact' | 'comfortable' | 'expanded';
  alertSoundOnWarning: boolean;
  highRiskThresholdScore: number;
  liveFeedRefreshRateSec: number;
  diffViewMode: 'split' | 'unified';
  plagiarismThresholdPercent: number;
  aiFeedbackEnabled: boolean;
  emailReportOnCompletion: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StudentSettings {
  id?: string;
  editorTheme: 'vs-dark' | 'light' | 'monokai' | 'dracula';
  fontSize: number;
  tabSize: number;
  keybindings: 'standard' | 'vim' | 'emacs';
  enableAutocomplete: boolean;
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSaveIntervalSec: number;
  cameraPipPosition: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' | 'hidden';
  cameraPipSize: 'small' | 'medium' | 'large';
  enableAudioWarningBeep: boolean;
  highContrastMode: boolean;
  fontFamily: string;
  bandwidthSaverMode: boolean;
  preferredLanguage?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface FacultyReview {
  id: string;
  sessionId: string;
  assessmentId?: string;
  candidateId?: string;
  candidateName?: string;
  facultyId: string;
  facultyName: string;
  decision: 'CLEARED' | 'FLAGGED_MALPRACTICE' | 'NEEDS_FURTHER_INVESTIGATION';
  notes: string;
  reviewedAt: string;
}

export interface Result {
  id: string;
  sessionId?: string;
  attemptId?: string;
  attemptNumber?: number;
  assessmentId: string;
  assessmentTitle?: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  candidateRegisterNo?: string;
  score: number;
  totalPoints: number;
  percentage: number;
  status: 'PASSED' | 'FAILED' | 'UNDER_REVIEW' | 'TERMINATED_MALPRACTICE';
  riskScore?: number;
  riskCategory?: RiskCategory;
  warningCount?: number;
  evaluatedAt?: string;
  submittedAt?: string;
}

export type VideoType = 'LIVE' | 'RECORDED';
export type VideoRecordingStatus = 'AVAILABLE' | 'RECORDING' | 'PROCESSING' | 'NOT_AVAILABLE';

export interface TestVideoMetadata {
  id: string;
  testId: string;
  testName: string;
  classId: string;
  className?: string;
  facultyId: string;
  facultyName?: string;
  videoType: VideoType;
  videoId: string;
  videoUrl?: string;
  recordingStatus: VideoRecordingStatus;
  startTime: string;
  endTime?: string;
  studentsCount: number;
  testStatus: AssessmentStatus;
  createdAt: string;
}

export type ScreenRecordingStatus =
  | 'WAITING'
  | 'RECORDING'
  | 'STREAMING'
  | 'PAUSED'
  | 'INTERRUPTED'
  | 'COMPLETED'
  | 'FAILED';

export interface RecordingTimelineEvent {
  id?: string;
  timestamp: string;
  offsetSeconds: number;
  formattedTime?: string;
  type: string;
  description: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'INFO';
}

export interface ScreenRecording {
  recordingId: string;
  assessmentId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  studentRegisterNo?: string;
  startedAt: string;
  endedAt?: string;
  duration: number; // in seconds
  status: ScreenRecordingStatus;
  storageProvider: 'GOOGLE_DRIVE';
  driveFolderId?: string;
  driveFileId?: string;
  chunkCount: number;
  uploadStatus: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PENDING';
  lastUploadedChunk: number;
  streamStatus: 'LIVE' | 'OFFLINE' | 'DISCONNECTED' | 'RECONNECTING' | 'IDLE';
  timelineEvents?: RecordingTimelineEvent[];
  playbackUrl?: string;
  createdAt: string;
  updatedAt: string;
}


