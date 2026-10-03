import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  RefreshCw,
  User,
  GraduationCap,
  Clock,
  Award,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  FileCode2,
  Sparkles,
  Info,
  ShieldAlert,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { Assessment, CandidateSession, User as UserType } from '../../types';
import {
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
} from '../../utils/submissionUtils';

export interface RestartTestOptions {
  mode?: 'RETAKE';
  resetWarnings: boolean;
  customDurationMinutes?: number;
  facultyNotes?: string;
}

interface RestartTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: Assessment | null;
  session: CandidateSession | null;
  candidateUser?: UserType | null;
  onConfirmRestart: (
    assessmentId: string,
    candidateId: string,
    sessionId: string | undefined,
    options: RestartTestOptions
  ) => Promise<void> | void;
}

export const RestartTestModal: React.FC<RestartTestModalProps> = ({
  isOpen,
  onClose,
  assessment,
  session,
  candidateUser,
  onConfirmRestart,
}) => {
  const [resetWarnings, setResetWarnings] = useState<boolean>(true);
  const [customDuration, setCustomDuration] = useState<number>(
    assessment?.durationMinutes || 60
  );
  const [facultyNotes, setFacultyNotes] = useState<string>('Faculty approved test retake (+1 attempt authorization)');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResetWarnings(true);
      setCustomDuration(assessment?.durationMinutes || 60);
      setFacultyNotes('Faculty approved test retake (+1 attempt authorization)');
      setIsSubmitting(false);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, assessment?.durationMinutes]);

  if (!isOpen) return null;

  const resolvedAssessment: Assessment =
    assessment ||
    ({
      id: session?.assessmentId || 'assessment',
      title: session?.assessmentTitle || 'Assessment',
      durationMinutes: 60,
      status: 'ACTIVE',
      questionIds: [],
      questions: [],
    } as unknown as Assessment);

  const studentName = session?.candidateName || candidateUser?.name || 'Student';
  const studentEmail = session?.candidateEmail || candidateUser?.email || 'N/A';
  const studentRegNo =
    session?.candidateRegisterNo ||
    candidateUser?.registerNumber ||
    candidateUser?.registerNo ||
    candidateUser?.id ||
    'REG-ID';

  const currentScore = session
    ? getSessionTotalMarksObtained(session, null, resolvedAssessment, resolvedAssessment.questions)
    : null;
  const totalPoints = getAssessmentTotalMaxMarks(resolvedAssessment, session, resolvedAssessment.questions);
  const warningsCount = session?.warningsCount || 0;
  const isMalpractice =
    session?.state === 'TERMINATED_MALPRACTICE' ||
    Boolean(
      session?.exitReason &&
        (session.exitReason.toLowerCase().includes('malpractice') ||
          session.exitReason.toLowerCase().includes('tab switch') ||
          session.exitReason.toLowerCase().includes('alt+tab'))
    );

  const currentAttemptNumber = session?.attemptNumber || 1;
  const nextAttemptNumber = currentAttemptNumber + 1;

  const handleSubmit = async () => {
    const candidateId =
      session?.candidateId ||
      (session as any)?.studentId ||
      candidateUser?.id ||
      session?.candidateEmail ||
      '';

    if (!candidateId) {
      setErrorMessage('Could not identify candidate ID to grant retake attempt.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirmRestart(resolvedAssessment.id, candidateId, session?.id, {
        mode: 'RETAKE',
        resetWarnings,
        customDurationMinutes: Number(customDuration) || resolvedAssessment.durationMinutes || 60,
        facultyNotes: facultyNotes.trim() || undefined,
      });

      setSuccessMessage(
        `Additional attempt granted successfully for ${studentName}! The student can now start Attempt #${nextAttemptNumber}.`
      );

      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(null);
        onClose();
      }, 1400);
    } catch (err: any) {
      console.error('Failed to restart test for student:', err);
      setErrorMessage(err?.message || 'Failed to grant retake attempt. Please check permissions and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Grant Extra Attempt (+1 Retake)
              </h2>
              <p className="text-xs text-slate-400">
                Authorize an additional attempt for this student while keeping past scores intact.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs text-slate-300">
          {/* Student & Assessment Context Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-bold text-sm uppercase">
                  {studentName.slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{studentName}</span>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                      {studentRegNo}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">{studentEmail}</p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                  isMalpractice
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    : session?.state === 'SUBMITTED' || session?.state === 'AUTO_SUBMITTED'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}
              >
                {session?.state?.replace(/_/g, ' ') || 'SUBMITTED'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block text-[10px]">Assessment</span>
                <span className="font-medium text-white line-clamp-1">{assessment?.title || resolvedAssessment.title}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Current Attempt Score</span>
                <span className="font-bold text-white font-mono">
                  {currentScore !== null ? `${currentScore} / ${totalPoints}` : 'N/A'} (Att #{currentAttemptNumber})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Proctor Warnings</span>
                <span className={`font-bold font-mono ${warningsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {warningsCount} logged
                </span>
              </div>
            </div>

            {session?.exitReason && (
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
                <span className="text-slate-500">Exit / Submission Reason:</span> {session.exitReason}
              </div>
            )}
          </div>

          {/* Section 1: Attempt Information Card */}
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/25 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <span>Unlocking Attempt #{nextAttemptNumber}</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/30">
                +1 Attempt
              </span>
            </div>
            <p className="text-[11px] text-indigo-200/90 leading-relaxed">
              This unlocks <strong>Attempt #{nextAttemptNumber}</strong> for <strong>{studentName}</strong> while preserving all past attempt records and grades in the gradebook and history. Previous submissions are NOT deleted.
            </p>
          </div>

          {/* Section 2: Configuration & Parameters */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Retake Parameters</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Attempt Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Original test duration: {assessment?.durationMinutes || 60} mins
                </span>
              </div>

              <div className="flex flex-col justify-center space-y-2 pt-1 sm:pt-4">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetWarnings}
                    onChange={(e) => setResetWarnings(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-white block">Reset Warnings for New Attempt</span>
                    <span className="text-[10px] text-slate-500">Starts Attempt #{nextAttemptNumber} with 0 warning infractions</span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Faculty Note / Reason for Granting Retake
              </label>
              <input
                type="text"
                value={facultyNotes}
                onChange={(e) => setFacultyNotes(e.target.value)}
                placeholder="e.g. Technical glitch override, faculty approved re-attempt"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500"
              />
            </div>
          </div>

          {/* Info Banner */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-300">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Upon confirming, when <strong>{studentName}</strong> visits their Candidate Portal or opens this assessment, they will immediately see <strong>Start Attempt #{nextAttemptNumber}</strong> available.
            </span>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Granting Attempt...</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4" />
                <span>Grant +1 Retake Attempt</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
