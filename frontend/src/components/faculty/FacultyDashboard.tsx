import React, { useState } from 'react';
import { Video, PlusCircle, CheckCircle, Key, Unlock, Trash2, Loader2, PlayCircle, Users, Edit3, FileCheck2, ArrowRightLeft, Lock, Play } from 'lucide-react';
import { Assessment, CandidateSession, Classroom, Question, Result, Submission, User } from '../../types';
import { StudentRankingView } from '../common/StudentRankingView';
import { ReassignAssessmentModal } from './ReassignAssessmentModal';

interface FacultyDashboardProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  users?: User[];
  classes?: Classroom[];
  submissions?: Submission[];
  questions?: Question[];
  results?: Result[];
  onCreateAssessmentTrigger: () => void;
  onEditAssessment?: (asm: Assessment) => void;
  onNavigateSubNav: (nav: string) => void;
  onInspectCandidate: (sessionId: string) => void;
  onDeleteAssessment?: (asmId: string) => Promise<void> | void;
  onUpdateAssessment?: (asm: Assessment) => Promise<void> | void;
  onCreateAssessment?: (asm: Assessment) => Promise<void> | void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({
  assessments,
  sessions,
  users = [],
  classes = [],
  submissions = [],
  questions = [],
  results = [],
  onCreateAssessmentTrigger,
  onEditAssessment,
  onNavigateSubNav,
  onInspectCandidate,
  onDeleteAssessment,
  onUpdateAssessment,
  onCreateAssessment,
}) => {
  const [deletingAsmId, setDeletingAsmId] = useState<string | null>(null);
  const [reassignTargetAsm, setReassignTargetAsm] = useState<Assessment | null>(null);

  const handleDeleteAssessmentClick = async (asm: Assessment) => {
    if (!onDeleteAssessment) return;
    if (window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      setDeletingAsmId(asm.id);
      try {
        await onDeleteAssessment(asm.id);
      } catch (err) {
        console.error('Failed to delete assessment:', err);
      } finally {
        setDeletingAsmId(null);
      }
    }
  };

  const handleReassignSave = async (updatedAsm: Assessment, isNewCopy?: boolean) => {
    try {
      if (isNewCopy && onCreateAssessment) {
        await onCreateAssessment(updatedAsm);
      } else if (onUpdateAssessment) {
        await onUpdateAssessment(updatedAsm);
      }
    } catch (err) {
      console.error('Failed to reassign assessment in dashboard:', err);
    }
  };

  const handleToggleCloseAssessment = async (asm: Assessment) => {
    if (!onUpdateAssessment) return;
    const isPastEnd = asm.endTime && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED';
    const effectiveStatus = (asm.status === 'ACTIVE' && isPastEnd) ? 'CLOSED' : (asm.status || 'ACTIVE');
    const isCurrentlyActive = effectiveStatus === 'ACTIVE';
    const nextStatus = isCurrentlyActive ? 'CLOSED' : 'ACTIVE';
    try {
      await onUpdateAssessment({
        ...asm,
        status: nextStatus as any,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to toggle assessment status:', err);
    }
  };
  // Real live ongoing candidate sessions for faculty's assessments
  const liveActiveCount = sessions.filter((s) => {
    const st = (s.state || (s as any).submissionStatus || '').toUpperCase();
    const rawStatus = ((s as any).status || '').toUpperCase();
    const isClosedOrFinished =
      st === 'ENDED' ||
      rawStatus === 'ENDED' ||
      st === 'SUBMITTED' ||
      st === 'AUTO_SUBMITTED' ||
      st === 'TERMINATED_MALPRACTICE' ||
      st === 'COMPLETED' ||
      st === 'CLOSED' ||
      st === 'EXPIRED' ||
      st === 'DISCONNECTED' ||
      rawStatus === 'CLOSED' ||
      s.isActive === false ||
      s.isLive === false ||
      s.connectionStatus === 'DISCONNECTED' ||
      Boolean(s.endedAt) ||
      Boolean(s.completedAt);

    if (isClosedOrFinished) return false;
    if (s.state !== 'ACTIVE' && s.state !== 'IN_PROGRESS' && s.state !== 'ENVIRONMENT_CHECK') return false;

    // Check if the assessment itself is closed
    const asm = assessments.find((a) => a.id === s.assessmentId);
    if (!asm) return false;
    if (asm.status === 'CLOSED' || asm.status === 'COMPLETED' || asm.status === 'ARCHIVED') return false;
    if (asm.endTime && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED') return false;

    return true;
  }).length;

  const submittedCount = sessions.filter(
    (s) =>
      (s.state === 'SUBMITTED' ||
        s.state === 'AUTO_SUBMITTED' ||
        s.state === 'COMPLETED' ||
        s.state === 'CLOSED' ||
        s.state === 'ENDED' ||
        (s as any).status === 'CLOSED' ||
        (s as any).status === 'ENDED' ||
        s.isActive === false ||
        Boolean(s.endedAt) ||
        (s as any).submissionStatus === 'SUBMITTED' ||
        (s as any).submissionStatus === 'COMPLETED' ||
        Boolean(s.completedAt)) &&
      assessments.some((a) => a.id === s.assessmentId)
  ).length;

  const candidateCount =
    users.filter((u) => u.role === 'CANDIDATE').length ||
    new Set(sessions.filter((s) => assessments.some((a) => a.id === s.assessmentId)).map((s) => s.candidateId)).size;

  return (
    <div className="p-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Faculty Proctoring Control Center</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Overview & Dashboard
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage coding assessments, question banks, candidate invitations, and real-time live monitoring.
          </p>
        </div>
        <button
          onClick={onCreateAssessmentTrigger}
          className="flex items-center space-x-2 px-4 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create New Assessment</span>
        </button>
      </div>

      {/* Dashboard KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Active Live</span>
            <PlayCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{liveActiveCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">
            {liveActiveCount === 1 ? '1 active candidate' : `${liveActiveCount} ongoing sessions`}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Submitted</span>
            <CheckCircle className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{submittedCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">Submitted sessions</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Candidates</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{candidateCount}</div>
          <div className="text-[10px] text-slate-400 mt-1">Enrolled students</div>
        </div>
      </div>

      {/* Assessment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">My Managed Assessments</h3>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onNavigateSubNav('faculty_assessments')}
              className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>View All Assessment Details</span>
            </button>
            <button
              onClick={() => onNavigateSubNav('faculty_live')}
              className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <Video className="w-4 h-4" />
              <span>Open Live Monitoring Grid</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Assessment Name</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Passcode Security</th>
                <th className="p-3">Candidates</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {Array.from(
                new Map<string, Assessment>(
                  assessments.filter((a): a is Assessment => Boolean(a && a.id)).map((a) => [a.id, a])
                ).values()
              ).map((asm) => {
                const isPastEnd = asm.endTime && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED';
                const effectiveStatus = (asm.status === 'ACTIVE' && isPastEnd) ? 'CLOSED' : (asm.status || 'ACTIVE');
                const isClosedOrDone = effectiveStatus === 'CLOSED' || effectiveStatus === 'COMPLETED' || effectiveStatus === 'ARCHIVED';

                return (
                  <tr key={asm.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-white">{asm?.title || 'Untitled Assessment'}</td>
                    <td className="p-3 font-mono">{asm.durationMinutes} mins</td>
                    <td className="p-3 font-mono">
                      {asm.isPasswordProtected && asm.password ? (
                        <span className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 w-fit font-bold">
                          <Key className="w-3 h-3 text-indigo-400" /> {asm.password}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700/60 flex items-center gap-1.5 w-fit">
                          <Unlock className="w-3 h-3 text-slate-500" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="p-3">{asm.candidateIds.length} Enrolled</td>
                    <td className="p-3">
                      {effectiveStatus === 'ACTIVE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          ACTIVE
                        </span>
                      ) : isClosedOrDone ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/80 flex items-center gap-1 w-fit">
                          CLOSED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit">
                          {effectiveStatus}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center space-x-2">
                        {onUpdateAssessment && (
                          <button
                            onClick={() => handleToggleCloseAssessment(asm)}
                            className={`p-1.5 rounded border transition cursor-pointer ${
                              effectiveStatus === 'ACTIVE'
                                ? 'bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 border-rose-500/20'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/20'
                            }`}
                            title={effectiveStatus === 'ACTIVE' ? 'Close Assessment (Prevent Starts)' : 'Reopen / Activate Assessment'}
                          >
                            {effectiveStatus === 'ACTIVE' ? (
                              <Lock className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => onNavigateSubNav('faculty_history')}
                          className="px-3 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-semibold text-[11px] transition cursor-pointer"
                        >
                          {effectiveStatus === 'ACTIVE' ? 'Watch Live' : 'Watch Video / History'}
                        </button>
                      <button
                        onClick={() => setReassignTargetAsm(asm)}
                        className="p-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/20 transition cursor-pointer"
                        title="Reassign to Same or Different Class"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                      {onEditAssessment && (
                        <button
                          onClick={() => onEditAssessment(asm)}
                          className="p-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/20 transition cursor-pointer"
                          title="Edit Assessment Details & Questions"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteAssessment && (
                        <button
                          onClick={() => handleDeleteAssessmentClick(asm)}
                          disabled={deletingAsmId === asm.id}
                          className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 border border-rose-500/20 transition cursor-pointer disabled:opacity-50"
                          title="Delete Assessment"
                        >
                          {deletingAsmId === asm.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Ranking Leaderboard Section (Class-wise & Overall) */}
      {users.length > 0 && (
        <StudentRankingView
          users={users}
          classes={classes}
          assessments={assessments}
          sessions={sessions}
          submissions={submissions}
          questions={questions}
          results={results}
          onInspectCandidate={onInspectCandidate}
        />
      )}

      {/* REASSIGN ASSESSMENT MODAL */}
      <ReassignAssessmentModal
        assessment={reassignTargetAsm}
        classes={classes}
        users={users}
        isOpen={Boolean(reassignTargetAsm)}
        onClose={() => setReassignTargetAsm(null)}
        onReassign={handleReassignSave}
        onOpenFullEditor={onEditAssessment}
      />
    </div>
  );
};
