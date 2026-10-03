import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { UserAvatar } from '../common/UserAvatar';
import {
  BarChart3,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Award,
  Smartphone,
  Video,
  Monitor,
  EyeOff,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Calendar,
  Clock,
  Briefcase,
  Search,
  ArrowLeft,
  Filter,
  ArrowUpDown,
  Building2,
  FileCode2,
  X,
  Eye,
  RefreshCw,
  Code2,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import {
  Assessment,
  CandidateSession,
  Submission,
  Classroom,
  User,
  Question,
  Result,
} from '../../types';
import { QuestionDetailModal } from '../common/QuestionDetailModal';
import { RestartTestModal, RestartTestOptions } from '../common/RestartTestModal';
import {
  getLatestCandidateSubmissions,
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  getCandidateSessionMetrics,
  getQuestionMaxMarks,
  isCandidateSessionCompleted,
} from '../../utils/submissionUtils';

export interface ReportsPageProps {
  assessments?: Assessment[];
  sessions?: CandidateSession[];
  submissions?: Submission[];
  questions?: Question[];
  results?: Result[];
  classes?: Classroom[];
  users?: User[];
  currentUser?: User;
  onUpdateAssessment?: (assessment: Assessment) => Promise<void> | void;
  onRestartTest?: (
    assessmentId: string,
    candidateId: string,
    sessionId?: string,
    options?: RestartTestOptions
  ) => Promise<void> | void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  assessments = [],
  sessions = [],
  submissions = [],
  questions = [],
  results = [],
  classes = [],
  users = [],
  currentUser,
  onUpdateAssessment,
  onRestartTest,
}) => {
  // 1. ASSESSMENT SELECTION FIRST STATE
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Filters for Assessment Selection Screen (Screen 1)
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [assessmentClassFilter, setAssessmentClassFilter] = useState<string>('ALL');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<string>('ALL');
  const [assessmentSortBy, setAssessmentSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'TITLE' | 'CANDIDATES'>('DATE_DESC');

  // Filters & State for Student Gradebook View (Screen 2)
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'PASSED' | 'FLAGGED' | 'FAILED'>('ALL');
  const [studentSortBy, setStudentSortBy] = useState<'RANK' | 'NAME' | 'ROLL' | 'SCORE' | 'PERCENTAGE' | 'CORRECT'>('RANK');
  const [studentSortOrder, setStudentSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Custom Minimum Passing Score override (per assessment evaluation)
  const [minimumPassMark, setMinimumPassMark] = useState<number>(50);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Modal State for Student Detailed Report (Screen 3)
  const [detailedReportSession, setDetailedReportSession] = useState<CandidateSession | null>(null);
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<Question | null>(null);
  const [restartModalSession, setRestartModalSession] = useState<CandidateSession | null>(null);

  // --------------------------------------------------------------------------
  // ACCESS CONTROL: Resolve Authorized Assessments for logged in User
  // --------------------------------------------------------------------------
  const authorizedAssessments = useMemo(() => {
    if (!currentUser || currentUser.role === 'ADMIN') {
      return assessments;
    }
    if (currentUser.role === 'FACULTY') {
      // Find all classes assigned to this faculty member
      const myClasses = classes.filter(
        (c) =>
          (c.staffIds && c.staffIds.includes(currentUser.id)) ||
          (c.facultyIds && c.facultyIds.includes(currentUser.id)) ||
          (c.facultyId && c.facultyId === currentUser.id)
      );
      const myClassIds = myClasses.map((c) => c.id);

      return assessments.filter((a) => {
        // Created by this faculty or unassigned facultyId
        if (!a.facultyId || a.facultyId === currentUser.id) return true;
        // Assigned to any of the faculty's classes
        if (a.classId && myClassIds.includes(a.classId)) return true;
        if (a.assignedClassIds && a.assignedClassIds.some((cid) => myClassIds.includes(cid))) return true;
        // General or fallback assessments
        if (!a.classId || myClassIds.length === 0) return true;
        return true;
      });
    }
    return assessments;
  }, [assessments, currentUser, classes]);

  const facultyClasses = useMemo(() => {
    if (!currentUser || currentUser.role === 'ADMIN') return classes;
    return classes.filter(
      (c) =>
        (c.staffIds && c.staffIds.includes(currentUser.id)) ||
        (c.facultyIds && c.facultyIds.includes(currentUser.id))
    );
  }, [classes, currentUser]);

  // --------------------------------------------------------------------------
  // FILTER ASSESSMENTS for Assessment Selection View
  // --------------------------------------------------------------------------
  const filteredAssessments = useMemo(() => {
    const list = authorizedAssessments
      .filter((a) => {
        if (!a || !a.id) return false;
        // Class filter
        if (assessmentClassFilter !== 'ALL') {
          const matchesDirect = a.classId === assessmentClassFilter;
          const matchesAssigned = a.assignedClassIds?.includes(assessmentClassFilter);
          if (!matchesDirect && !matchesAssigned) return false;
        }

        // Status filter
        if (assessmentStatusFilter !== 'ALL' && a.status !== assessmentStatusFilter) {
          return false;
        }

        // Search query
        if (assessmentSearchQuery.trim()) {
          const q = assessmentSearchQuery.toLowerCase();
          const cls = classes.find((c) => c.id === a.classId);
          const matchTitle = (a.title || '').toLowerCase().includes(q);
          const matchId = (a.id || '').toLowerCase().includes(q);
          const matchFaculty = (a.facultyName || '').toLowerCase().includes(q);
          const matchClass = (cls?.name || '').toLowerCase().includes(q);
          const matchDept = (cls?.department || '').toLowerCase().includes(q);
          return matchTitle || matchId || matchFaculty || matchClass || matchDept;
        }

        return true;
      })
      .sort((a, b) => {
        if (assessmentSortBy === 'TITLE') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (assessmentSortBy === 'CANDIDATES') {
          const countA = sessions.filter((s) => s.assessmentId === a.id).length;
          const countB = sessions.filter((s) => s.assessmentId === b.id).length;
          return countB - countA;
        }
        const timeA = new Date(a.createdAt || a.startTime || 0).getTime();
        const timeB = new Date(b.createdAt || b.startTime || 0).getTime();
        return assessmentSortBy === 'DATE_ASC' ? timeA - timeB : timeB - timeA;
      });

    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [
    authorizedAssessments,
    assessmentClassFilter,
    assessmentStatusFilter,
    assessmentSearchQuery,
    assessmentSortBy,
    classes,
    sessions,
  ]);

  // --------------------------------------------------------------------------
  // CURRENT SELECTED ASSESSMENT & DATA INITIALIZATION
  // --------------------------------------------------------------------------
  const currentAssessment = useMemo(() => {
    if (!selectedAssessmentId) return null;
    return authorizedAssessments.find((a) => a.id === selectedAssessmentId) || null;
  }, [selectedAssessmentId, authorizedAssessments]);

  const currentAssessmentClass = useMemo(() => {
    if (!currentAssessment?.classId) return null;
    return classes.find((c) => c.id === currentAssessment.classId) || null;
  }, [currentAssessment, classes]);

  useEffect(() => {
    if (currentAssessment) {
      setMinimumPassMark(currentAssessment.passingScore !== undefined && currentAssessment.passingScore !== null ? currentAssessment.passingScore : 50);
      setResultFilter('ALL');
      setStudentSearchQuery('');
      setCurrentPage(1);
    }
  }, [currentAssessment?.id, currentAssessment?.passingScore]);

  const handleSelectAssessment = (asmId: string) => {
    setIsLoadingReport(true);
    setSelectedAssessmentId(asmId);
    setTimeout(() => {
      setIsLoadingReport(false);
    }, 250);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessmentId(null);
    setDetailedReportSession(null);
  };

  // --------------------------------------------------------------------------
  // CANDIDATE SESSIONS & GRADEBOOK PROCESSING (Strict Data Isolation)
  // --------------------------------------------------------------------------
  const asmSessions = useMemo(() => {
    if (!currentAssessment) return [];
    return sessions.filter((s) => s.assessmentId === currentAssessment.id);
  }, [currentAssessment, sessions]);

  const asmSubmissions = useMemo(() => {
    if (!currentAssessment) return [];
    return submissions.filter((sub) => sub.assessmentId === currentAssessment.id);
  }, [currentAssessment, submissions]);

  // Resolved Questions pool: prioritize assessment.questions, then lookup questionIds from questions bank
  const resolvedQuestions = useMemo(() => {
    if (currentAssessment?.questions && currentAssessment.questions.length > 0) {
      return currentAssessment.questions;
    }
    if (currentAssessment?.questionIds && currentAssessment.questionIds.length > 0 && questions && questions.length > 0) {
      const matched = currentAssessment.questionIds
        .map((qid) => questions.find((q) => q.id === qid))
        .filter(Boolean) as Question[];
      if (matched.length > 0) return matched;
    }
    return currentAssessment?.questions || questions || [];
  }, [currentAssessment, questions]);

  const passingScore = Math.min(100, Math.max(0, minimumPassMark));
  const maxAllowedWarnings = currentAssessment?.securitySettings?.maxWarnings || 5;

  const isMalpracticeSession = (session: CandidateSession) =>
    session.state === 'TERMINATED_MALPRACTICE' ||
    (session as any).submissionStatus === 'TERMINATED_MALPRACTICE' ||
    session.riskCategory === 'MALPRACTICE_TERMINATED' ||
    (session.warningsCount ?? (session.flags?.length || session.proctoringEvents?.length || 0)) >= maxAllowedWarnings ||
    Boolean(
      session.exitReason &&
        (session.exitReason.toLowerCase().includes('malpractice') ||
          session.exitReason.toLowerCase().includes('warnings exceeded') ||
          session.exitReason.toLowerCase().includes('tab switch') ||
          session.exitReason.toLowerCase().includes('alt+tab') ||
          session.exitReason.toLowerCase().includes('auto submit'))
    );

  // Student helper for roll no, class, and submissions
  const getStudentReportData = (s: CandidateSession) => {
    const user = users.find((u) => u.id === s.candidateId);
    const userClass = classes.find(
      (c) =>
        (c.studentIds && c.studentIds.includes(s.candidateId)) ||
        (user?.classIds && user.classIds.includes(c.id))
    );

    const metrics = getCandidateSessionMetrics(
      s,
      submissions,
      currentAssessment,
      resolvedQuestions,
      results,
      passingScore
    );

    return {
      user,
      registerNo: s.candidateRegisterNo || user?.registerNumber || user?.registerNo || user?.rollNumber || 'REG-STD',
      className: userClass ? userClass.name : currentAssessmentClass?.name || 'General',
      section: userClass?.section || currentAssessmentClass?.section || user?.section || 'A',
      department: user?.department || userClass?.department || currentAssessmentClass?.department || 'Computer Science',
      score: metrics.score,
      maxScore: metrics.maxScore,
      percentage: metrics.percentage,
      totalPassedTC: metrics.passedTC,
      totalTC: metrics.totalTC,
      correctCount: metrics.correctCount,
      wrongCount: metrics.wrongCount,
      unansweredCount: metrics.unansweredCount,
      totalQuestions: metrics.totalQuestions,
      isMalpractice: metrics.isMalpractice,
      isPassed: metrics.isPassed,
      isFailed: metrics.isFailed,
      studentSubs: metrics.latestSubmissions,
    };
  };

  // Rank computation across all attempts for this assessment
  const rankedSessions = useMemo(() => {
    if (!currentAssessment) return [];

    // Sort by score descending to assign global rank
    const sorted = [...asmSessions].sort((a, b) => {
      const dataA = getStudentReportData(a);
      const dataB = getStudentReportData(b);
      return dataB.percentage - dataA.percentage;
    });

    return sorted.map((s, idx) => ({
      session: s,
      rank: idx + 1,
      data: getStudentReportData(s),
    }));
  }, [currentAssessment, asmSessions, submissions, users, classes, passingScore, resolvedQuestions, results]);

  // Filter & Sort Candidate Gradebook for the selected assessment
  const filteredRankedSessions = useMemo(() => {
    return rankedSessions
      .filter(({ session: s, data }) => {
        // Result Filter
        if (resultFilter === 'FLAGGED' && !data.isMalpractice && s.warningsCount < 3) return false;
        if (resultFilter === 'PASSED' && !data.isPassed) return false;
        if (resultFilter === 'FAILED' && !data.isFailed) return false;

        // Search Query
        if (studentSearchQuery.trim()) {
          const q = studentSearchQuery.toLowerCase();
          const matchName = (s.candidateName || data.user?.name || '').toLowerCase().includes(q);
          const matchEmail = (s.candidateEmail || data.user?.email || '').toLowerCase().includes(q);
          const matchReg = data.registerNo.toLowerCase().includes(q);
          const matchClass = data.className.toLowerCase().includes(q);
          return matchName || matchEmail || matchReg || matchClass;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (studentSortBy === 'RANK') {
          comp = a.rank - b.rank;
        } else if (studentSortBy === 'NAME') {
          comp = (a.session.candidateName || '').localeCompare(b.session.candidateName || '');
        } else if (studentSortBy === 'ROLL') {
          comp = a.data.registerNo.localeCompare(b.data.registerNo);
        } else if (studentSortBy === 'SCORE') {
          comp = a.data.score - b.data.score;
        } else if (studentSortBy === 'PERCENTAGE') {
          comp = a.data.percentage - b.data.percentage;
        } else if (studentSortBy === 'CORRECT') {
          comp = a.data.correctCount - b.data.correctCount;
        }
        return studentSortOrder === 'ASC' ? comp : -comp;
      });
  }, [rankedSessions, resultFilter, studentSearchQuery, studentSortBy, studentSortOrder]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRankedSessions.length / pageSize));
  const paginatedRankedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRankedSessions.slice(start, start + pageSize);
  }, [filteredRankedSessions, currentPage, pageSize]);

  // Executive summary metrics (synchronized with HistoryView)
  const summaryMetrics = useMemo(() => {
    const total = rankedSessions.length;
    // Consider all candidate attempts for evaluation so unsubmitted tests with evaluated marks are included!
    const evaluationBase = rankedSessions;
    const passedCount = evaluationBase.filter((r) => r.data.isPassed).length;
    const failedCount = evaluationBase.filter((r) => r.data.isFailed).length;
    const malpracticeCount = evaluationBase.filter((r) => r.data.isMalpractice).length;
    const scores = evaluationBase.map((r) => r.data.percentage);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowScore = scores.length > 0 ? Math.min(...scores) : 0;
    const evalTotal = evaluationBase.length;
    const passRate = evalTotal > 0 ? Math.round((passedCount / evalTotal) * 100) : 0;
    const failRate = evalTotal > 0 ? Math.round((failedCount / evalTotal) * 100) : 0;

    return { total, passedCount, failedCount, malpracticeCount, avgScore, highScore, lowScore, passRate, failRate };
  }, [rankedSessions]);

  // --------------------------------------------------------------------------
  // EXCEL EXPORT
  // --------------------------------------------------------------------------
  const handleExportExcel = () => {
    if (!currentAssessment) return;

    const headers = [
      'Rank',
      'Student Name',
      'Register Number',
      'Class',
      'Marks',
      'Percentage',
      'No. of Warnings',
      'Correct',
      'Wrong',
      'Unanswered',
      'Result',
    ];

    const rows = rankedSessions.map(({ session: s, rank, data }) => {
      const isMalpractice = data.isMalpractice || isMalpracticeSession(s);
      const resultText = isMalpractice
        ? 'Malpractice Exited'
        : data.isPassed
        ? 'Passed'
        : 'Failed';

      return [
        rank,
        s.candidateName || data.user?.name || 'Candidate',
        data.registerNo || s.candidateRegisterNo || 'N/A',
        data.className || 'General',
        `${data.score} / ${data.maxScore}`,
        `${data.percentage}%`,
        s.warningsCount || 0,
        data.correctCount,
        data.wrongCount,
        data.unansweredCount,
        resultText,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths for better readability in Excel
    ws['!cols'] = [
      { wch: 8 },  // Rank
      { wch: 25 }, // Student Name
      { wch: 18 }, // Register Number
      { wch: 15 }, // Class
      { wch: 12 }, // Marks
      { wch: 12 }, // Percentage
      { wch: 15 }, // No. of Warnings
      { wch: 10 }, // Correct
      { wch: 10 }, // Wrong
      { wch: 12 }, // Unanswered
      { wch: 22 }, // Result
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assessment Analytics Report');

    const cleanTitle = (currentAssessment.title || 'Assessment').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `${cleanTitle}_Report.xlsx`);
  };

  // Status Badge for Assessment Cards
  const getAssessmentStatusBadge = (status: Assessment['status'], endTime?: string) => {
    const isPastEnd = endTime && new Date(endTime).getTime() <= Date.now() && status !== 'PAUSED';
    const effectiveStatus = (status === 'ACTIVE' && isPastEnd) ? 'CLOSED' : (status || 'ACTIVE');

    if (effectiveStatus === 'ACTIVE') {
      return (
        <span className="stat-badge-variation2" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ACTIVE LIVE
        </span>
      );
    }
    if (effectiveStatus === 'CLOSED') {
      return (
        <span className="stat-badge-variation2" style={{ background: 'rgba(228, 228, 231, 0.08)', color: '#94a3b8' }}>
          CLOSED
        </span>
      );
    }
    if (effectiveStatus === 'COMPLETED' || effectiveStatus === 'ARCHIVED') {
      return (
        <span className="stat-badge-variation2" style={{ background: 'rgba(228, 228, 231, 0.08)', color: '#e4e4e7' }}>
          COMPLETED
        </span>
      );
    }
    if (effectiveStatus === 'DRAFT') {
      return (
        <span className="stat-badge-variation2" style={{ background: 'rgba(228, 228, 231, 0.05)', color: 'rgba(228, 228, 231, 0.4)' }}>
          DRAFT
        </span>
      );
    }
    return (
      <span className="stat-badge-variation2" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
        UPCOMING
      </span>
    );
  };

  // ==========================================================================
  // VIEW 1: ASSESSMENT SELECTION SCREEN (Assessment Selection First)
  // ==========================================================================
  if (!currentAssessment) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header matching Variation 2 */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
          <div>
            <span className="label-mono block mb-1">Assessment Analytics &amp; Reports</span>
            <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
              Class Performance
            </h1>
            <p className="text-zinc-400 text-sm">
              Select an assessment to evaluate scores, ranks, and outcomes.
            </p>
          </div>

          
        </div>

        {/* Filter Bar matching Variation 2 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={assessmentSearchQuery}
              onChange={(e) => setAssessmentSearchQuery(e.target.value)}
              placeholder="Search assessments, test IDs, or classes..."
              className="w-full bg-[#141417] border border-white/10 px-4 py-2.5 rounded text-sm text-[#e4e4e7] placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition font-sans"
            />
            {assessmentSearchQuery && (
              <button
                onClick={() => setAssessmentSearchQuery('')}
                className="absolute right-3 top-3 text-xs text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={assessmentClassFilter}
            onChange={(e) => setAssessmentClassFilter(e.target.value)}
            className="sm:w-48 bg-[#141417] border border-white/10 px-4 py-2.5 rounded text-xs text-[#e4e4e7] focus:outline-none focus:border-indigo-500 transition font-sans cursor-pointer"
          >
            <option value="ALL" className="bg-[#141417] text-[#e4e4e7]">
              All Classes ({facultyClasses.length})
            </option>
            {facultyClasses.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#141417] text-[#e4e4e7]">
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={assessmentStatusFilter}
            onChange={(e) => setAssessmentStatusFilter(e.target.value)}
            className="sm:w-40 bg-[#141417] border border-white/10 px-4 py-2.5 rounded text-xs text-[#e4e4e7] focus:outline-none focus:border-indigo-500 transition font-sans cursor-pointer"
          >
            <option value="ALL" className="bg-[#141417] text-[#e4e4e7]">All Statuses</option>
            <option value="ACTIVE" className="bg-[#141417] text-[#e4e4e7]">Active Live</option>
            <option value="COMPLETED" className="bg-[#141417] text-[#e4e4e7]">Completed</option>
            <option value="UPCOMING" className="bg-[#141417] text-[#e4e4e7]">Upcoming</option>
            <option value="DRAFT" className="bg-[#141417] text-[#e4e4e7]">Draft</option>
          </select>

          <select
            value={assessmentSortBy}
            onChange={(e) => setAssessmentSortBy(e.target.value as any)}
            className="sm:w-40 bg-[#141417] border border-white/10 px-4 py-2.5 rounded text-xs text-[#e4e4e7] focus:outline-none focus:border-indigo-500 transition font-sans cursor-pointer"
          >
            <option value="DATE_DESC" className="bg-[#141417] text-[#e4e4e7]">Newest First</option>
            <option value="DATE_ASC" className="bg-[#141417] text-[#e4e4e7]">Oldest First</option>
            <option value="TITLE" className="bg-[#141417] text-[#e4e4e7]">Title (A-Z)</option>
            <option value="CANDIDATES" className="bg-[#141417] text-[#e4e4e7]">Most Candidates</option>
          </select>
        </div>

        {/* Assessment Cards Grid matching Variation 2 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span className="label-mono">
              Showing {filteredAssessments.length} assessment{filteredAssessments.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredAssessments.length === 0 ? (
            <div className="card-variation2 p-12 text-center space-y-3">
              <FileSpreadsheet className="w-12 h-12 text-zinc-600 mx-auto" />
              <h3 className="text-base font-bold text-zinc-300 font-display">No Assessment Reports Found</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                No assessments match your current filters or are assigned to your designated classroom.
              </p>
              {(assessmentSearchQuery || assessmentClassFilter !== 'ALL' || assessmentStatusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setAssessmentSearchQuery('');
                    setAssessmentClassFilter('ALL');
                    setAssessmentStatusFilter('ALL');
                  }}
                  className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer uppercase tracking-wider font-mono"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssessments.map((asm) => {
                const targetClass = classes.find((c) => c.id === asm.classId);
                const asmCandidateSessions = sessions.filter((s) => s.assessmentId === asm.id);
                const completedCandidateSessions = asmCandidateSessions.filter(isCandidateSessionCompleted);
                const passing = asm.passingScore !== undefined && asm.passingScore !== null ? asm.passingScore : 50;
                const asmQuestions = (asm.questions && asm.questions.length > 0)
                  ? asm.questions
                  : (asm.questionIds && asm.questionIds.length > 0 && questions.length > 0
                      ? asm.questionIds.map((qid) => questions.find((q) => q.id === qid)).filter(Boolean) as Question[]
                      : asm.questions || questions || []);
                const passedCount = completedCandidateSessions.filter((s) => {
                  const m = getCandidateSessionMetrics(s, submissions, asm, asmQuestions, results, passing);
                  return m.isPassed;
                }).length;
                const passRate = completedCandidateSessions.length > 0 ? Math.round((passedCount / completedCandidateSessions.length) * 100) : 0;
                const dateFormatted = new Date(asm.createdAt || asm.startTime || Date.now()).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                const formattedId = `[EXAM_${asm.id.slice(-4).toUpperCase() || '9012'}]`;

                return (
                  <div
                    key={asm.id}
                    onClick={() => handleSelectAssessment(asm.id)}
                    className="card-variation2 p-6 flex flex-col justify-between cursor-pointer group"
                  >
                    <span className="card-type-tag">
                      {asm.category || 'Exam'}
                    </span>

                    <div className="space-y-3">
                      <div>
                        {getAssessmentStatusBadge(asm.status, asm.endTime)}
                      </div>

                      <div className="pt-1">
                        <h3 className="font-display text-xl font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                          {asm.title || 'Untitled Assessment'}
                        </h3>
                        <div className="label-mono text-[10px] mt-1 text-zinc-500">
                          ID: {formattedId}
                        </div>
                      </div>

                      <div className="text-xs text-zinc-400 leading-relaxed font-sans pt-1">
                        <div>Class: <span className="text-zinc-300 font-medium">{targetClass ? targetClass.name : 'All Classes'}</span></div>
                        <div className="text-zinc-500 font-mono text-[11px] mt-0.5">
                          Date: {dateFormatted} &bull; {asm.durationMinutes || 90} mins
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-4 mt-6 border-t border-white/10 flex items-center justify-between">
                      <div className="label-mono text-[11px] text-zinc-400 font-semibold">
                        {asmCandidateSessions.length} {asmCandidateSessions.length === 1 ? 'Candidate' : 'Candidates'}
                      </div>

                      <button
                        type="button"
                        className="label-mono text-indigo-400 hover:text-indigo-300 font-bold bg-transparent border-none cursor-pointer flex items-center gap-1 group-hover:translate-x-0.5 transition"
                      >
                        <span>View Report</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: SELECTED ASSESSMENT ANALYTICS & STUDENT GRADEBOOK (Screen 2)
  // ==========================================================================
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleBackToAssessments}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Assessments</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Excel Report</span>
          </button>
        </div>
      </div>

      {/* Assessment Overview Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {currentAssessment.category || 'EXAM'}
              </span>
              <h2 className="text-xl font-bold text-white">{currentAssessment.title}</h2>
              {getAssessmentStatusBadge(currentAssessment.status, currentAssessment.endTime)}
            </div>
            <p className="text-xs text-slate-400">
              {currentAssessment.description || 'Detailed candidate scoring breakdown, passing outcomes, and integrity statistics.'}
            </p>
          </div>

          {/* Assessment Meta Badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Assigned Class</span>
                <span className="text-white font-semibold">
                  {currentAssessmentClass ? currentAssessmentClass.name : 'All Assigned'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Faculty</span>
                <span className="text-white font-semibold">{currentAssessment.facultyName || 'Instructor'}</span>
              </div>
            </div>

            {/* Minimum Pass Mark Interactive Input */}
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Pass Threshold (%)</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={minimumPassMark}
                    onChange={(e) => {
                      const nextVal = Number(e.target.value);
                      setMinimumPassMark(nextVal);
                      if (onUpdateAssessment && currentAssessment && !isNaN(nextVal) && nextVal >= 0 && nextVal <= 100) {
                        onUpdateAssessment({ ...currentAssessment, passingScore: nextVal });
                      }
                    }}
                    className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-white font-mono font-bold text-center focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-400 text-xs">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Total Candidates</span>
            <div className="text-2xl font-bold text-white font-mono mt-0.5">{summaryMetrics.total}</div>
            <span className="text-[10px] text-slate-500">Attempted Exam</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-emerald-400 font-medium">Passed Students</span>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-0.5">{summaryMetrics.passedCount}</div>
            <span className="text-[10px] text-emerald-500 font-semibold">{summaryMetrics.passRate}% Pass Rate</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-rose-400 font-medium">Failed Students</span>
            <div className="text-2xl font-bold text-rose-400 font-mono mt-0.5">{summaryMetrics.failedCount}</div>
            <span className="text-[10px] text-rose-500 font-semibold">{summaryMetrics.failRate}% Fail Rate</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-amber-400 font-medium">Malpractice Exits</span>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-0.5">{summaryMetrics.malpracticeCount}</div>
            <span className="text-[10px] text-slate-500">Terminated</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-sky-400 font-medium">Class Average</span>
            <div className="text-2xl font-bold text-sky-400 font-mono mt-0.5">{summaryMetrics.avgScore}%</div>
            <span className="text-[10px] text-slate-500">Mean Score</span>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-indigo-400 font-medium">Highest / Lowest</span>
            <div className="text-lg font-bold text-white font-mono mt-1">
              <span className="text-emerald-400">{summaryMetrics.highScore}%</span> / <span className="text-rose-400">{summaryMetrics.lowScore}%</span>
            </div>
            <span className="text-[10px] text-slate-500">Range</span>
          </div>
        </div>
      </div>

      {/* Student Search & Filter Controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={studentSearchQuery}
              onChange={(e) => {
                setStudentSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search candidate by name, register/roll number, or email..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {studentSearchQuery && (
              <button
                onClick={() => setStudentSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Outcome Filter Buttons */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['ALL', 'PASSED', 'FLAGGED', 'FAILED'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setResultFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  resultFilter === filter
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {filter === 'ALL' && 'All Results'}
                {filter === 'PASSED' && `Passed (≥${passingScore}%)`}
                {filter === 'FLAGGED' && 'Flagged / High Risk'}
                {filter === 'FAILED' && `Failed (<${passingScore}%)`}
              </button>
            ))}
          </div>
        </div>

        {/* Second Row: Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Sort by:</span>
            <select
              value={studentSortBy}
              onChange={(e) => setStudentSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="RANK">Rank (#1 to #{rankedSessions.length})</option>
              <option value="SCORE">Marks Obtained</option>
              <option value="PERCENTAGE">Percentage (%)</option>
              <option value="CORRECT">Correct Answers Count</option>
              <option value="NAME">Student Name (A-Z)</option>
              <option value="ROLL">Register / Roll No</option>
            </select>

            <button
              onClick={() => setStudentSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'))}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="Toggle Sort Order"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-slate-400">
            Showing <strong className="text-white">{filteredRankedSessions.length}</strong> matching candidate records
          </div>
        </div>
      </div>

      {/* Student Gradebook Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
                <th className="p-4">Rank</th>
                <th className="p-4">Student Name</th>
                <th className="p-4">Register Number</th>
                <th className="p-4">Class</th>
                <th className="p-4">Marks</th>
                <th className="p-4">Percentage</th>
                <th className="p-4 text-center">No. of Warnings</th>
                <th className="p-4">Correct</th>
                <th className="p-4">Wrong</th>
                <th className="p-4">Unanswered</th>
                <th className="p-4">Result</th>
                <th className="p-4 text-right">Detailed Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {isLoadingReport ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                    <span>Loading assessment performance records...</span>
                  </td>
                </tr>
              ) : paginatedRankedSessions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Users className="w-10 h-10 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-300">No Student Records Found</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        No candidates matching your search or result filters were found for this assessment.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRankedSessions.map(({ session, rank, data }) => {
                  return (
                    <tr key={session.id} className="hover:bg-slate-800/40 transition">
                      {/* 1. Rank */}
                      <td className="p-4 font-mono font-bold">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                            rank === 1
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : rank === 2
                              ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                              : rank === 3
                              ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                              : 'bg-slate-950 text-slate-400 border border-slate-800'
                          }`}
                        >
                          #{rank}
                        </span>
                      </td>

                      {/* 2. Student Name & Email */}
                      <td className="p-4">
                        <div className="flex items-center space-x-2.5">
                          <UserAvatar
                            name={session.candidateName || data.user?.name || 'Candidate'}
                            avatarUrl={data.user?.avatar || (session as any).candidateAvatar || (session as any).photoUrl || (session as any).avatar}
                            sizeClassName="w-7 h-7"
                            textClassName="text-xs"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white">{session.candidateName || data.user?.name || 'Candidate'}</span>
                              {session.attemptNumber && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  Attempt #{session.attemptNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">{session.candidateEmail || data.user?.email || 'N/A'}</div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Register / Roll Number */}
                      <td className="p-4 font-mono font-bold text-indigo-400 uppercase">
                        {data.registerNo}
                      </td>

                      {/* 4. Class */}
                      <td className="p-4">
                        <div className="text-slate-200 font-medium">{data.className}</div>
                      </td>

                      {/* 5. Marks / Score */}
                      <td className="p-4 font-mono font-bold text-white">
                        {data.score} <span className="text-slate-500 font-normal text-[11px]">/ {data.maxScore}</span>
                      </td>

                      {/* 6. Percentage */}
                      <td className="p-4 font-mono font-bold">
                        <span
                          className={`${
                            data.percentage >= passingScore ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {data.percentage}%
                        </span>
                      </td>

                      {/* No. of Warnings */}
                      <td className="p-4 font-mono font-bold text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                            session.warningsCount >= 3
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : session.warningsCount > 0
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-slate-950 text-slate-300 border-slate-800'
                          }`}
                        >
                          {session.warningsCount || 0}
                        </span>
                      </td>

                      {/* 7. Correct Answers */}
                      <td className="p-4 font-mono font-bold text-emerald-400">
                        {data.correctCount}
                      </td>

                      {/* 8. Wrong Answers */}
                      <td className="p-4 font-mono font-bold text-rose-400">
                        {data.wrongCount}
                      </td>

                      {/* 9. Unanswered Questions */}
                      <td className="p-4 font-mono font-bold text-slate-400">
                        {data.unansweredCount}
                      </td>

                      {/* 10. Result / Status */}
                      <td className="p-4">
                        {data.isMalpractice ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            Malpractice Exit
                          </span>
                        ) : data.isPassed ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Passed
                            </span>
                            {!isCandidateSessionCompleted(session) && (
                              <span className="text-[9px] text-amber-400 font-mono">Unsubmitted (Evaluated)</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <XCircle className="w-3 h-3 text-rose-400" />
                              Failed
                            </span>
                            {!isCandidateSessionCompleted(session) && (
                              <span className="text-[9px] text-amber-400 font-mono">Unsubmitted (Evaluated)</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 11. Detailed Report Action */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setRestartModalSession(session)}
                            title="Grant +1 retake attempt for student (preserves past history)"
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 font-semibold text-xs border border-amber-500/25 hover:border-amber-500/40 transition inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Grant Retake</span>
                          </button>
                          <button
                            onClick={() => setDetailedReportSession(session)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-semibold text-xs border border-indigo-500/30 transition inline-flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detailed Report</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredRankedSessions.length > pageSize && (
          <div className="bg-slate-950 border-t border-slate-800 p-4 flex items-center justify-between text-xs">
            <div className="text-slate-400">
              Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({filteredRankedSessions.length} students)
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                    currentPage === i + 1
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL: STUDENT DETAILED PERFORMANCE REPORT (Screen 3) */}
      {/* ===================================================================== */}
      {detailedReportSession && (() => {
        const studentData = getStudentReportData(detailedReportSession);
        const questions = resolvedQuestions;
        const studentRank = rankedSessions.find((r) => r.session.id === detailedReportSession.id)?.rank || 1;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <UserAvatar
                    name={detailedReportSession.candidateName || studentData.user?.name || 'Candidate'}
                    avatarUrl={studentData.user?.avatar || (detailedReportSession as any).candidateAvatar || (detailedReportSession as any).photoUrl || (detailedReportSession as any).avatar}
                    sizeClassName="w-10 h-10"
                    textClassName="text-sm"
                  />
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{detailedReportSession.candidateName || studentData.user?.name || 'Candidate Performance'}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                        {studentData.registerNo}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        Rank #{studentRank}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {detailedReportSession.candidateEmail || studentData.user?.email} • {studentData.className}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setRestartModalSession(detailedReportSession)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="Grant +1 retake attempt for student"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Grant Retake (+1 Attempt)</span>
                  </button>
                  <button
                    onClick={() => setDetailedReportSession(null)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {/* Score & Analytics summary */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Score</span>
                    <div className="text-2xl font-bold text-white font-mono">
                      {studentData.score} <span className="text-xs text-slate-500 font-normal">/ {studentData.maxScore}</span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Percentage</span>
                    <div className={`text-2xl font-bold font-mono ${studentData.percentage >= passingScore ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {studentData.percentage}%
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">No. of Warnings</span>
                    <div className={`text-2xl font-bold font-mono ${detailedReportSession.warningsCount >= 3 ? 'text-rose-400' : detailedReportSession.warningsCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {detailedReportSession.warningsCount || 0}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Outcome</span>
                    <div className="text-sm font-bold mt-1">
                      {studentData.isMalpractice ? (
                        <span className="text-rose-400">Terminated (Malpractice)</span>
                      ) : studentData.isPassed ? (
                        <span className="text-emerald-400">Passed (≥{passingScore}%)</span>
                      ) : (
                        <span className="text-rose-400">Failed (&lt;{passingScore}%)</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Answers Distribution</span>
                    <div className="text-xs font-mono font-bold mt-1 text-slate-300">
                      <span className="text-emerald-400">{studentData.correctCount} Correct</span> • <span className="text-rose-400">{studentData.wrongCount} Wrong</span> • <span className="text-slate-400">{studentData.unansweredCount} Unanswered</span>
                    </div>
                  </div>
                </div>

                {/* Question-by-Question Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    <span>Question Breakdown & Submissions ({questions.length || studentData.studentSubs.length})</span>
                  </h4>

                  {questions.length > 0 ? (
                    <div className="space-y-3">
                      {questions.map((q, idx) => {
                        const sub = studentData.studentSubs.find((s) => s.questionId === q.id);
                        const qMax = getQuestionMaxMarks(q, currentAssessment);
                        const rawScore = sub?.score !== undefined && sub?.score !== null ? Number(sub.score) : 0;
                        const subScore = sub
                          ? (sub.maxScore && sub.maxScore > qMax && rawScore > qMax
                              ? Math.round((rawScore / sub.maxScore) * qMax)
                              : Math.min(rawScore, qMax))
                          : 0;
                        const isCorrect = Boolean(sub && (sub.status === 'Accepted' || subScore >= qMax));
                        const isAttempted = Boolean(sub);

                        return (
                          <div key={q.id || idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="font-bold text-white text-xs flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300">
                                    Q{idx + 1}
                                  </span>
                                  <span>{q.title}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                    {q.type || 'CODING'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedQuestionForDetail(q)}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-[10px] flex items-center gap-1 transition cursor-pointer"
                                    title="View Full Question Details"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Details</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isCorrect ? (
                                  <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Correct ({subScore}/{qMax} pts)
                                  </span>
                                ) : isAttempted ? (
                                  <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                    <XCircle className="w-3 h-3" />
                                    Wrong ({subScore}/{qMax} pts)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                    Unanswered (0/{qMax} pts)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Question Problem Statement */}
                            <p className="text-[11px] text-slate-400 line-clamp-2">
                              {q.problemStatement}
                            </p>

                            {/* Submission Details if Attempted */}
                            {sub && (
                              <div className="space-y-2 pt-2 border-t border-slate-900">
                                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono">
                                  <span>Status: <strong className="text-white">{sub.status}</strong></span>
                                  <span>Lang: <strong className="text-indigo-400">{sub.language}</strong></span>
                                  <span>Exec Time: {sub.executionTimeMs}ms</span>
                                  <span>Test Cases: <strong className="text-emerald-400">{sub.testCasesPassed ?? (isCorrect ? (sub.totalTestCases || q.testCases?.length || 1) : 0)} / {sub.totalTestCases || q.testCases?.length || 1}</strong></span>
                                </div>

                                {sub.sourceCode && (
                                  <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-32">
                                    {sub.sourceCode}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : studentData.studentSubs.length > 0 ? (
                    <div className="space-y-3">
                      {studentData.studentSubs.map((sub, idx) => (
                        <div key={sub.id || idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{sub.questionTitle || `Question #${idx + 1}`}</span>
                            <span
                              className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                sub.status === 'Accepted'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {sub.status} • {sub.score}/{sub.maxScore} pts
                            </span>
                          </div>
                          {sub.sourceCode && (
                            <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-32">
                              {sub.sourceCode}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500">
                      <span>No question submissions were recorded for this attempt.</span>
                    </div>
                  )}
                </div>

                {/* Proctoring Summary */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Proctoring Integrity Summary</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-400">
                    <div>Warnings: <strong className="text-amber-400">{detailedReportSession.warningsCount || 0}</strong></div>
                    <div>Proctoring Status: <strong className="text-slate-200">{(detailedReportSession.warningsCount || 0) >= 3 ? 'FLAGGED' : 'VERIFIED'}</strong></div>
                    <div>Infractions Logged: <strong className="text-white">{detailedReportSession.proctoringEvents?.length || 0}</strong></div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setDetailedReportSession(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* QUESTION DETAIL MODAL */}
      <QuestionDetailModal
        question={selectedQuestionForDetail}
        isOpen={Boolean(selectedQuestionForDetail)}
        onClose={() => setSelectedQuestionForDetail(null)}
      />

      {/* RESTART TEST MODAL */}
      <RestartTestModal
        isOpen={Boolean(restartModalSession)}
        onClose={() => setRestartModalSession(null)}
        assessment={
          currentAssessment ||
          (restartModalSession
            ? assessments.find((a) => a.id === restartModalSession.assessmentId) || null
            : null)
        }
        session={restartModalSession}
        candidateUser={
          restartModalSession
            ? users.find((u) => u.id === restartModalSession.candidateId) || null
            : null
        }
        onConfirmRestart={async (asmId, candId, sessId, opts) => {
          if (onRestartTest) {
            await onRestartTest(asmId, candId, sessId, opts);
          }
        }}
      />
    </div>
  );
};
