import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  PlusCircle,
  Search,
  Filter,
  Calendar,
  Clock,
  Key,
  Unlock,
  Shield,
  ShieldAlert,
  Edit3,
  Trash2,
  Eye,
  Video,
  BarChart3,
  Users,
  Code2,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Layers,
  ChevronRight,
  X,
  Copy,
  Check,
  Award,
  BookOpen,
  Sparkles,
  ExternalLink,
  GraduationCap,
  ListOrdered,
  LayoutGrid,
  Table as TableIcon,
  Loader2,
  Lock,
  ArrowRightLeft,
  Pause,
  Play,
} from 'lucide-react';
import {
  Assessment,
  CandidateSession,
  Classroom,
  Question,
  Submission,
  User,
} from '../../types';
import { ReassignAssessmentModal } from './ReassignAssessmentModal';
import { QuestionDetailModal } from '../common/QuestionDetailModal';

interface FacultyAssessmentsPageProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  submissions?: Submission[];
  classes?: Classroom[];
  users?: User[];
  onCreateAssessmentTrigger: () => void;
  onEditAssessment?: (asm: Assessment) => void;
  onDeleteAssessment?: (asmId: string) => Promise<void> | void;
  onUpdateAssessment?: (asm: Assessment) => Promise<void> | void;
  onCreateAssessment?: (asm: Assessment) => Promise<void> | void;
  onNavigateSubNav: (nav: string) => void;
  onInspectCandidate?: (sessionId: string) => void;
}

