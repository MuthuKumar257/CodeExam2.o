import React, { useState } from 'react';
import { FileCode2, Clock, CheckCircle2, ShieldCheck, Play, Lock, Award, Eye, Key, AlertCircle, EyeOff, X, KeyRound, RotateCcw } from 'lucide-react';
import { Assessment, CandidateSession, Submission } from '../../types';
import {
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  getMaxAllowedAttempts,
  isCandidateSessionCompleted,
  getCandidateSessionMetrics,
} from '../../utils/submissionUtils';

interface CandidateDashboardProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  submissions?: Submission[];
  currentUserId?: string;
  onStartAssessment: (assessmentId: string) => void;
  onViewResults?: (assessmentId: string) => void;
  onOpenPrivacyNotice: () => void;
}

export const CandidateDashboard: React.FC<CandidateDashboardProps> = ({
  assessments,
  sessions,
  submissions = [],
  currentUserId,
  onStartAssessment,
  onViewResults,
  onOpenPrivacyNotice,
}) => {
  const [selectedAsmForPassword, setSelectedAsmForPassword] = useState<Assessment | null>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleStartClick = (asm: Assessment) => {
    if (asm.isPasswordProtected && asm.password) {
      setSelectedAsmForPassword(asm);
      setEnteredPassword('');
      setPasswordError('');
      setShowPassword(false);
    } else {
      onStartAssessment(asm.id);
    }
  };

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsmForPassword) return;

    if (enteredPassword.trim() === selectedAsmForPassword.password?.trim()) {
      const asmId = selectedAsmForPassword.id;
      setSelectedAsmForPassword(null);
      onStartAssessment(asmId);
    } else {
      setPasswordError('Invalid assessment password. Please contact your invigilator or faculty.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header matching Assessment Analytics */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Candidate Portal & Online Proctored Exams</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            My Assessments
          </h1>
          <p className="text-zinc-400 text-sm">
            View assigned coding assessments, complete mandatory environment checks, and start proctored tests.
          </p>
        </div>
        <button
          onClick={onOpenPrivacyNotice}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded text-xs font-semibold bg-[#141417] text-zinc-300 hover:text-white border border-white/10 hover:bg-white/5 cursor-pointer self-start md:self-auto transition"
        >
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          <span>Privacy & Proctoring Terms</span>
        </button>
      </div>

      {/* Assigned Assessments Section */}
      <div className="space-y-4">
        {(() => {
          const uniqueAssessments = Array.from(
            new Map<string, Assessment>(
              assessments.filter((a): a is Assessment => Boolean(a && a.id)).map((a) => [a.id, a])
            ).values()
          );

          return (
            <>
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span className="label-mono">
                  Assigned Assessments ({uniqueAssessments.length})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {uniqueAssessments.map((asm, asmIdx) => {
                  const asmSessions = sessions.filter(
                    (s) => s.assessmentId === asm?.id && (!currentUserId || s.candidateId === currentUserId || s.studentId === currentUserId)
                  );
                  const isSessionCompleted = (s: CandidateSession) => {
                    const st = (s.state || '').toUpperCase();
                    const subSt = ((s as any).submissionStatus || '').toUpperCase();
                    const rawSt = ((s as any).status || '').toUpperCase();
                    const isFinishedState =
                      st === 'SUBMITTED' ||
                      st === 'AUTO_SUBMITTED' ||
                      st === 'TERMINATED_MALPRACTICE' ||
                      st === 'COMPLETED' ||
                      st === 'CLOSED' ||
                      st === 'EXPIRED' ||
                      subSt === 'SUBMITTED' ||
                      subSt === 'AUTO_SUBMITTED' ||
                      subSt === 'TERMINATED_MALPRACTICE' ||
                      subSt === 'COMPLETED' ||
                      subSt === 'CLOSED' ||
                      rawSt === 'CLOSED';
                    const hasCompletionTime = Boolean(s.completedAt || (s as any).submissionTime);
                    return isFinishedState || hasCompletionTime;
                  };

                  const completedSessions = asmSessions.filter((s) => isCandidateSessionCompleted(s) || isSessionCompleted(s));
                  const activeInProgSession = asmSessions.find(
                    (s) =>
                      !isCandidateSessionCompleted(s) &&
                      !isSessionCompleted(s) &&
                      (s.state === 'ACTIVE' || s.state === 'ENVIRONMENT_CHECK' || (s as any).submissionStatus === 'ACTIVE') &&
                      s.state !== 'CLOSED' &&
                      (s as any).status !== 'CLOSED'
                  );
                  const attemptsUsed = completedSessions.length;
                  const maxAllowed = getMaxAllowedAttempts(asm);
                  const hasActiveInProg = Boolean(activeInProgSession);

                  const isAssessmentClosed =
                    asm.status === 'CLOSED' ||
                    asm.status === 'COMPLETED' ||
                    asm.status === 'ARCHIVED' ||
                    (Boolean(asm.endTime) && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED');

                  const matchingCandidateIdentifiers = [
                    currentUserId,
                    ...asmSessions.map((s) => s.candidateId),
                    ...asmSessions.map((s) => (s as any).studentId),
                    ...asmSessions.map((s) => s.candidateEmail),
                  ].filter(Boolean) as string[];

                  let restartPerm: any = undefined;
                  if (asm.restartPermissions) {
                    for (const id of matchingCandidateIdentifiers) {
                      if (asm.restartPermissions[id]?.allowed && !asm.restartPermissions[id]?.consumed) {
                        restartPerm = asm.restartPermissions[id];
                        break;
                      }
                    }
                  }
                  const hasRestartPermission = Boolean(restartPerm && restartPerm.allowed && !restartPerm.consumed);
                  const canRetake =
                    hasRestartPermission ||
                    (!isAssessmentClosed && (hasActiveInProg || attemptsUsed < maxAllowed));

                  // Sort sessions chronologically (prioritize completed, otherwise any attempted session to evaluate marks)
                  const sortedCompleted = [...completedSessions].sort(
                    (a, b) => new Date(a.completedAt || a.startedAt || 0).getTime() - new Date(b.completedAt || b.startedAt || 0).getTime()
                  );
                  const sortedAll = [...asmSessions].sort(
                    (a, b) => new Date(b.completedAt || b.updatedAt || b.startedAt || 0).getTime() - new Date(a.completedAt || a.updatedAt || a.startedAt || 0).getTime()
                  );
                  const latestSession = sortedCompleted.length > 0 ? sortedCompleted[sortedCompleted.length - 1] : (sortedAll[0] || null);

                  // CRITICAL: Use centralized getCandidateSessionMetrics for exact matching score calculation
                  const latestMetrics = latestSession
                    ? getCandidateSessionMetrics(latestSession, submissions, asm, asm.questions)
                    : { score: 0, maxScore: getAssessmentTotalMaxMarks(asm, null, asm.questions), percentage: 0 };

                  const totalPoints = latestMetrics.maxScore;
                  const latestScore = latestMetrics.score;
                  const percentage = latestMetrics.percentage;
                  const canShowResults = asm.showResultsToStudents ?? asm.securitySettings?.showResultsToStudents ?? true;

                  return (
                    <div
                      key={asm.id || `asm-${asmIdx}`}
                      className={`card-variation2 p-6 space-y-4 flex flex-col justify-between ${
                        hasRestartPermission
                          ? 'border-amber-500/50 bg-amber-950/10'
                          : attemptsUsed > 0 && !canRetake
                          ? 'border-emerald-500/30'
                          : ''
                      }`}
                    >
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                      {asm.durationMinutes || 60} Mins • {(asm.questions || []).length} Questions
                    </span>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-indigo-300 border border-white/10 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      Attempts: {attemptsUsed} / {maxAllowed}
                    </span>

                    {hasRestartPermission ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                        <RotateCcw className="w-3 h-3 text-amber-400" /> Restart Allowed by Faculty
                      </span>
                    ) : isAssessmentClosed ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/80 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" /> Closed
                      </span>
                    ) : !canRetake ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" /> Completed ({attemptsUsed}/{maxAllowed})
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {asm.isPasswordProtected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                            <Key className="w-3 h-3 text-indigo-400" /> Protected
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {attemptsUsed > 0 ? 'RETAKE AVAILABLE' : (asm.status || 'ACTIVE')}
                        </span>
                      </div>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-white">{asm.title || 'Untitled Assessment'}</h4>
                  <p className="text-xs text-slate-400 line-clamp-2">{asm.description || ''}</p>

                  {hasRestartPermission && (restartPerm?.facultyNotes || restartPerm?.note) && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300">Faculty Instruction:</span>{' '}
                        <span>{restartPerm.facultyNotes || restartPerm.note}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px]">By {asm.facultyName || 'Faculty'}</span>
                    {(attemptsUsed > 0 || (latestSession && latestScore > 0)) && canShowResults && (
                      <span className="text-[11px] font-bold text-emerald-400 font-mono">
                        {attemptsUsed > 1 ? `Latest Attempt (${attemptsUsed}): ` : attemptsUsed === 0 ? 'Evaluated Marks: ' : 'Score: '}
                        {latestScore}/{totalPoints} ({percentage}%)
                      </span>
                    )}
                  </div>

                  {attemptsUsed > 1 && canShowResults && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/50">
                      <span className="text-slate-500 font-sans text-[10px]">History:</span>
                      {sortedCompleted.map((s, idx) => {
                        const sMetrics = getCandidateSessionMetrics(s, submissions, asm, asm.questions);
                        const sScore = sMetrics.score;
                        const sMax = sMetrics.maxScore;
                        const sPct = sMetrics.percentage;
                        const isLatest = idx === sortedCompleted.length - 1;
                        return (
                          <span
                            key={s.id}
                            className={`px-1.5 py-0.5 rounded border ${
                              isLatest
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-bold'
                                : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
                            }`}
                          >
                            Att #{idx + 1}: {sScore}/{sMax} ({sPct}%)
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {canRetake ? (
                      <button
                        onClick={() => handleStartClick(asm)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-lg ${
                          hasRestartPermission
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                        }`}
                      >
                        {hasRestartPermission ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : asm.isPasswordProtected ? (
                          <KeyRound className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {hasRestartPermission
                            ? 'Start Restarted Assessment'
                            : activeInProgSession
                            ? 'Resume In-Progress Assessment'
                            : attemptsUsed > 0
                            ? `Retake Assessment (Attempt ${attemptsUsed + 1}/${maxAllowed})`
                            : asm.isPasswordProtected
                            ? 'Unlock & Start'
                            : 'Start Assessment'}
                        </span>
                      </button>
                    ) : isAssessmentClosed ? (
                      <span className="text-xs font-semibold text-slate-400 italic flex items-center gap-1.5 py-1">
                        <Lock className="w-3.5 h-3.5 text-slate-500" /> Assessment closed
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 italic">
                        {asm?.allowRetake || maxAllowed === 2
                          ? 'Retake test completed (Allowed only once — 2/2 attempts used)'
                          : `All ${maxAllowed} attempt${maxAllowed === 1 ? '' : 's'} used`}
                      </span>
                    )}

                    {/* View Results button removed as requested */}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  })()}
</div>

      {/* PASSWORD VERIFICATION MODAL */}
      {selectedAsmForPassword && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl relative">
            <button
              onClick={() => setSelectedAsmForPassword(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <KeyRound className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Assessment Password Required</h3>
                <p className="text-xs text-slate-400 line-clamp-1">{selectedAsmForPassword?.title || 'Assessment'}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              This proctored assessment is password protected by <strong>{selectedAsmForPassword?.facultyName || 'Faculty'}</strong>. Please enter the passcode provided by your exam invigilator to unlock.
            </p>

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Enter Access Passcode *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={enteredPassword}
                    onChange={(e) => {
                      setEnteredPassword(e.target.value);
                      setPasswordError('');
                    }}
                    autoFocus
                    placeholder="e.g. CS2026#Pass"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAsmForPassword(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!enteredPassword.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 shadow-lg shadow-indigo-600/30 transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Unlock & Begin Assessment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

