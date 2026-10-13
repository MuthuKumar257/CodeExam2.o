import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCode2,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Play,
  Lock,
  Award,
  Eye,
  Key,
  AlertCircle,
  EyeOff,
  X,
  KeyRound,
  RotateCcw,
  User as UserIcon,
  GraduationCap,
  Building2,
  Search,
  Filter,
  BookOpen,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Trophy,
  History,
  FileText,
  Video,
  Monitor,
} from 'lucide-react';
import { Assessment, CandidateSession, Submission, Question, User } from '../../types';
import { UserAvatar } from '../common/UserAvatar';
import {
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  getMaxAllowedAttempts,
  isCandidateSessionCompleted,
  getCandidateSessionMetrics,
} from '../../utils/submissionUtils';

export interface CandidateDashboardProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  submissions?: Submission[];
  questions?: Question[];
  currentUser?: User | null;
  currentUserId?: string;
  onStartAssessment: (assessmentId: string) => void;
  onViewResults?: (assessmentId: string) => void;
  onOpenPrivacyNotice: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const CandidateDashboard: React.FC<CandidateDashboardProps> = ({
  assessments = [],
  sessions = [],
  submissions = [],
  questions = [],
  currentUser = null,
  currentUserId,
  onStartAssessment,
  onViewResults,
  onOpenPrivacyNotice,
  onNavigateToTab,
}) => {
  const [selectedAsmForPassword, setSelectedAsmForPassword] = useState<Assessment | null>(null);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'AVAILABLE' | 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Clean, high-precision 1-second interval to dynamically enable scheduled assessments
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return '00s';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  const effectiveUserId = currentUserId || currentUser?.id || currentUser?.uid;

  // Deduplicate and sanitize assessments list
  const uniqueAssessments = useMemo(() => {
    return Array.from(
      new Map<string, Assessment>(
        (assessments || [])
          .filter((a): a is Assessment => Boolean(a && a.id))
          .map((a) => [a.id, a])
      ).values()
    );
  }, [assessments]);

  // Helper to check if a session is concluded
  const isSessionFinished = (s: CandidateSession): boolean => {
    if (isCandidateSessionCompleted(s)) return true;
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
    return isFinishedState || Boolean(s.completedAt || (s as any).submissionTime);
  };

  // Precompute metrics and state for every assessment
  const assessmentMetaMap = useMemo(() => {
    const map = new Map<string, {
      asmSessions: CandidateSession[];
      completedSessions: CandidateSession[];
      activeInProgSession: CandidateSession | null;
      attemptsUsed: number;
      maxAllowed: number;
      isUpcoming: boolean;
      secondsUntilStart: number;
      startMs: number;
      endMs: number;
      isAssessmentClosed: boolean;
      hasRestartPermission: boolean;
      restartPerm: any;
      canRetake: boolean;
      latestSession: CandidateSession | null;
      latestScore: number;
      totalPoints: number;
      percentage: number;
      canShowResults: boolean;
      statusCategory: 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
    }>();

    uniqueAssessments.forEach((asm) => {
      const asmSessions = (sessions || []).filter(
        (s) =>
          s.assessmentId === asm.id &&
          (!effectiveUserId ||
            s.candidateId === effectiveUserId ||
            (s as any).studentId === effectiveUserId ||
            (currentUser?.email && s.candidateEmail?.toLowerCase() === currentUser.email.toLowerCase()))
      );

      const completedSessions = asmSessions.filter(isSessionFinished);
      const activeInProgSession = asmSessions.find(
        (s) =>
          !isSessionFinished(s) &&
          (s.state === 'ACTIVE' || s.state === 'ENVIRONMENT_CHECK' || (s as any).submissionStatus === 'ACTIVE') &&
          s.state !== 'CLOSED' &&
          (s as any).status !== 'CLOSED'
      ) || null;

      const attemptsUsed = completedSessions.length;
      const maxAllowed = getMaxAllowedAttempts(asm);
      const hasActiveInProg = Boolean(activeInProgSession);

      const startMs = asm.startTime
        ? new Date(asm.startTime).getTime()
        : (asm.start_time ? new Date(asm.start_time).getTime() : 0);
      const endMs = asm.endTime
        ? new Date(asm.endTime).getTime()
        : (asm.end_time ? new Date(asm.end_time).getTime() : 0);

      const isUpcoming = Boolean(startMs && currentTime < startMs && !hasActiveInProg);
      const secondsUntilStart = isUpcoming ? Math.max(0, Math.floor((startMs - currentTime) / 1000)) : 0;

      const isAssessmentClosed =
        asm.status === 'CLOSED' ||
        asm.status === 'COMPLETED' ||
        asm.status === 'ARCHIVED' ||
        (Boolean(endMs) && currentTime >= endMs && asm.status !== 'PAUSED');

      // Check restart permissions
      const candidateAliases = [
        effectiveUserId,
        currentUser?.id,
        currentUser?.uid,
        currentUser?.registerNumber,
        currentUser?.registerNo,
        currentUser?.email,
        ...asmSessions.map((s) => s.candidateId),
        ...asmSessions.map((s) => (s as any).studentId),
        ...asmSessions.map((s) => s.candidateEmail),
      ].filter(Boolean) as string[];

      let restartPerm: any = undefined;
      if (asm.restartPermissions) {
        for (const alias of candidateAliases) {
          if (asm.restartPermissions[alias]?.allowed && !asm.restartPermissions[alias]?.consumed) {
            restartPerm = asm.restartPermissions[alias];
            break;
          }
        }
      }
      const hasRestartPermission = Boolean(restartPerm && restartPerm.allowed && !restartPerm.consumed);
      const canRetake =
        hasRestartPermission ||
        (!isAssessmentClosed && !isUpcoming && (hasActiveInProg || attemptsUsed < maxAllowed));

      // Chronological sort
      const sortedCompleted = [...completedSessions].sort(
        (a, b) => new Date(a.completedAt || a.startedAt || 0).getTime() - new Date(b.completedAt || b.startedAt || 0).getTime()
      );
      const sortedAll = [...asmSessions].sort(
        (a, b) => new Date(b.completedAt || b.updatedAt || b.startedAt || 0).getTime() - new Date(a.completedAt || a.updatedAt || a.startedAt || 0).getTime()
      );
      const latestSession = sortedCompleted.length > 0 ? sortedCompleted[sortedCompleted.length - 1] : (sortedAll[0] || null);

      const resolvedQList = (asm.questions && asm.questions.length > 0) ? asm.questions : questions;
      const latestMetrics = latestSession
        ? getCandidateSessionMetrics(latestSession, submissions, asm, resolvedQList)
        : { score: 0, maxScore: getAssessmentTotalMaxMarks(asm, null, resolvedQList), percentage: 0 };

      const totalPoints = latestMetrics.maxScore;
      const latestScore = latestMetrics.score;
      const percentage = latestMetrics.percentage;
      const canShowResults = asm.showResultsToStudents ?? asm.securitySettings?.showResultsToStudents ?? true;

      let statusCategory: 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
      if (hasActiveInProg) {
        statusCategory = 'IN_PROGRESS';
      } else if (attemptsUsed > 0 && !canRetake && !isUpcoming) {
        statusCategory = 'COMPLETED';
      } else if (isUpcoming) {
        statusCategory = 'UPCOMING';
      } else if (isAssessmentClosed && !hasRestartPermission) {
        statusCategory = 'CLOSED';
      } else {
        statusCategory = 'AVAILABLE';
      }

      map.set(asm.id, {
        asmSessions,
        completedSessions,
        activeInProgSession,
        attemptsUsed,
        maxAllowed,
        isUpcoming,
        secondsUntilStart,
        startMs,
        endMs,
        isAssessmentClosed,
        hasRestartPermission,
        restartPerm,
        canRetake,
        latestSession,
        latestScore,
        totalPoints,
        percentage,
        canShowResults,
        statusCategory,
      });
    });

    return map;
  }, [uniqueAssessments, sessions, submissions, questions, effectiveUserId, currentUser, currentTime]);

  // Overall Performance Statistics
  const overallStats = useMemo(() => {
    let totalAssigned = uniqueAssessments.length;
    let completedCount = 0;
    let availableCount = 0;
    let upcomingCount = 0;
    let inProgressCount = 0;
    let totalEarnedScore = 0;
    let totalPossibleScore = 0;

    uniqueAssessments.forEach((asm) => {
      const meta = assessmentMetaMap.get(asm.id);
      if (!meta) return;

      if (meta.attemptsUsed > 0) {
        completedCount++;
        totalEarnedScore += meta.latestScore;
        totalPossibleScore += meta.totalPoints;
      }
      if (meta.activeInProgSession) {
        inProgressCount++;
      }
      if (meta.isUpcoming) {
        upcomingCount++;
      }
      if (meta.canRetake && !meta.isAssessmentClosed && !meta.isUpcoming) {
        availableCount++;
      }
    });

    const averagePercentage =
      totalPossibleScore > 0 ? Math.round((totalEarnedScore / totalPossibleScore) * 100) : 0;

    let tier = {
      label: 'Not Started',
      badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    };
    if (completedCount > 0) {
      if (averagePercentage >= 90) {
        tier = { label: 'Outstanding (Tier A+)', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      } else if (averagePercentage >= 75) {
        tier = { label: 'Proficient (Tier A)', badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
      } else if (averagePercentage >= 50) {
        tier = { label: 'Satisfactory (Tier B)', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      } else {
        tier = { label: 'Needs Practice', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
      }
    }

    return {
      totalAssigned,
      completedCount,
      availableCount,
      upcomingCount,
      inProgressCount,
      totalEarnedScore,
      totalPossibleScore,
      averagePercentage,
      tier,
    };
  }, [uniqueAssessments, assessmentMetaMap]);

  // Filtered assessments list
  const filteredAssessments = useMemo(() => {
    return uniqueAssessments.filter((asm) => {
      const meta = assessmentMetaMap.get(asm.id);
      if (!meta) return false;

      // Tab filter
      if (filterTab === 'AVAILABLE' && (!meta.canRetake || meta.isAssessmentClosed || meta.isUpcoming)) {
        return false;
      }
      if (filterTab === 'UPCOMING' && !meta.isUpcoming) {
        return false;
      }
      if (filterTab === 'IN_PROGRESS' && !meta.activeInProgSession) {
        return false;
      }
      if (filterTab === 'COMPLETED' && meta.attemptsUsed === 0) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (asm.title || '').toLowerCase();
        const desc = (asm.description || '').toLowerCase();
        const faculty = (asm.facultyName || '').toLowerCase();
        const subject = ((asm as any).subject || '').toLowerCase();
        return title.includes(q) || desc.includes(q) || faculty.includes(q) || subject.includes(q);
      }

      return true;
    });
  }, [uniqueAssessments, assessmentMetaMap, filterTab, searchQuery]);

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

  const studentRegisterNo =
    currentUser?.registerNumber || currentUser?.registerNo || 'Not Assigned';
  const studentDept = currentUser?.department || 'Computer Science & Engineering';
  const studentInstitution =
    currentUser?.institutionId === 'inst-1'
      ? 'Dr. N.G.P. Institute of Technology'
      : currentUser?.institutionId || 'Dr. N.G.P. Institute of Technology';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. STUDENT PROFILE CARD & WELCOME BANNER */}
      <div className="rounded-2xl bg-gradient-to-r from-[#181820] via-[#141418] to-[#121216] border border-white/10 p-6 shadow-xl relative overflow-hidden">
        {/* Subtle ambient light */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center space-x-4">
            <UserAvatar
              name={currentUser?.name || 'Student'}
              avatarUrl={currentUser?.avatar || (currentUser as any)?.profilePicUrl}
              sizeClassName="w-16 h-16 sm:w-20 sm:h-20"
              textClassName="text-xl sm:text-2xl font-bold"
              className="ring-2 ring-indigo-500/40 ring-offset-2 ring-offset-[#141418] shadow-lg shrink-0"
            />
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="label-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                  STUDENT PORTAL
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Enrolled & Verified
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
                {currentUser?.name || 'Student Candidate'}
              </h1>
              <div className="flex items-center text-xs text-zinc-400 gap-x-4 gap-y-1 flex-wrap">
                <span className="flex items-center gap-1 text-indigo-300 font-mono font-medium">
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                  Reg No: <strong className="text-white">{studentRegisterNo}</strong>
                </span>
                <span className="hidden sm:inline text-zinc-600">•</span>
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  {studentDept}
                </span>
                <span className="hidden sm:inline text-zinc-600">•</span>
                <span className="text-zinc-400 text-[11px]">
                  {currentUser?.email}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Links */}
          <div className="flex items-center gap-2 flex-wrap">
            {onNavigateToTab && (
              <>
                <button
                  onClick={() => onNavigateToTab('candidate_history')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#1e1e24] text-zinc-300 hover:text-white border border-white/10 hover:border-indigo-500/40 hover:bg-white/5 cursor-pointer transition shadow-sm"
                  title="View test attempt history and past results"
                >
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>My Results & History</span>
                </button>
                <button
                  onClick={() => onNavigateToTab('candidate_rankings')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#1e1e24] text-zinc-300 hover:text-white border border-white/10 hover:border-amber-500/40 hover:bg-white/5 cursor-pointer transition shadow-sm"
                  title="View class performance and rankings"
                >
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Leaderboard</span>
                </button>
              </>
            )}
            <button
              onClick={onOpenPrivacyNotice}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#1e1e24] text-zinc-300 hover:text-white border border-white/10 hover:bg-white/5 cursor-pointer transition shadow-sm"
              title="View automated proctoring terms and rules"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>System & Proctoring Rules</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. PERFORMANCE & STATISTICS SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Assigned Assessments */}
        <div className="p-4 rounded-xl bg-[#141417] border border-white/10 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Assigned Tests</span>
            <BookOpen className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-white font-display">
              {overallStats.totalAssigned}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {overallStats.availableCount} available to take
            </p>
          </div>
        </div>

        {/* Card 2: Completed Tests */}
        <div className="p-4 rounded-xl bg-[#141417] border border-white/10 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Tests Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400 font-display">
              {overallStats.completedCount}{' '}
              <span className="text-sm font-normal text-zinc-400">/ {overallStats.totalAssigned}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {overallStats.inProgressCount > 0 ? `${overallStats.inProgressCount} in progress` : 'All caught up'}
            </p>
          </div>
        </div>

        {/* Card 3: Marks Obtained vs Max Possible */}
        <div className="p-4 rounded-xl bg-[#141417] border border-white/10 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Total Marks Earned</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-300 font-mono">
              {overallStats.totalEarnedScore}{' '}
              <span className="text-sm font-normal text-zinc-400 font-sans">/ {overallStats.totalPossibleScore} pts</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Across completed evaluations</p>
          </div>
        </div>

        {/* Card 4: Average Score & Standing Tier */}
        <div className="p-4 rounded-xl bg-[#141417] border border-white/10 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Avg Performance</span>
            <BarChart3 className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-extrabold text-white font-display">
                {overallStats.averagePercentage}%
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${overallStats.tier.badgeClass}`}>
                {overallStats.tier.label}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">Strict test case-based score</p>
          </div>
        </div>
      </div>

      {/* 3. FILTER TABS & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        {/* Category Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <span>All Tests</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20">
              {uniqueAssessments.length}
            </span>
          </button>
          <button
            onClick={() => setFilterTab('AVAILABLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === 'AVAILABLE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <span>Available to Start</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20">
              {overallStats.availableCount}
            </span>
          </button>
          {overallStats.upcomingCount > 0 && (
            <button
              onClick={() => setFilterTab('UPCOMING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                filterTab === 'UPCOMING'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-[#141417] text-amber-400/90 hover:text-amber-300 border border-amber-500/30'
              }`}
            >
              <span>Upcoming</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {overallStats.upcomingCount}
              </span>
            </button>
          )}
          <button
            onClick={() => setFilterTab('IN_PROGRESS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === 'IN_PROGRESS'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <span>In Progress</span>
            {overallStats.inProgressCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500 text-slate-950 font-bold">
                {overallStats.inProgressCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterTab('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === 'COMPLETED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <span>Completed</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20">
              {overallStats.completedCount}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test by title or faculty..."
            className="w-full bg-[#141417] border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. ASSESSMENTS GRID OR HELPFUL EMPTY STATES */}
      {filteredAssessments.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#141417] p-10 text-center space-y-4 shadow-sm">
          {uniqueAssessments.length === 0 ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                <GraduationCap className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-white">No Assessments Assigned Yet</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  You currently don't have any assessments assigned to your registration profile ({studentRegisterNo}).
                  When your faculty schedules a coding exam or practical test for your class, it will appear here immediately.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#1e1e24] border border-white/5 max-w-lg mx-auto text-left text-xs text-zinc-400 space-y-1.5">
                <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  What you can do right now:
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-400">
                  <li>Verify that your register number and classroom are correctly registered with your faculty.</li>
                  <li>Review proctoring and privacy guidelines by clicking <strong>System & Proctoring Rules</strong> above.</li>
                  {onNavigateToTab && (
                    <li>Check class scores and rankings in the <strong>Leaderboard</strong> tab.</li>
                  )}
                </ul>
              </div>
              {onNavigateToTab && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => onNavigateToTab('candidate_rankings')}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                  >
                    View Class Rankings
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No Matching Assessments</h3>
                <p className="text-xs text-zinc-400">
                  No tests match your current search query "{searchQuery}" in tab "{filterTab.toLowerCase()}".
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterTab('ALL');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                Clear Search & Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredAssessments.map((asm, asmIdx) => {
            const meta = assessmentMetaMap.get(asm.id)!;
            const {
              completedSessions,
              activeInProgSession,
              attemptsUsed,
              maxAllowed,
              isAssessmentClosed,
              hasRestartPermission,
              restartPerm,
              canRetake,
              latestScore,
              totalPoints,
              percentage,
              canShowResults,
            } = meta;

            const isProctored = Boolean(
              asm.proctoringSettings?.webcam ||
              asm.securitySettings?.recordScreen ||
              (asm.securitySettings as any)?.webcamProctoring ||
              asm.isMonitored
            );

            return (
              <div
                key={asm.id || `asm-${asmIdx}`}
                className={`card-variation2 p-6 space-y-4 flex flex-col justify-between ${
                  hasRestartPermission
                    ? 'border-amber-500/50 bg-amber-950/10'
                    : attemptsUsed > 0 && !canRetake
                    ? 'border-emerald-500/30'
                    : activeInProgSession
                    ? 'border-indigo-500/50'
                    : ''
                }`}
              >
                <div className="space-y-3">
                  {/* Card Badges */}
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
                    ) : meta.isUpcoming ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400 animate-pulse" /> Starts in {formatCountdown(meta.secondsUntilStart)}
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
                          {activeInProgSession ? 'IN PROGRESS' : attemptsUsed > 0 ? 'RETAKE AVAILABLE' : (asm.status || 'AVAILABLE')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-base font-bold text-white group-hover:text-indigo-400 transition">
                      {asm.title || 'Untitled Assessment'}
                    </h4>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1">
                      {asm.description || 'Proctored coding assessment.'}
                    </p>
                  </div>

                  {/* Proctoring & Instruction Notices */}
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 pt-1">
                    {isProctored ? (
                      <span className="flex items-center gap-1 text-indigo-400/90 font-medium">
                        <Video className="w-3 h-3" /> Camera & Screen Proctoring
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <FileCode2 className="w-3 h-3" /> Standard Assessment
                      </span>
                    )}
                    <span>•</span>
                    <span>Auto-submits on time limit</span>
                  </div>

                  {/* Faculty Notes for Permitted Restart */}
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

                {/* Card Footer: Scores & Actions */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-mono text-[11px]">By {asm.facultyName || 'Faculty'}</span>
                    {(attemptsUsed > 0 || (meta.latestSession && latestScore > 0)) && canShowResults && (
                      <span className="text-[11px] font-bold text-emerald-400 font-mono">
                        {attemptsUsed > 1 ? `Latest Attempt (${attemptsUsed}): ` : attemptsUsed === 0 ? 'Evaluated: ' : 'Score: '}
                        {latestScore}/{totalPoints} ({percentage}%)
                      </span>
                    )}
                  </div>

                  {/* Multi-attempt History Badges */}
                  {attemptsUsed > 1 && canShowResults && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-zinc-400 pt-1 border-t border-white/5">
                      <span className="text-zinc-500 font-sans text-[10px]">History:</span>
                      {completedSessions.map((s, idx) => {
                        const sMetrics = getCandidateSessionMetrics(s, submissions, asm, (asm.questions && asm.questions.length > 0) ? asm.questions : questions);
                        const isLatest = idx === completedSessions.length - 1;
                        return (
                          <span
                            key={s.id}
                            className={`px-1.5 py-0.5 rounded border ${
                              isLatest
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-bold'
                                : 'bg-[#181820] text-zinc-400 border-white/10'
                            }`}
                          >
                            Att #{idx + 1}: {sMetrics.score}/{sMetrics.maxScore} ({sMetrics.percentage}%)
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                    {canRetake ? (
                      <button
                        onClick={() => handleStartClick(asm)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-lg ${
                          hasRestartPermission
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                            : activeInProgSession
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 animate-pulse'
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
                    ) : meta.isUpcoming ? (
                      <button
                        disabled
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 cursor-not-allowed flex items-center space-x-1.5 opacity-90 shadow-sm"
                        title={`Scheduled start: ${new Date(meta.startMs).toLocaleString()}`}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>Starts in {formatCountdown(meta.secondsUntilStart)}</span>
                      </button>
                    ) : isAssessmentClosed ? (
                      <span className="text-xs font-semibold text-zinc-400 italic flex items-center gap-1.5 py-1">
                        <Lock className="w-3.5 h-3.5 text-zinc-500" /> Assessment closed
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-400 italic">
                        {asm?.allowRetake || maxAllowed === 2
                          ? 'Retake test completed (Allowed only once — 2/2 attempts used)'
                          : `All ${maxAllowed} attempt${maxAllowed === 1 ? '' : 's'} used`}
                      </span>
                    )}

                    {/* View Results & Analysis Button */}
                    {attemptsUsed > 0 && canShowResults && onViewResults && (
                      <button
                        onClick={() => onViewResults(asm.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition cursor-pointer flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-400" />
                        <span>View Result</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. PASSWORD VERIFICATION MODAL */}
      {selectedAsmForPassword && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-indigo-500/30 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl relative">
            <button
              onClick={() => setSelectedAsmForPassword(null)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <KeyRound className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Assessment Password Required</h3>
                <p className="text-xs text-zinc-400 line-clamp-1">{selectedAsmForPassword?.title || 'Assessment'}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed bg-[#0c0c0e] p-3 rounded-xl border border-white/10">
              This proctored assessment is password protected by <strong>{selectedAsmForPassword?.facultyName || 'Faculty'}</strong>. Please enter the passcode provided by your exam invigilator to unlock.
            </p>

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Enter Access Passcode *</label>
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
                    className="w-full bg-[#0c0c0e] border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition"
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