export const FacultyAssessmentsPage: React.FC<FacultyAssessmentsPageProps> = ({
  assessments = [],
  sessions = [],
  submissions = [],
  classes = [],
  users = [],
  onCreateAssessmentTrigger,
  onEditAssessment,
  onDeleteAssessment,
  onUpdateAssessment,
  onCreateAssessment,
  onNavigateSubNav,
  onInspectCandidate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [selectedAsmForDetails, setSelectedAsmForDetails] = useState<Assessment | null>(null);
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<Question | null>(null);
  const [reassignAsmTarget, setReassignAsmTarget] = useState<Assessment | null>(null);
  const [deletingAsmId, setDeletingAsmId] = useState<string | null>(null);
  const [copiedPasscodeId, setCopiedPasscodeId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'OVERVIEW' | 'QUESTIONS' | 'SECURITY' | 'PARTICIPANTS'>('OVERVIEW');

  // Candidate users map
  const candidateUsers = useMemo(() => users.filter((u) => u.role === 'CANDIDATE'), [users]);

  // Helper to find classroom by ID
  const getClassroom = (classId?: string) => {
    if (!classId) return null;
    return classes.find((c) => c.id === classId) || null;
  };

  // Helper to calculate enrolled students count for an assessment
  const getEnrolledCount = (asm: Assessment) => {
    if (asm.classId) {
      const cls = classes.find((c) => c.id === asm.classId);
      if (cls && Array.isArray(cls.studentIds) && cls.studentIds.length > 0) {
        return cls.studentIds.length;
      }
    }
    return asm.candidateIds?.length || 0;
  };

  // Helper to get sessions for an assessment
  const getAssessmentSessions = (asmId: string) => {
    return sessions.filter((s) => s.assessmentId === asmId);
  };

  // Helper to compute effective assessment status taking end time and closed flags into account
  const getEffectiveStatus = (asm: Assessment): string => {
    if (asm.status === 'CLOSED') return 'CLOSED';
    if (asm.status === 'COMPLETED') return 'COMPLETED';
    if (asm.status === 'ARCHIVED') return 'ARCHIVED';
    if (asm.status === 'PAUSED') return 'PAUSED';
    if (asm.status === 'UPCOMING') return 'UPCOMING';
    if (asm.status === 'DRAFT') return 'DRAFT';
    if (asm.endTime && new Date(asm.endTime).getTime() <= Date.now()) {
      return 'CLOSED';
    }
    return asm.status || 'ACTIVE';
  };

  // KPI calculations
  const totalAssessments = assessments.length;
  const activeAssessments = assessments.filter((a) => getEffectiveStatus(a) === 'ACTIVE').length;
  const upcomingAssessments = assessments.filter((a) => {
    const st = getEffectiveStatus(a);
    return st === 'UPCOMING' || st === 'DRAFT';
  }).length;
  const completedAssessments = assessments.filter((a) => {
    const st = getEffectiveStatus(a);
    return st === 'COMPLETED' || st === 'CLOSED' || st === 'ARCHIVED';
  }).length;
  const totalQuestionsCurated = assessments.reduce((acc, a) => acc + (a.questions?.length || 0), 0);

  // Filtered assessments
  const filteredAssessments = useMemo(() => {
    const list = assessments.filter((asm) => {
      if (!asm || !asm.id) return false;
      const effectiveSt = getEffectiveStatus(asm);
      const matchesSearch =
        !searchTerm.trim() ||
        asm.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asm.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asm.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'ACTIVE' && effectiveSt === 'ACTIVE') ||
        (selectedStatus === 'COMPLETED' && (effectiveSt === 'COMPLETED' || effectiveSt === 'CLOSED' || effectiveSt === 'ARCHIVED')) ||
        (selectedStatus === 'UPCOMING' && (effectiveSt === 'UPCOMING' || effectiveSt === 'DRAFT'));

      const matchesClass =
        selectedClassFilter === 'ALL' || asm.classId === selectedClassFilter;

      return matchesSearch && matchesStatus && matchesClass;
    });

    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [assessments, searchTerm, selectedStatus, selectedClassFilter]);

  const handleCopyPasscode = (asmId: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPasscodeId(asmId);
    setTimeout(() => setCopiedPasscodeId(null), 2000);
  };

  const handleToggleCloseAssessment = async (asm: Assessment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onUpdateAssessment) return;
    const effectiveSt = getEffectiveStatus(asm);
    const isCurrentlyActive = effectiveSt === 'ACTIVE';
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

  const handleDeleteAssessmentClick = async (asm: Assessment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onDeleteAssessment) return;
    if (window.confirm(`Are you sure you want to delete "${asm.title}"? All associated question sets and configuration will be permanently removed.`)) {
      setDeletingAsmId(asm.id);
      try {
        await onDeleteAssessment(asm.id);
        if (selectedAsmForDetails?.id === asm.id) {
          setSelectedAsmForDetails(null);
        }
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
      if (selectedAsmForDetails && selectedAsmForDetails.id === updatedAsm.id) {
        setSelectedAsmForDetails(updatedAsm);
      }
    } catch (err) {
      console.error('Failed to handle reassign in page:', err);
    }
  };

  const getStatusBadge = (status: string, asm?: Assessment) => {
    const effectiveStatus = asm ? getEffectiveStatus(asm) : status;
    switch (effectiveStatus) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ACTIVE LIVE
          </span>
        );
      case 'PAUSED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 shadow-sm">
            <Pause className="w-3 h-3 text-amber-400" />
            PAUSED
          </span>
        );
      case 'CLOSED':
      case 'COMPLETED':
      case 'ARCHIVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-slate-400" />
            {effectiveStatus === 'CLOSED' ? 'CLOSED' : 'COMPLETED'}
          </span>
        );
      case 'UPCOMING':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-cyan-400" />
            UPCOMING
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            {effectiveStatus || 'DRAFT'}
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Assessment Management & Proctoring</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Assessments
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage, inspect, and proctor curated coding tests, security policies, and student submissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateSubNav('faculty_questions')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold border border-white/10 transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Question Bank</span>
          </button>
          <button
            onClick={() => onNavigateSubNav('faculty_live')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 text-xs font-semibold transition cursor-pointer"
          >
            <Video className="w-3.5 h-3.5 text-indigo-400" />
            <span>Live Grid</span>
          </button>
          <button
            onClick={onCreateAssessmentTrigger}
            className="flex items-center space-x-2 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Assessment</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Total Tests</span>
            <FileCheck2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{totalAssessments}</div>
          <div className="text-[11px] text-slate-500 mt-1">Managed assessments</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Active Live</span>
            <PlayCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">{activeAssessments}</div>
          <div className="text-[11px] text-emerald-500/80 mt-1">Currently in progress</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Upcoming / Drafts</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 tracking-tight">{upcomingAssessments}</div>
          <div className="text-[11px] text-slate-500 mt-1">Scheduled examinations</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Curated Questions</span>
            <Code2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{totalQuestionsCurated}</div>
          <div className="text-[11px] text-indigo-400/80 mt-1">Across all assessments</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search assessment title, description, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(['ALL', 'ACTIVE', 'PAUSED', 'UPCOMING', 'COMPLETED'] as const).map((statusKey) => (
              <button
                key={statusKey}
                onClick={() => setSelectedStatus(statusKey)}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  selectedStatus === statusKey
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {statusKey === 'ALL' ? 'All Status' : statusKey}
              </button>
            ))}
          </div>

          {/* Classroom filter dropdown */}
          {classes.length > 0 && (
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="ALL">All Classrooms</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end lg:self-auto">
          <button
            onClick={() => setViewMode('GRID')}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === 'GRID'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('TABLE')}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              viewMode === 'TABLE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Table View"
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content: Assessment Grid or Table */}
      {filteredAssessments.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Assessments Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm || selectedStatus !== 'ALL' || selectedClassFilter !== 'ALL'
              ? 'No assessments match your current filter criteria. Try adjusting your search query or filters.'
              : 'You have not created any assessments yet. Click the button below to design your first proctored coding assessment.'}
          </p>
          <button
            onClick={onCreateAssessmentTrigger}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer mt-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create First Assessment</span>
          </button>
        </div>
      ) : viewMode === 'GRID' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssessments.map((asm) => {
            const cls = getClassroom(asm.classId);
            const enrolledCount = getEnrolledCount(asm);
            const asmSessions = getAssessmentSessions(asm.id);
            const codingQCount = asm.questions?.filter((q) => q.type === 'CODING').length || 0;
            const mcqQCount = asm.questions?.filter((q) => q.type === 'MCQ').length || 0;
            const totalMarks = asm.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0;

            return (
              <div
                key={asm.id}
                onClick={() => {
                  setSelectedAsmForDetails(asm);
                  setActiveDetailTab('OVERVIEW');
                }}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/5 cursor-pointer group"
              >
                {/* Card Top Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {getStatusBadge(asm.status, asm)}
                    {cls ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-950/60 text-indigo-300 border border-indigo-700/50 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3 text-indigo-400" />
                        {cls.name}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono">Universal</span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition line-clamp-1">
                      {asm.title || 'Untitled Assessment'}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {asm.description || 'No description provided.'}
                    </p>
                  </div>
                </div>

                {/* Key Metadata Stats Box */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="font-mono">{asm.durationMinutes || 60} mins</span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{totalMarks} total pts</span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Code2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>
                      {asm.questions?.length || 0} Questions ({codingQCount}C / {mcqQCount}M)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-300">
                    <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{enrolledCount} Enrolled</span>
                  </div>
                </div>

                {/* Passcode & Security Pill */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    {asm.isPasswordProtected && asm.password ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyPasscode(asm.id, asm.password || '');
                        }}
                        className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 font-mono font-bold flex items-center gap-1 text-[11px] hover:bg-indigo-500/20 transition cursor-pointer"
                        title="Click to copy passcode"
                      >
                        <Key className="w-3 h-3 text-indigo-400" />
                        <span>{asm.password}</span>
                        {copiedPasscodeId === asm.id ? (
                          <Check className="w-3 h-3 text-emerald-400 ml-0.5" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-slate-400 ml-0.5 opacity-60" />
                        )}
                      </div>
                    ) : (
                      <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50 flex items-center gap-1 text-[11px]">
                        <Unlock className="w-3 h-3 text-slate-500" /> Open Access
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Max {asm.securitySettings?.maxWarnings || 5} warns</span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAsmForDetails(asm);
                      setActiveDetailTab('OVERVIEW');
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  <div className="flex items-center space-x-1.5">
                    {onUpdateAssessment && (
                      <button
                        type="button"
                        onClick={(e) => handleToggleCloseAssessment(asm, e)}
                        className={`p-1.5 rounded-xl border transition cursor-pointer ${
                          getEffectiveStatus(asm) === 'ACTIVE'
                            ? 'bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border-rose-500/20'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/20'
                        }`}
                        title={getEffectiveStatus(asm) === 'ACTIVE' ? 'Close Assessment (Prevent New Starts)' : 'Reopen / Activate Assessment'}
                      >
                        {getEffectiveStatus(asm) === 'ACTIVE' ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReassignAsmTarget(asm);
                      }}
                      className="p-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/20 transition cursor-pointer"
                      title="Reassign to Same or Different Class"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>

                    {onEditAssessment && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditAssessment(asm);
                        }}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                        title="Edit Assessment"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateSubNav('faculty_reports');
                      }}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                      title="View Assessment Reports & Submissions"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                    </button>

                    {onDeleteAssessment && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAssessmentClick(asm, e)}
                        disabled={deletingAsmId === asm.id}
                        className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 transition cursor-pointer disabled:opacity-50"
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
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">Assessment Details</th>
                  <th className="p-3.5">Classroom</th>
                  <th className="p-3.5">Duration & Marks</th>
                  <th className="p-3.5">Questions</th>
                  <th className="p-3.5">Passcode</th>
                  <th className="p-3.5">Enrolled</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredAssessments.map((asm) => {
                  const cls = getClassroom(asm.classId);
                  const enrolledCount = getEnrolledCount(asm);
                  const totalMarks = asm.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0;

                  return (
                    <tr
                      key={asm.id}
                      onClick={() => {
                        setSelectedAsmForDetails(asm);
                        setActiveDetailTab('OVERVIEW');
                      }}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="p-3.5 font-medium text-white max-w-xs">
                        <div className="font-bold text-slate-100 hover:text-indigo-300 transition">
                          {asm.title || 'Untitled Assessment'}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                          {asm.description || 'No description'}
                        </div>
                      </td>
                      <td className="p-3.5">
                        {cls ? (
                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-950/60 text-indigo-300 border border-indigo-700/50">
                            {cls.name}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">Universal</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">
                        <div>{asm.durationMinutes || 60} mins</div>
                        <div className="text-[11px] text-amber-400">{totalMarks} pts</div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">
                        {asm.questions?.length || 0} Qs
                      </td>
                      <td className="p-3.5">
                        {asm.isPasswordProtected && asm.password ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 font-mono font-bold text-[11px]">
                            {asm.password}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">None</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">
                        {enrolledCount} students
                      </td>
                      <td className="p-3.5">{getStatusBadge(asm.status, asm)}</td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {onUpdateAssessment && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleCloseAssessment(asm, e)}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                getEffectiveStatus(asm) === 'ACTIVE'
                                  ? 'bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border-rose-500/20'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/20'
                              }`}
                              title={getEffectiveStatus(asm) === 'ACTIVE' ? 'Close Assessment' : 'Reopen / Activate Assessment'}
                            >
                              {getEffectiveStatus(asm) === 'ACTIVE' ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAsmForDetails(asm);
                              setActiveDetailTab('OVERVIEW');
                            }}
                            className="p-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition cursor-pointer"
                            title="View Full Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReassignAsmTarget(asm);
                            }}
                            className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 transition cursor-pointer"
                            title="Reassign to Same or Different Class"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          {onEditAssessment && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditAssessment(asm);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                              title="Edit Assessment"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                            </button>
                          )}
                          {onDeleteAssessment && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteAssessmentClick(asm, e)}
                              disabled={deletingAsmId === asm.id}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 transition cursor-pointer disabled:opacity-50"
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
      )}

      {/* COMPREHENSIVE ASSESSMENT DETAILS MODAL */}
      {selectedAsmForDetails && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(selectedAsmForDetails.status, selectedAsmForDetails)}
                  {getClassroom(selectedAsmForDetails.classId) && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                      {getClassroom(selectedAsmForDetails.classId)?.name}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 font-mono">ID: {selectedAsmForDetails.id}</span>
                </div>
                <h2 className="text-lg font-bold text-white">
                  {selectedAsmForDetails.title || 'Untitled Assessment'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                  {selectedAsmForDetails.description || 'No detailed description provided.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setReassignAsmTarget(selectedAsmForDetails);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
                  title="Reassign to Same or Different Class"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Reassign Cohort</span>
                </button>
                {onEditAssessment && (
                  <button
                    onClick={() => {
                      const asm = selectedAsmForDetails;
                      setSelectedAsmForDetails(null);
                      onEditAssessment(asm);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Test</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedAsmForDetails(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tabs Bar */}
            <div className="bg-slate-950/40 border-b border-slate-800 px-5 flex items-center space-x-2 text-xs font-semibold">
              <button
                onClick={() => setActiveDetailTab('OVERVIEW')}
                className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === 'OVERVIEW'
                    ? 'border-indigo-500 text-indigo-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Overview & Timing</span>
              </button>
              <button
                onClick={() => setActiveDetailTab('QUESTIONS')}
                className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === 'QUESTIONS'
                    ? 'border-indigo-500 text-indigo-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Curated Questions ({selectedAsmForDetails.questions?.length || 0})</span>
              </button>
              <button
                onClick={() => setActiveDetailTab('SECURITY')}
                className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === 'SECURITY'
                    ? 'border-indigo-500 text-indigo-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Proctoring & Security</span>
              </button>
              <button
                onClick={() => setActiveDetailTab('PARTICIPANTS')}
                className={`py-3 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                  activeDetailTab === 'PARTICIPANTS'
                    ? 'border-indigo-500 text-indigo-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Candidates & Sessions ({getAssessmentSessions(selectedAsmForDetails.id).length})</span>
              </button>
            </div>

            {/* Modal Body Scroll Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-slate-300">
              {/* TAB 1: OVERVIEW & TIMING */}
              {activeDetailTab === 'OVERVIEW' && (
                <div className="space-y-5">
                  {/* Grid details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        Duration
                      </span>
                      <span className="text-base font-bold text-white flex items-center gap-1.5 font-mono">
                        <Clock className="w-4 h-4 text-indigo-400" />
                        {selectedAsmForDetails.durationMinutes || 60} Minutes
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        Passing Score
                      </span>
                      <span className="text-base font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                        <Award className="w-4 h-4 text-amber-400" />
                        {selectedAsmForDetails.passingScore || 60}%
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        Max Allowed Attempts
                      </span>
                      <span className="text-base font-bold text-white flex items-center gap-1.5 font-mono">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        {selectedAsmForDetails.maxAttempts || 1} Attempt(s)
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        Start Window
                      </span>
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        {selectedAsmForDetails.startTime
                          ? new Date(selectedAsmForDetails.startTime).toLocaleString()
                          : 'Immediate'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        End Window
                      </span>
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-rose-400" />
                        {selectedAsmForDetails.endTime
                          ? new Date(selectedAsmForDetails.endTime).toLocaleString()
                          : 'Open-ended'}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                        Passcode Security
                      </span>
                      <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 font-mono">
                        {selectedAsmForDetails.isPasswordProtected && selectedAsmForDetails.password ? (
                          <>
                            <Key className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{selectedAsmForDetails.password}</span>
                          </>
                        ) : (
                          <span className="text-slate-500 font-normal">Disabled</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Instructions Box */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      Candidate Examination Instructions
                    </h4>
                    <pre className="text-xs text-slate-300 font-sans whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                      {selectedAsmForDetails.instructions || 'No special instructions provided.'}
                    </pre>
                  </div>

                  {/* Allowed Programming Languages */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                      Allowed Programming Languages
                    </h4>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(selectedAsmForDetails.allowedLanguages || ['python', 'javascript', 'cpp', 'java']).map(
                        (lang) => (
                          <span
                            key={lang}
                            className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-slate-900 text-slate-200 border border-slate-700 capitalize"
                          >
                            {lang === 'cpp' ? 'C++' : lang === 'javascript' ? 'JavaScript (Node.js)' : lang}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CURATED QUESTIONS */}
              {activeDetailTab === 'QUESTIONS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Total {selectedAsmForDetails.questions?.length || 0} Question(s) in this assessment</span>
                    <span className="font-mono text-amber-400 font-bold">
                      {selectedAsmForDetails.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0} Total Points
                    </span>
                  </div>

                  {(!selectedAsmForDetails.questions || selectedAsmForDetails.questions.length === 0) ? (
                    <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500">
                      No questions have been attached to this assessment.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedAsmForDetails.questions.map((q, idx) => (
                        <div
                          key={q.id || idx}
                          onClick={() => setSelectedQuestionForDetail(q)}
                          className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/60 space-y-3 transition cursor-pointer group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold flex items-center justify-center text-xs">
                                  #{idx + 1}
                                </span>
                                <h4 className="font-bold text-white group-hover:text-indigo-200 transition text-sm flex items-center gap-1.5">
                                  {q.title}
                                </h4>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    q.type === 'MCQ'
                                      ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                  }`}
                                >
                                  {q.type || 'CODING'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    q.difficulty === 'HARD'
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                      : q.difficulty === 'MEDIUM'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}
                                >
                                  {q.difficulty || 'MEDIUM'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono font-bold text-xs">
                                {q.points || 0} pts
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedQuestionForDetail(q);
                                }}
                                className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 transition cursor-pointer"
                                title="Inspect Full Question Details & Test Cases"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-800/60 font-sans whitespace-pre-wrap">
                            {q.problemStatement}
                          </p>

                          {/* MCQ Options preview if MCQ */}
                          {q.type === 'MCQ' && q.mcqOptions && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] uppercase font-bold text-slate-500">Multiple Choice Options:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.mcqOptions.map((opt, oIdx) => (
                                  <div
                                    key={opt.id || oIdx}
                                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                                      opt.isCorrect
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold'
                                        : 'bg-slate-900 border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <span>{opt.text}</span>
                                    {opt.isCorrect && (
                                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                        Correct Answer
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Test Cases Count if Coding */}
                          {q.type !== 'MCQ' && (
                            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                              <span>Sample Testcases: <strong className="text-slate-200">{q.sampleTestCases?.length || 0}</strong></span>
                              <span>&bull;</span>
                              <span>Hidden Testcases: <strong className="text-slate-200">{q.hiddenTestCases?.length || 0}</strong></span>
                              {q.inputsCount && (
                                <>
                                  <span>&bull;</span>
                                  <span>Inputs/Testcase: <strong className="text-slate-200">{q.inputsCount}</strong></span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PROCTORING & SECURITY */}
              {activeDetailTab === 'SECURITY' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      Active Security & Malpractice Enforcement Policies
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Fullscreen Enforcement</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAsmForDetails.securitySettings?.requireFullscreen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {selectedAsmForDetails.securitySettings?.requireFullscreen ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Tab Switch Detection</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAsmForDetails.securitySettings?.detectTabSwitch ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {selectedAsmForDetails.securitySettings?.detectTabSwitch ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Copy / Cut / Paste Block</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAsmForDetails.securitySettings?.detectCopy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {selectedAsmForDetails.securitySettings?.detectCopy ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>AI Multi-Face Detection</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAsmForDetails.securitySettings?.detectMultipleFaces ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {selectedAsmForDetails.securitySettings?.detectMultipleFaces ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>No Face / Frame Exit Detect</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedAsmForDetails.securitySettings?.detectNoFace ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {selectedAsmForDetails.securitySettings?.detectNoFace ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <span>Max Warning Threshold</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 font-mono">
                          {selectedAsmForDetails.securitySettings?.maxWarnings || 5} Warnings
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Malpractice penalty threshold details */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      Auto-Termination & Proctoring Action
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {selectedAsmForDetails.securitySettings?.autoSubmitOnWarningThreshold
                        ? 'Candidates exceeding the maximum warning limit will have their session automatically terminated and submitted with flagged telemetry for faculty review.'
                        : 'Warnings will be logged on the live dashboard without automatic session expulsion.'}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 4: CANDIDATES & SESSIONS */}
              {activeDetailTab === 'PARTICIPANTS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {getAssessmentSessions(selectedAsmForDetails.id).length} recorded student test session(s)
                    </span>
                    <button
                      onClick={() => {
                        setSelectedAsmForDetails(null);
                        onNavigateSubNav('faculty_reports');
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                    >
                      <span>Open Full Reports</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {getAssessmentSessions(selectedAsmForDetails.id).length === 0 ? (
                    <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500">
                      No candidate sessions have been initiated for this assessment yet.
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                          <tr>
                            <th className="p-3">Candidate</th>
                            <th className="p-3">Score</th>
                            <th className="p-3">Warnings</th>
                            <th className="p-3">Session State</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {getAssessmentSessions(selectedAsmForDetails.id).map((sess) => {
                            const studentUser = candidateUsers.find((u) => u.id === sess.candidateId);
                            return (
                              <tr key={sess.id} className="hover:bg-slate-900/50">
                                <td className="p-3">
                                  <div className="font-bold text-white">
                                    {sess.candidateName || studentUser?.name || 'Unknown Candidate'}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    {studentUser?.registerNumber || studentUser?.email || sess.candidateId}
                                  </div>
                                </td>
                                <td className="p-3 font-mono font-bold text-slate-200">
                                  {sess.score !== undefined ? `${sess.score} pts` : '-'}
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                                      sess.warningsCount >= 3
                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        : 'bg-slate-800 text-slate-300'
                                    }`}
                                  >
                                    {sess.warningsCount || 0}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      sess.state === 'SUBMITTED'
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : sess.state === 'ACTIVE'
                                        ? 'bg-cyan-500/10 text-cyan-400'
                                        : sess.state === 'TERMINATED_MALPRACTICE'
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {sess.state}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedAsmForDetails(null);
                                      if (onInspectCandidate) {
                                        onInspectCandidate(sess.id);
                                      } else {
                                        onNavigateSubNav('faculty_history');
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-semibold text-[11px] transition cursor-pointer"
                                  >
                                    Review
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Created on {new Date(selectedAsmForDetails.createdAt || Date.now()).toLocaleDateString()}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedAsmForDetails(null)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN ASSESSMENT MODAL */}
      <ReassignAssessmentModal
        assessment={reassignAsmTarget}
        classes={classes}
        users={users}
        isOpen={Boolean(reassignAsmTarget)}
        onClose={() => setReassignAsmTarget(null)}
        onReassign={handleReassignSave}
        onOpenFullEditor={onEditAssessment}
      />

      {/* QUESTION DETAIL MODAL */}
      <QuestionDetailModal
        question={selectedQuestionForDetail}
        isOpen={Boolean(selectedQuestionForDetail)}
        onClose={() => setSelectedQuestionForDetail(null)}
      />
    </div>
  );
};
