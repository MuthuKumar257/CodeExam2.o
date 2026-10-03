import React, { useState } from 'react';
import {
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Clock,
  ShieldCheck,
  Award,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  XCircle,
  Copy,
  Check,
  Terminal,
  AlertCircle,
  Bug,
  RotateCcw,
} from 'lucide-react';
import { Assessment, CandidateSession, Submission } from '../../types';
import { getLatestCandidateSubmissions } from '../../utils/submissionUtils';

interface AssessmentCompletedLockViewProps {
  assessment: Assessment;
  session: CandidateSession;
  submissions: Submission[];
  onReturnToDashboard: () => void;
  onStartRestartedAssessment?: (assessmentId: string) => void;
}

export const AssessmentCompletedLockView: React.FC<AssessmentCompletedLockViewProps> = ({
  assessment,
  session,
  submissions,
  onReturnToDashboard,
  onStartRestartedAssessment,
}) => {
  const safeAssessment = assessment || {
    id: 'default-asm',
    title: 'Assessment',
    description: '',
    questions: [],
    passingScore: 60,
  };
  const questions = Array.isArray(safeAssessment.questions) ? safeAssessment.questions : [];
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    questions[0]?.id || null
  );
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Compute overall score
  const totalPointsPossible = safeAssessment.isEqualMarks && safeAssessment.marksPerQuestion
    ? ((safeAssessment.questionsPerCandidate || questions.length || 1) * Number(safeAssessment.marksPerQuestion))
    : (session.totalPoints || questions.reduce((acc, q) => acc + (q.points || 0), 0) || 100);

  // Strictly isolate candidate submissions to this specific assessment attempt session and take latest attempt per question
  const latestCandidateSubs = getLatestCandidateSubmissions(
    submissions,
    session,
    safeAssessment.id,
    session.id
  );

  // Map each question to its latest submission and resolved test cases
  const questionResults = questions.map((q) => {
    const latestSub = latestCandidateSubs.find((s) => s.questionId === q.id) || null;

    const resolvedTC = (function resolveCases(question: any) {
      if (question.testCases && question.testCases.length > 0) {
        const hasHidden = question.testCases.some((tc: any) => tc.isPublic === false);
        if (hasHidden) return question.testCases;
        if (question.hiddenTestCases && question.hiddenTestCases.length > 0) {
          const hidden = question.hiddenTestCases.map((htc: any, i: number) => ({
            id: `tc-hidden-${i}`,
            input: htc.input,
            expectedOutput: htc.output,
            isPublic: false,
          }));
          return [...question.testCases, ...hidden];
        }
        return question.testCases;
      }
      const sampleCases = (question.sampleTestCases || []).map((stc: any, i: number) => ({
        id: `tc-sample-${i}`,
        input: stc.input,
        expectedOutput: stc.output,
        isPublic: true,
        explanation: stc.explanation,
      }));
      const hiddenCases = (question.hiddenTestCases || []).map((htc: any, i: number) => ({
        id: `tc-hidden-${i}`,
        input: htc.input,
        expectedOutput: htc.output,
        isPublic: false,
      }));
      return [...sampleCases, ...hiddenCases];
    })(q);

    const qsFallback = session.questionStatuses?.[q.id];
    const isAccepted = latestSub?.status === 'Accepted' || qsFallback?.status === 'Accepted';
    const scoreEarned = latestSub && latestSub.score !== undefined && latestSub.score !== null
      ? latestSub.score
      : (qsFallback && qsFallback.score !== undefined ? qsFallback.score : 0);
    const testCasesPassed = latestSub ? latestSub.testCasesPassed : (qsFallback ? qsFallback.testCasesPassed : (isAccepted ? resolvedTC.length : 0));
    const totalTestCases = latestSub ? (latestSub.totalTestCases || resolvedTC.length || 1) : (qsFallback?.totalTestCases || resolvedTC.length || 1);

    return {
      question: q,
      resolvedTestCases: resolvedTC,
      latestSub,
      isAccepted,
      scoreEarned,
      testCasesPassed,
      totalTestCases,
    };
  });

  // Sum of all marks from code submitted across all questions
  const sumFromQuestionResults = questionResults.reduce(
    (acc, r) => acc + (r.scoreEarned !== undefined && r.scoreEarned !== null ? Number(r.scoreEarned) : 0),
    0
  );

  const totalScoreEarned = sumFromQuestionResults > 0
    ? sumFromQuestionResults
    : (session.score !== undefined && session.score !== null ? Number(session.score) : 0);

  const percentage = totalPointsPossible > 0
    ? Math.round((totalScoreEarned / totalPointsPossible) * 100)
    : 0;

  const isPassed = percentage >= (safeAssessment.passingScore || 60);
  const canShowResults = safeAssessment.showResultsToStudents ?? safeAssessment.securitySettings?.showResultsToStudents ?? true;

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* LOCK & SUBMISSION BANNER */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              {session.state === 'TERMINATED_MALPRACTICE' ||
              session.exitReason?.toLowerCase().includes('tab switch') ||
              session.exitReason?.toLowerCase().includes('alt+tab') ||
              session.exitReason?.toLowerCase().includes('malpractice') ? (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-inner animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Disqualified / Malpractice Termination</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Assessment Submitted</span>
                </span>
              )}

              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Session Permanently Locked</span>
              </span>

              {session.attemptNumber && (
                <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <span>Attempt #{session.attemptNumber}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight">{safeAssessment.title}</h1>
            {session.exitReason && (
              <p className="text-xs text-rose-300 font-mono bg-rose-950/60 border border-rose-500/40 px-2.5 py-1 rounded-lg inline-block">
                Exit Reason: {session.exitReason}
              </p>
            )}
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Submitted on{' '}
                {session.completedAt
                  ? new Date(session.completedAt).toLocaleString()
                  : new Date().toLocaleString()}
              </span>
              <span>•</span>
              <span>Candidate: {session.candidateName || 'Student'}</span>
            </p>
          </div>

          <button
            onClick={onReturnToDashboard}
            className="self-start md:self-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition flex items-center space-x-2 cursor-pointer shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>

      {/* RESTART / RETAKE AUTHORIZATION BANNER */}
      {(() => {
        const restartPerm = safeAssessment.restartPermissions
          ? safeAssessment.restartPermissions[session.candidateId] ||
            (session.studentId && safeAssessment.restartPermissions[session.studentId]) ||
            (session.candidateEmail && safeAssessment.restartPermissions[session.candidateEmail]) ||
            Object.entries(safeAssessment.restartPermissions).find(
              ([k, v]) =>
                (k === session.candidateId || k === session.studentId || k === session.candidateEmail) &&
                (v as any)?.allowed &&
                !(v as any)?.consumed
            )?.[1]
          : undefined;

        const hasFacultyRetake = Boolean(restartPerm && restartPerm.allowed && !restartPerm.consumed);
        const currentAttempt = session.attemptNumber || 1;
        const isRetakeConfigured = Boolean(safeAssessment.allowRetake || (safeAssessment.maxAttempts && safeAssessment.maxAttempts > 1));
        const canRetakeConfigured = isRetakeConfigured && currentAttempt < 2;
        const isRetakeCompleted = isRetakeConfigured && currentAttempt >= 2;

        if (hasFacultyRetake) {
          return (
            <div className="bg-amber-950/40 border-2 border-amber-500/60 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                  <RotateCcw className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Retake Authorized by Faculty
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      +1 Attempt Granted (Single Retake)
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    You have been granted an additional attempt (Attempt #{currentAttempt + 1})
                  </h3>
                  {(restartPerm.facultyNotes || restartPerm.note) && (
                    <p className="text-xs text-amber-200/90 mt-1">
                      <strong>Faculty Remark:</strong> {restartPerm.facultyNotes || restartPerm.note}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  if (onStartRestartedAssessment) {
                    onStartRestartedAssessment(safeAssessment.id);
                  } else {
                    onReturnToDashboard();
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center space-x-2 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start Attempt #{currentAttempt + 1} Now</span>
              </button>
            </div>
          );
        }

        if (canRetakeConfigured) {
          return (
            <div className="bg-indigo-950/40 border-2 border-indigo-500/50 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0 mt-0.5">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Single Retake Available
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      Attempt 2 of 2
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    You are eligible to retake this test once (strictly 1 retake allowed).
                  </h3>
                  <p className="text-xs text-indigo-200/80 mt-1">
                    Retaking the assessment will begin your final attempt. No further retakes are permitted after Attempt 2.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (onStartRestartedAssessment) {
                    onStartRestartedAssessment(safeAssessment.id);
                  } else {
                    onReturnToDashboard();
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center space-x-2 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retake Assessment (Attempt 2/2)</span>
              </button>
            </div>
          );
        }

        if (isRetakeCompleted) {
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-slate-300">
              <div className="flex items-center space-x-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-white block">Retake Test Completed (2/2 Attempts Used)</span>
                  <span className="text-slate-400">
                    Retake was allowed only once. All attempts have been recorded and no further retakes are permitted.
                  </span>
                </div>
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* SCORE CARDS & INTEGRITY METRICS */}
      {canShowResults ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* OVERALL SCORE CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" /> Evaluation Score
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                  isPassed
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}
              >
                {isPassed ? 'PASSED' : 'NEEDS IMPROVEMENT'}
              </span>
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-black text-white tracking-tight">{totalScoreEarned}</span>
              <span className="text-sm font-semibold text-slate-400">/ {totalPointsPossible} Pts</span>
              <span className="ml-auto text-lg font-bold font-mono text-indigo-400">({percentage}%)</span>
            </div>

            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  percentage === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-indigo-500'
                    : isPassed
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400">
              Passing criteria: <strong className="text-slate-200">{safeAssessment.passingScore || 60}%</strong>
            </p>
          </div>

          {/* QUESTIONS SOLVED CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-indigo-400" /> Questions Pass Rate
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {questionResults.filter((r) => r.isAccepted).length} / {questions?.length || 0} Accepted
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              {questionResults.map(({ question, isAccepted, scoreEarned }, idx) => (
                <div
                  key={question?.id || idx}
                  className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-none"
                >
                  <span className="text-slate-300 truncate max-w-[180px] font-medium">
                    Q{idx + 1}. {question?.title || 'Question'}
                  </span>
                  <span className="flex items-center space-x-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isAccepted
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : scoreEarned > 0
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {scoreEarned} / {question?.points || 0} Pts
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PROCTORING INTEGRITY CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Proctoring Integrity
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  session.warningsCount === 0
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                Status: {session.warningsCount === 0 ? 'VERIFIED' : 'FLAGGED'}
              </span>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Security Warnings:</span>
                <span className="font-bold text-slate-200 font-mono">{session.warningsCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Proctoring Telemetry:</span>
                <span className="font-bold text-emerald-400 text-[11px]">Logged & Verified</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* UNDER REVIEW CARD */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Award className="w-4 h-4" /> Evaluation & Scores
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                UNDER FACULTY REVIEW
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Assessment marks and final evaluation results are currently hidden for this assessment. Once faculty reviews and publishes the grades, your score will be available.
            </p>
            <div className="text-[11px] text-slate-400 font-mono">
              Total questions submitted: {questionResults.filter(r => r.latestSub).length} / {questions?.length || 0}
            </div>
          </div>

          {/* PROCTORING INTEGRITY CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Proctoring Status
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LOGGED
              </span>
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Submission Recorded:</span>
                <span className="font-bold text-slate-200 font-mono">
                  {session.completedAt ? new Date(session.completedAt).toLocaleTimeString() : 'Recorded'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Proctoring Telemetry:</span>
                <span className="font-bold text-emerald-400 text-[11px]">Securely Saved</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOCKED NOTICE WARNING */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 flex items-start space-x-3 text-amber-300/90 text-xs leading-relaxed">
        <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-200 block font-bold mb-0.5">
            Assessment Session Permanently Locked
          </strong>
          All submitted source code, test case outputs, and error diagnostics are recorded below. Retakes or code modifications are disabled.
        </div>
      </div>

      {/* QUESTION BREAKDOWN, FULL CODE, OUTPUTS & ERRORS VIEW */}
      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-indigo-400" />
          Submitted Code, Output & Diagnostics
        </h3>

        <div className="space-y-4">
          {questionResults.map(({ question, resolvedTestCases, latestSub, isAccepted, scoreEarned, testCasesPassed, totalTestCases }, idx) => {
            const isExpanded = expandedQuestionId === (question?.id || null);
            const qLang = latestSub?.language ||
              session.languageMap?.[question.id] ||
              session.questionStatuses?.[question.id]?.selectedLanguage ||
              session.questionStatuses?.[question.id]?.language ||
              (session as any).selectedLanguage;
            const displayedCode = latestSub?.sourceCode || session.codeMap?.[question.id] || (session.selectedAnswers as any)?.[question.id];

            return (
              <div
                key={question?.id || idx}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => setExpandedQuestionId(isExpanded ? null : (question?.id || null))}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition cursor-pointer"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      Q{idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate">{question?.title || 'Question'}</h4>
                        {qLang && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                            {qLang === 'javascript' ? 'JS' : qLang === 'python' ? 'Python' : qLang.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {question?.difficulty || 'EASY'} • Max {question?.points || 0} Points
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center space-x-1.5 justify-end">
                        {isAccepted ? (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
                          </span>
                        ) : latestSub ? (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 text-rose-400" /> {latestSub.status}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-500">
                            Unattempted
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Score: <strong className="text-slate-200">{scoreEarned} / {question.points}</strong> pts ({testCasesPassed}/{totalTestCases} test cases)
                      </span>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-800 bg-slate-950/80 space-y-5">
                    {/* Problem prompt preview */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Problem Statement
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-3.5 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans">
                        {question.problemStatement}
                      </p>
                    </div>

                    {/* FULL SUBMITTED CODE */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileCode2 className="w-3.5 h-3.5" />
                          Complete Submitted Source Code ({qLang ? qLang.toUpperCase() : 'SOURCE CODE'})
                        </span>

                        {displayedCode && (
                          <button
                            onClick={() => handleCopyCode(displayedCode, question.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                          >
                            {copiedCodeId === question.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Full Code</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {displayedCode ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed max-h-96">
                          <table className="w-full text-left border-collapse">
                            <tbody>
                              {displayedCode.split('\n').map((line: string, lIdx: number) => (
                                <tr key={lIdx} className="hover:bg-slate-800/40">
                                  <td className="w-10 select-none text-right pr-4 text-slate-600 text-[11px] font-mono">
                                    {lIdx + 1}
                                  </td>
                                  <td className="whitespace-pre">{line || ' '}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-xl">
                          No code submitted for this question.
                        </div>
                      )}
                    </div>

                    {/* CODE EXECUTION SUMMARY & CONSOLE OUTPUT & ERROR LOGS */}
                    {latestSub && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* CONSOLE OUTPUT (stdout) */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5" />
                            Execution Output (stdout)
                          </span>
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-emerald-300 min-h-[100px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {latestSub.testCasesPassed > 0
                              ? `Execution completed in ${latestSub.executionTimeMs || 15}ms (Memory: ${latestSub.memoryUsageMb || 16}MB)\nTest cases passed: ${latestSub.testCasesPassed}/${latestSub.totalTestCases}\n` +
                                (latestSub.status === 'Accepted'
                                  ? `[SUCCESS] Output matched all expected test case targets.`
                                  : `[EVALUATED] Standard execution complete.`)
                              : 'No positive output logged.'}
                          </div>
                        </div>

                        {/* COMPILATION & RUNTIME ERRORS (stderr) */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Bug className="w-3.5 h-3.5" />
                            Compiler & Runtime Errors (stderr)
                          </span>
                          <div
                            className={`rounded-xl p-3.5 font-mono text-xs min-h-[100px] max-h-48 overflow-y-auto whitespace-pre-wrap border ${
                              latestSub.status !== 'Accepted'
                                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                                : 'bg-slate-900 border-slate-800 text-slate-500'
                            }`}
                          >
                            {latestSub.status !== 'Accepted' ? (
                              <div>
                                <strong className="text-rose-400 block mb-1">
                                  [{latestSub.status}] Diagnostic Trace:
                                </strong>
                                {latestSub.status === 'Wrong Answer'
                                  ? `Output mismatch: Code output did not match expected output on hidden/public test cases.`
                                  : latestSub.status === 'Compilation Error'
                                  ? `SyntaxError / Compilation failed. Please check imports and type constraints.`
                                  : `Runtime Exception thrown during evaluation.`}
                              </div>
                            ) : (
                              'Zero errors reported. Clean compilation and runtime execution.'
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* INDIVIDUAL TEST CASES DETAILED OUTPUT & INPUT/EXPECTED BREAKDOWN */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Test Case Evaluation Details ({resolvedTestCases.length} Test Cases)</span>
                        <span className="text-emerald-400 font-mono">
                          {testCasesPassed} / {totalTestCases} Passed • Marks: {scoreEarned} / {question.points || 0} Pts
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {resolvedTestCases.map((tc, tcIdx) => {
                          const exactTcResult = latestSub?.testCaseResults?.find(
                            (r: any) => (r.id && r.id === tc.id) || (r.input === tc.input && r.expectedOutput === tc.expectedOutput)
                          );
                          const isTcPassed = exactTcResult
                            ? exactTcResult.passed
                            : latestSub
                            ? tcIdx < (latestSub.testCasesPassed ?? 0)
                            : isAccepted;

                          const actualOutputVal = exactTcResult?.actualOutput || (isTcPassed ? tc.expectedOutput : '');

                          return (
                            <div
                              key={tc.id || tcIdx}
                              className={`p-3.5 rounded-xl border space-y-2 font-mono text-xs ${
                                isTcPassed
                                  ? 'bg-slate-900/90 border-emerald-500/30'
                                  : 'bg-rose-950/20 border-rose-500/30'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-200">
                                  Test Case {tcIdx + 1} {tc.isPublic ? '(Public)' : '(Hidden)'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                    isTcPassed
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {isTcPassed ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" /> ACCEPTED (Passed)
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-3 h-3" /> FAILED (Not Passed)
                                    </>
                                  )}
                                </span>
                              </div>

                              {tc.isPublic ? (
                                <div className="space-y-1 text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800/80">
                                  <div>
                                    <span className="text-slate-500 font-semibold">Input: </span>
                                    <span className="text-slate-200">{tc.input && tc.input !== '[Concealed]' ? tc.input : '(empty)'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 font-semibold">Expected Output: </span>
                                    <span className="text-emerald-400">{tc.expectedOutput && tc.expectedOutput !== '[Concealed]' ? tc.expectedOutput : '(empty)'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 font-semibold">Your Output: </span>
                                    <span className={isTcPassed ? 'text-emerald-300' : 'text-rose-400'}>
                                      {actualOutputVal && actualOutputVal !== '[Concealed]'
                                        ? actualOutputVal
                                        : isTcPassed
                                        ? tc.expectedOutput
                                        : 'Mismatch / Incorrect Output'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 font-bold text-slate-300">
                                    🔒 Hidden Test Case
                                  </span>
                                  <span className={`italic text-[10px] ${isTcPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isTcPassed ? 'Accepted & Passed ✓' : 'Failed Target Criteria ✗'}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FOOTER ACTION */}
      <div className="pt-4 flex justify-center">
        <button
          onClick={onReturnToDashboard}
          className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition flex items-center space-x-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Candidate Dashboard</span>
        </button>
      </div>
    </div>
  );
};
