import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Search,
  AlertTriangle,
  Clock,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  History as HistoryIcon,
  Users,
  Building2,
  GraduationCap,
  Award,
  ShieldCheck,
  RefreshCw,
  FileText,
  HardDrive,
  Calendar,
  Download,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Filter,
  ArrowUpDown,
  BookOpen,
  Code2,
  Check,
  X,
  FileCode2,
  ExternalLink,
  Monitor,
  RotateCcw,
} from 'lucide-react';
import {
  Assessment,
  CandidateSession,
  Classroom,
  User,
  SystemSettings,
  Submission,
  ProctoringEvent,
  Question,
  Result,
} from '../../types';
import { createDemoCameraStream, DemoStreamController } from '../../services/demoStream';
import { getSessionVideo, calculateRetentionStatus } from '../../services/videoStorage';
import { fetchSessionScreenVideoApi, RecordingTimelineEvent } from '../../services/api';
import { RestartTestModal, RestartTestOptions } from './RestartTestModal';
import {
  getLatestCandidateSubmissions,
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  getCandidateSessionMetrics,
  getQuestionMaxMarks,
} from '../../utils/submissionUtils';

interface HistoryViewProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  classes: Classroom[];
  users: User[];
  currentUser: User;
  onInspectCandidate: (sessionId: string) => void;
  systemSettings?: SystemSettings;
  submissions?: Submission[];
  questions?: Question[];
  results?: Result[];
  initialStatusFilter?: 'ALL' | 'SUBMITTED' | 'IN_PROGRESS' | 'FLAGGED' | 'PASSED' | 'FAILED';
  onRestartTest?: (
    assessmentId: string,
    candidateId: string,
    sessionId?: string,
    options?: RestartTestOptions
  ) => Promise<void> | void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  assessments = [],
  sessions = [],
  classes = [],
  users = [],
  currentUser,
  onInspectCandidate,
  systemSettings,
  submissions = [],
  questions = [],
  results = [],
  initialStatusFilter = 'ALL',
  onRestartTest,
}) => {
  // 1. ASSESSMENT SELECTION FIRST STATE
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Filters for Assessment Selection Screen
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [assessmentClassFilter, setAssessmentClassFilter] = useState<string>('ALL');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<string>('ALL');
  const [assessmentSortBy, setAssessmentSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'TITLE' | 'CANDIDATES'>('DATE_DESC');

  // Filters & State for Student List View (after assessment is selected)
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('ALL');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'IN_PROGRESS' | 'FLAGGED' | 'PASSED' | 'FAILED'>(initialStatusFilter);
  const [studentSortBy, setStudentSortBy] = useState<'DATE' | 'NAME' | 'ROLL' | 'DURATION' | 'SCORE'>('DATE');
  const [studentSortOrder, setStudentSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Refresh & UI States
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Modals & Inspection States
  const [activeRecordedTest, setActiveRecordedTest] = useState<Assessment | null>(null);
  const [selectedCandidateSession, setSelectedCandidateSession] = useState<CandidateSession | null>(null);
  const [detailModalSession, setDetailModalSession] = useState<CandidateSession | null>(null);
  const [restartModalSession, setRestartModalSession] = useState<CandidateSession | null>(null);

  // Playback Channel: Webcam vs Desktop Screen Recording
  const [playbackChannel, setPlaybackChannel] = useState<'camera' | 'screen'>('camera');

  // Video Player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const demoStreamControllerRef = useRef<DemoStreamController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  // Video Retention Policy State for Selected Session Playback
  const [storedVideoUrl, setStoredVideoUrl] = useState<string | null>(null);
  const [screenTimelineEvents, setScreenTimelineEvents] = useState<RecordingTimelineEvent[]>([]);
  const [retentionInfo, setRetentionInfo] = useState<{
    isExpired: boolean;
    daysRemaining: number;
    formattedExpiry: string;
    retentionDays: number;
    sizeBytes?: number;
  }>({
    isExpired: false,
    daysRemaining: 15,
    formattedExpiry: '',
    retentionDays: 15,
  });

  // --------------------------------------------------------------------------
  // ACCESS CONTROL: Resolve Authorized Assessments for logged in User
  // --------------------------------------------------------------------------
  const authorizedAssessments = useMemo(() => {
    if (currentUser.role === 'ADMIN') {
      return assessments;
    }
    if (currentUser.role === 'FACULTY') {
      // Find all classes assigned to this faculty
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
    // Candidate role fallback
    return assessments.filter(
      (a) => a.candidateIds?.includes(currentUser.id) || sessions.some((s) => s.assessmentId === a.id && s.candidateId === currentUser.id)
    );
  }, [assessments, currentUser, classes, sessions]);

  // List of faculty assigned classes for class filter dropdown
  const facultyClasses = useMemo(() => {
    if (currentUser.role === 'ADMIN') return classes;
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
          const matchDesc = (a.description || '').toLowerCase().includes(q);
          return matchTitle || matchId || matchFaculty || matchClass || matchDept || matchDesc;
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
  // SELECTED ASSESSMENT & ASSOCIATED STUDENTS
  // --------------------------------------------------------------------------
  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentId) return null;
    return authorizedAssessments.find((a) => a.id === selectedAssessmentId) || null;
  }, [selectedAssessmentId, authorizedAssessments]);

  const selectedAssessmentClass = useMemo(() => {
    if (!selectedAssessment?.classId) return null;
    return classes.find((c) => c.id === selectedAssessment.classId) || null;
  }, [selectedAssessment, classes]);

  // Handle Assessment Selection Transition
  const handleSelectAssessment = (asmId: string) => {
    setIsLoadingStudents(true);
    setSelectedAssessmentId(asmId);
    setStudentSearchQuery('');
    setStudentClassFilter('ALL');
    setStudentStatusFilter('ALL');
    setCurrentPage(1);
    setTimeout(() => {
      setIsLoadingStudents(false);
    }, 250);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessmentId(null);
    setDetailModalSession(null);
    setActiveRecordedTest(null);
    setSelectedCandidateSession(null);
  };

  // --------------------------------------------------------------------------
  // CANDIDATE SESSIONS FOR THE SELECTED ASSESSMENT (Strict Data Isolation)
  // --------------------------------------------------------------------------
  const assessmentSessions = useMemo(() => {
    if (!selectedAssessment) return [];
    return sessions.filter((s) => s.assessmentId === selectedAssessment.id);
  }, [selectedAssessment, sessions]);

  // Resolved Questions pool: prioritize assessment.questions, then lookup questionIds from questions bank
  const resolvedQuestions = useMemo(() => {
    if (selectedAssessment?.questions && selectedAssessment.questions.length > 0) {
      return selectedAssessment.questions;
    }
    if (selectedAssessment?.questionIds && selectedAssessment.questionIds.length > 0 && questions && questions.length > 0) {
      const matched = selectedAssessment.questionIds
        .map((qid) => questions.find((q) => q.id === qid))
        .filter(Boolean) as Question[];
      if (matched.length > 0) return matched;
    }
    return selectedAssessment?.questions || questions || [];
  }, [selectedAssessment, questions]);

  // Helper for student metadata
  const getStudentMeta = (candidateId: string) => {
    const user = users.find((u) => u.id === candidateId);
    const userClass = classes.find(
      (c) =>
        (c.studentIds && c.studentIds.includes(candidateId)) ||
        (user?.classIds && user.classIds.includes(c.id))
    );
    return {
      user,
      registerNo: user?.registerNumber || user?.registerNo || user?.rollNumber || 'REG-STD',
      className: userClass ? userClass.name : selectedAssessmentClass?.name || 'General',
      section: userClass?.section || selectedAssessmentClass?.section || user?.section || 'A',
      department: user?.department || userClass?.department || selectedAssessmentClass?.department || 'Computer Science',
    };
  };

  // Format Duration Helper
  const formatDurationMs = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return '00:00';
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const diffSecs = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // Filter & Sort Student Sessions for Selected Assessment
  const filteredStudentSessions = useMemo(() => {
    if (!selectedAssessment) return [];

    const passingScore = selectedAssessment.passingScore ?? 50;

    return assessmentSessions
      .filter((s) => {
        const meta = getStudentMeta(s.candidateId);

        // Class filter
        if (studentClassFilter !== 'ALL') {
          const userClass = classes.find((c) => c.studentIds?.includes(s.candidateId) || s.candidateId === c.id);
          if (userClass?.id !== studentClassFilter && selectedAssessment.classId !== studentClassFilter) {
            return false;
          }
        }

        // Status Filter
        const isFlagged =
          (s.warningsCount ?? (s.flags?.length || s.proctoringEvents?.length || 0)) >= 3 ||
          s.state === 'FLAGGED' ||
          s.state === 'TERMINATED_MALPRACTICE' ||
          (s as any).submissionStatus === 'TERMINATED_MALPRACTICE' ||
          s.riskCategory === 'MALPRACTICE_TERMINATED' ||
          Boolean(
            s.exitReason &&
              (s.exitReason.toLowerCase().includes('malpractice') ||
                s.exitReason.toLowerCase().includes('warnings exceeded') ||
                s.exitReason.toLowerCase().includes('tab switch') ||
                s.exitReason.toLowerCase().includes('alt+tab') ||
                s.exitReason.toLowerCase().includes('auto submit'))
          );
        const metrics = getCandidateSessionMetrics(
          s,
          submissions,
          selectedAssessment,
          resolvedQuestions,
          results,
          passingScore
        );

        const sMax = getAssessmentTotalMaxMarks(selectedAssessment, s, selectedAssessment?.questions);
        const sScore = getSessionTotalMarksObtained(s, submissions, selectedAssessment, selectedAssessment?.questions);
        const sPct = sMax > 0 ? (sScore / sMax) * 100 : 0;
        const isPassed = !isFlagged && (sPct >= passingScore || sScore >= passingScore);
        const isFailed = !isFlagged && !isPassed;

        if (studentStatusFilter === 'SUBMITTED' && s.state !== 'SUBMITTED') return false;
        if (studentStatusFilter === 'IN_PROGRESS' && s.state === 'SUBMITTED') return false;
        if (studentStatusFilter === 'FLAGGED' && !isFlagged) return false;
        if (studentStatusFilter === 'PASSED' && !isPassed) return false;
        if (studentStatusFilter === 'FAILED' && !isFailed) return false;
        if (studentStatusFilter === 'FLAGGED' && !metrics.isMalpractice && (s.warningsCount || 0) < 3) return false;
        if (studentStatusFilter === 'PASSED' && !metrics.isPassed) return false;
        if (studentStatusFilter === 'FAILED' && !metrics.isFailed) return false;

        // Search Query
        if (studentSearchQuery.trim()) {
          const q = studentSearchQuery.toLowerCase();
          const matchName = (s.candidateName || meta.user?.name || '').toLowerCase().includes(q);
          const matchEmail = (s.candidateEmail || meta.user?.email || '').toLowerCase().includes(q);
          const matchReg = meta.registerNo.toLowerCase().includes(q) || (s.candidateRegisterNo || '').toLowerCase().includes(q);
          const matchClass = meta.className.toLowerCase().includes(q);
          return matchName || matchEmail || matchReg || matchClass;
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (studentSortBy === 'NAME') {
          comp = (a.candidateName || '').localeCompare(b.candidateName || '');
        } else if (studentSortBy === 'ROLL') {
          const regA = getStudentMeta(a.candidateId).registerNo;
          const regB = getStudentMeta(b.candidateId).registerNo;
          comp = regA.localeCompare(regB);
        } else if (studentSortBy === 'SCORE') {
          const scoreA = getCandidateSessionMetrics(a, submissions, selectedAssessment, resolvedQuestions, results).score;
          const scoreB = getCandidateSessionMetrics(b, submissions, selectedAssessment, resolvedQuestions, results).score;
          comp = scoreA - scoreB;
        } else if (studentSortBy === 'DURATION') {
          const durA = (new Date(a.completedAt || a.startedAt || 0).getTime()) - (new Date(a.startedAt || 0).getTime());
          const durB = (new Date(b.completedAt || b.startedAt || 0).getTime()) - (new Date(b.startedAt || 0).getTime());
          comp = durA - durB;
        } else {
          // DATE
          const dateA = new Date(a.startedAt || a.completedAt || 0).getTime();
          const dateB = new Date(b.startedAt || b.completedAt || 0).getTime();
          comp = dateA - dateB;
        }
        return studentSortOrder === 'ASC' ? comp : -comp;
      });
  }, [
    selectedAssessment,
    assessmentSessions,
    studentClassFilter,
    studentStatusFilter,
    studentSearchQuery,
    studentSortBy,
    studentSortOrder,
    users,
    classes,
    submissions,
    resolvedQuestions,
    results,
  ]);

  // Pagination for Student Table
  const totalPages = Math.max(1, Math.ceil(filteredStudentSessions.length / pageSize));
  const paginatedStudentSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudentSessions.slice(start, start + pageSize);
  }, [filteredStudentSessions, currentPage, pageSize]);

  // Quick stats for selected assessment
  const selectedAsmStats = useMemo(() => {
    const assessmentMaxMarks = selectedAssessment
      ? getAssessmentTotalMaxMarks(selectedAssessment, null, resolvedQuestions)
      : 100;

    if (!selectedAssessment)
      return { total: 0, completed: 0, inProgress: 0, flagged: 0, avgScore: 0, passRate: 0, maxMarks: 100 };

    const total = assessmentSessions.length;
    const completedSessions = assessmentSessions.filter(
      (s) => s.state === 'SUBMITTED' || s.state === 'AUTO_SUBMITTED' || s.completedAt || s.state === 'TERMINATED_MALPRACTICE'
    );
    const completed = completedSessions.length;
    const inProgress = assessmentSessions.filter((s) => {
      const isFinished = s.state === 'SUBMITTED' || s.state === 'AUTO_SUBMITTED' || s.completedAt || s.state === 'TERMINATED_MALPRACTICE' || s.state === 'CLOSED';
      return !isFinished && s.isActive !== false && s.connectionStatus !== 'DISCONNECTED' && (s.state === 'ACTIVE' || s.state === 'IN_PROGRESS' || s.state === 'ENVIRONMENT_CHECK');
    }).length;

    const passingScore =
      selectedAssessment.passingScore !== undefined && selectedAssessment.passingScore !== null
        ? selectedAssessment.passingScore
        : 50;

    let totalScoreSum = 0;
    let passedCount = 0;
    let flaggedCount = 0;

    completedSessions.forEach((s) => {
      const m = getCandidateSessionMetrics(s, submissions, selectedAssessment, resolvedQuestions, results, passingScore);
      totalScoreSum += m.score;
      if (m.isPassed) passedCount++;
      if (m.isMalpractice || (s.warningsCount ?? (s.flags?.length || s.proctoringEvents?.length || 0)) >= 3) {
        flaggedCount++;
      }
    });

    const avgScore = completedSessions.length > 0 ? Math.min(assessmentMaxMarks, Math.round(totalScoreSum / completedSessions.length)) : 0;
    const passRate = completedSessions.length > 0 ? Math.round((passedCount / completedSessions.length) * 100) : 0;

    return { total, completed, inProgress, flagged: flaggedCount, avgScore, passRate, maxMarks: assessmentMaxMarks };
  }, [selectedAssessment, assessmentSessions, submissions, resolvedQuestions, results]);

  // --------------------------------------------------------------------------
  // VIDEO PLAYBACK & RETENTION EFFECTS
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedCandidateSession) {
      setStoredVideoUrl(null);
      return;
    }

    const configuredDays =
      systemSettings?.videoRetentionDays ||
      selectedCandidateSession.videoRetentionDays ||
      15;

    let isMounted = true;
    const storageKey = playbackChannel === 'screen'
      ? `${selectedCandidateSession.id}_screen`
      : selectedCandidateSession.id;
    const directUrl = playbackChannel === 'screen'
      ? selectedCandidateSession.screenVideoUrl
      : selectedCandidateSession.proctoringVideoUrl;

    getSessionVideo(storageKey, configuredDays)
      .then(async (res) => {
        if (!isMounted) return;
        if (res) {
          setStoredVideoUrl(res.url);
          setRetentionInfo({
            isExpired: res.isExpired,
            daysRemaining: res.daysRemaining,
            formattedExpiry: res.formattedExpiry,
            retentionDays: configuredDays,
            sizeBytes: res.record?.sizeBytes,
          });
        } else {
          let resolvedUrl = directUrl || null;
          if (playbackChannel === 'screen' && !resolvedUrl) {
            try {
              const backendScreen = await fetchSessionScreenVideoApi(selectedCandidateSession.id);
              if (backendScreen.url) {
                resolvedUrl = backendScreen.url;
              }
              if (backendScreen.timelineEvents) {
                setScreenTimelineEvents(backendScreen.timelineEvents);
              }
            } catch (err) {}
          }

          const baseDate =
            selectedCandidateSession.videoRecordedAt ||
            selectedCandidateSession.completedAt ||
            selectedCandidateSession.startedAt;
          const status = calculateRetentionStatus(baseDate, configuredDays);
          setStoredVideoUrl(resolvedUrl);
          setRetentionInfo({
            isExpired: status.isExpired,
            daysRemaining: status.daysRemaining,
            formattedExpiry: status.formattedExpiry,
            retentionDays: configuredDays,
          });
        }
      })
      .catch(async () => {
        if (!isMounted) return;
        let resolvedUrl = directUrl || null;
        if (playbackChannel === 'screen' && !resolvedUrl) {
          try {
            const backendScreen = await fetchSessionScreenVideoApi(selectedCandidateSession.id);
            if (backendScreen.url) resolvedUrl = backendScreen.url;
            if (backendScreen.timelineEvents) setScreenTimelineEvents(backendScreen.timelineEvents);
          } catch (err) {}
        }
        setStoredVideoUrl(resolvedUrl);
      });

    return () => {
      isMounted = false;
    };
  }, [
    selectedCandidateSession?.id,
    selectedCandidateSession?.proctoringVideoUrl,
    selectedCandidateSession?.screenVideoUrl,
    playbackChannel,
    systemSettings?.videoRetentionDays,
  ]);

  useEffect(() => {
    if (!activeRecordedTest) {
      if (demoStreamControllerRef.current) {
        demoStreamControllerRef.current.destroy();
        demoStreamControllerRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setVideoLoadError(false);
      return;
    }

    const testDuration = (activeRecordedTest.durationMinutes || 60) * 60;
    setDuration(testDuration);
    setCurrentTime(0);
    setIsPlaying(true);
    setVideoLoadError(false);

    const channelVideoUrl =
      playbackChannel === 'screen'
        ? (storedVideoUrl || selectedCandidateSession?.screenVideoUrl || (selectedCandidateSession ? `/api/recordings/rec_${selectedCandidateSession.id}/playback` : null))
        : (storedVideoUrl || selectedCandidateSession?.proctoringVideoUrl || '/api/recordings/stream/sample-proctoring');

    const activeVideoSrc = !retentionInfo.isExpired ? channelVideoUrl : null;
    const hasCustomUrl = Boolean(activeVideoSrc && !videoLoadError);

    if (!hasCustomUrl) {
      if (!demoStreamControllerRef.current) {
        demoStreamControllerRef.current = createDemoCameraStream();
      }
      if (videoRef.current && demoStreamControllerRef.current) {
        videoRef.current.srcObject = demoStreamControllerRef.current.stream;
        videoRef.current.play().catch(() => {});
      }
    } else {
      if (demoStreamControllerRef.current) {
        demoStreamControllerRef.current.destroy();
        demoStreamControllerRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.play().catch(() => {});
      }
    }

    return () => {
      if (demoStreamControllerRef.current) {
        demoStreamControllerRef.current.destroy();
        demoStreamControllerRef.current = null;
      }
    };
  }, [activeRecordedTest, selectedCandidateSession, videoLoadError, retentionInfo.isExpired, storedVideoUrl, playbackChannel]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Interval timer for live/demo streams where video element currentTime is static
  useEffect(() => {
    let interval: any;
    const activeVideoSrc = !retentionInfo.isExpired ? (storedVideoUrl || selectedCandidateSession?.proctoringVideoUrl) : null;
    const isLiveStream = !activeVideoSrc || videoLoadError;

    if (isPlaying && activeRecordedTest && isLiveStream) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, duration, playbackSpeed, activeRecordedTest, retentionInfo.isExpired, storedVideoUrl, videoLoadError]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('Playback error:', err);
        setIsPlaying(true); // fall back to play state
      });
    }
  };

  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, duration || 100));
    setCurrentTime(clamped);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = clamped;
      } catch (err) {
        console.warn('Seek error:', err);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  // Status Badge for Assessment Cards
  const getAssessmentStatusBadge = (status: Assessment['status'], endTime?: string) => {
    const isPastEnd = endTime && new Date(endTime).getTime() <= Date.now() && status !== 'PAUSED';
    const effectiveStatus = (status === 'ACTIVE' && isPastEnd) ? 'CLOSED' : (status || 'ACTIVE');

    if (effectiveStatus === 'ACTIVE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Active
        </span>
      );
    }
    if (effectiveStatus === 'CLOSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700/80">
          <CheckCircle2 className="w-3 h-3 text-slate-400" />
          Closed
        </span>
      );
    }
    if (effectiveStatus === 'COMPLETED' || effectiveStatus === 'ARCHIVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </span>
      );
    }
    if (effectiveStatus === 'DRAFT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
          Draft
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <Clock className="w-3 h-3" />
        Upcoming
      </span>
    );
  };

  // ==========================================================================
  // VIEW 1: ASSESSMENT SELECTION SCREEN (Assessment Selection First)
  // ==========================================================================
  if (!selectedAssessment) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
          <div>
            <span className="label-mono block mb-1">Assessment Records & Proctor Logs</span>
            <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
              Examination History
            </h1>
            <p className="text-zinc-400 text-sm">
              {currentUser.role === 'ADMIN'
                ? 'Select an assessment to inspect candidate test history and proctoring video logs.'
                : 'Select an assessment to view student test submissions and proctoring records.'}
            </p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={assessmentSearchQuery}
                onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                placeholder="Search assessments by name, subject, faculty, or classroom..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {assessmentSearchQuery && (
                <button
                  onClick={() => setAssessmentSearchQuery('')}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Class Filter */}
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Class:</span>
                <select
                  value={assessmentClassFilter}
                  onChange={(e) => setAssessmentClassFilter(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-950 text-slate-300">
                    All Assigned Classes ({facultyClasses.length})
                  </option>
                  {facultyClasses.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-950 text-slate-300">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Status:</span>
                <select
                  value={assessmentStatusFilter}
                  onChange={(e) => setAssessmentStatusFilter(e.target.value)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-950 text-slate-300">All Statuses</option>
                  <option value="ACTIVE" className="bg-slate-950 text-slate-300">Active Live</option>
                  <option value="COMPLETED" className="bg-slate-950 text-slate-300">Completed</option>
                  <option value="UPCOMING" className="bg-slate-950 text-slate-300">Upcoming</option>
                  <option value="DRAFT" className="bg-slate-950 text-slate-300">Draft</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Sort:</span>
                <select
                  value={assessmentSortBy}
                  onChange={(e) => setAssessmentSortBy(e.target.value as any)}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="DATE_DESC" className="bg-slate-950 text-slate-300">Newest First</option>
                  <option value="DATE_ASC" className="bg-slate-950 text-slate-300">Oldest First</option>
                  <option value="TITLE" className="bg-slate-950 text-slate-300">Title (A-Z)</option>
                  <option value="CANDIDATES" className="bg-slate-950 text-slate-300">Most Attempts</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Assessments Selection Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Showing <strong className="text-white">{filteredAssessments.length}</strong> accessible assessment{filteredAssessments.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[11px] text-indigo-400">Click any assessment card to view its student test records</span>
          </div>

          {filteredAssessments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileCode2 className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-300">No Authorized Assessments Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {currentUser.role === 'FACULTY'
                  ? 'No assessments are currently assigned to your designated classrooms or match the selected filter criteria.'
                  : 'No assessments match your current search and filter parameters.'}
              </p>
              {(assessmentSearchQuery || assessmentClassFilter !== 'ALL' || assessmentStatusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setAssessmentSearchQuery('');
                    setAssessmentClassFilter('ALL');
                    setAssessmentStatusFilter('ALL');
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssessments.map((asm) => {
                const targetClass = classes.find((c) => c.id === asm.classId);
                const asmCandidateSessions = sessions.filter((s) => s.assessmentId === asm.id);
                const completedCount = asmCandidateSessions.filter((s) => s.state === 'SUBMITTED' || s.state === 'AUTO_SUBMITTED' || s.completedAt || s.state === 'TERMINATED_MALPRACTICE').length;
                const flaggedCount = asmCandidateSessions.filter(
                  (s) => s.warningsCount >= 3 || s.state === 'FLAGGED' || s.state === 'TERMINATED_MALPRACTICE'
                ).length;
                const dateFormatted = new Date(asm.createdAt || asm.startTime || Date.now()).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div
                    key={asm.id}
                    onClick={() => handleSelectAssessment(asm.id)}
                    className="bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-5 space-y-4 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      {/* Card Header: Subject Tag & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-indigo-300 border border-slate-700">
                          {asm.category || targetClass?.department || 'EXAM'}
                        </span>
                        {getAssessmentStatusBadge(asm.status, asm.endTime)}
                      </div>

                      {/* Assessment Title & Description */}
                      <div>
                        <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                          {asm.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {asm.description || 'Proctored coding and algorithmic test.'}
                        </p>
                      </div>

                      {/* Meta Pills */}
                      <div className="space-y-1.5 text-xs text-slate-400">
                        {/* Class & Section */}
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-300 font-medium truncate">
                            {targetClass ? targetClass.name : 'All Assigned Classes'}
                          </span>
                        </div>

                        {/* Faculty */}
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-300 truncate">
                            Faculty: <strong>{asm.facultyName || 'Course Instructor'}</strong>
                          </span>
                        </div>

                        {/* Date & Duration */}
                        <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {dateFormatted}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {asm.durationMinutes || 60} mins
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Submissions / Action */}
                    <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Users className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="font-bold text-white font-mono">{asmCandidateSessions.length}</span>
                          <span className="text-slate-500 text-[11px]">attempted</span>
                        </div>
                        {flaggedCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            {flaggedCount} flagged
                          </span>
                        )}
                      </div>

                      <button className="flex items-center space-x-1 text-xs font-bold text-indigo-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition">
                        <span>View History</span>
                        <ChevronRight className="w-4 h-4" />
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
  // VIEW 2: STUDENT LIST VIEW (After Assessment Selection)
  // ==========================================================================
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Navigation Bar & Change Assessment */}
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

        <div className="flex items-center space-x-2">
          {getAssessmentStatusBadge(selectedAssessment.status, selectedAssessment.endTime)}
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            Pass Threshold: <strong>{selectedAssessment.passingScore ?? 50}%</strong>
          </span>
        </div>
      </div>

      {/* Assessment Summary Header Card */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 p-6 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {selectedAssessment.category || 'EXAM'}
              </span>
              <h2 className="text-xl font-bold text-white">{selectedAssessment.title}</h2>
            </div>
            <p className="text-xs text-slate-400">
              {selectedAssessment.description || 'Candidate test session records, attempt timings, and proctoring video history.'}
            </p>
          </div>

          {/* Key assessment info badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Target Class</span>
                <span className="text-white font-semibold">
                  {selectedAssessmentClass ? selectedAssessmentClass.name : 'All Assigned'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Max Marks</span>
                <span className="text-white font-semibold">{selectedAsmStats.maxMarks} Marks</span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Instructor</span>
                <span className="text-white font-semibold">{selectedAssessment.facultyName || 'Faculty'}</span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Duration</span>
                <span className="text-white font-semibold">{selectedAssessment.durationMinutes || 60} mins</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick KPI Counters for this Assessment */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Total Attempts</span>
            <div className="text-2xl font-bold text-white font-mono mt-0.5">{selectedAsmStats.total}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-emerald-400 font-medium">Submitted & Evaluated</span>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-0.5">{selectedAsmStats.completed}</div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-sky-400 font-medium">Average Marks</span>
            <div className="text-2xl font-bold text-sky-400 font-mono mt-0.5">
              {selectedAsmStats.avgScore}{' '}
              <span className="text-xs text-slate-500 font-normal">/ {selectedAsmStats.maxMarks}</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[11px] text-rose-400 font-medium">Flagged Malpractice</span>
            <div className="text-2xl font-bold text-rose-400 font-mono mt-0.5">{selectedAsmStats.flagged}</div>
          </div>
        </div>
      </div>

      {/* Student Search, Filter & Sort Controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Student */}
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

          {/* Outcome & Status Buttons */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['ALL', 'SUBMITTED', 'IN_PROGRESS', 'FLAGGED', 'PASSED', 'FAILED'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setStudentStatusFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  studentStatusFilter === filter
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {filter === 'ALL' && 'All Students'}
                {filter === 'SUBMITTED' && 'Submitted'}
                {filter === 'IN_PROGRESS' && 'In Progress'}
                {filter === 'FLAGGED' && 'Flagged / Malpractice'}
                {filter === 'PASSED' && `Passed (≥${selectedAssessment.passingScore ?? 50}%)`}
                {filter === 'FAILED' && `Failed (<${selectedAssessment.passingScore ?? 50}%)`}
              </button>
            ))}
          </div>
        </div>

        {/* Second Row: Sorting and Class Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Sort by:</span>
            <select
              value={studentSortBy}
              onChange={(e) => setStudentSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="DATE">Attempt Date/Time</option>
              <option value="NAME">Student Name (A-Z)</option>
              <option value="ROLL">Register / Roll No</option>
              <option value="DURATION">Duration Spent</option>
              <option value="SCORE">Score (Marks)</option>
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
            Showing <strong className="text-white">{filteredStudentSessions.length}</strong> matching candidate records
          </div>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono">
                <th className="p-4">Student Name</th>
                <th className="p-4">Register Number</th>
                <th className="p-4">Class</th>
                <th className="p-4">Attempt Date & Time</th>
                <th className="p-4">Duration</th>
                <th className="p-4">Submission Status</th>
                <th className="p-4">Marks Obtained</th>
                <th className="p-4 text-center">No. of Warnings</th>
                <th className="p-4">Proctor Recording</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {isLoadingStudents ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                    <span>Loading student session data...</span>
                  </td>
                </tr>
              ) : paginatedStudentSessions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Users className="w-10 h-10 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-300">No Student Records Found</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        No students have attempted this assessment matching your search or filter criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedStudentSessions.map((session) => {
                  const meta = getStudentMeta(session.candidateId);
                  const passingScore = selectedAssessment.passingScore ?? 50;

                  const metrics = getCandidateSessionMetrics(
                    session,
                    submissions,
                    selectedAssessment,
                    resolvedQuestions,
                    results,
                    passingScore
                  );
                  const maxMarks = metrics.maxScore;
                  const scoreVal = metrics.score;
                  const percentage = metrics.percentage;
                  const isPassed = metrics.isPassed;
                  const isFailed = metrics.isFailed;
                  const isMalpractice = metrics.isMalpractice;
                  const passedTC = metrics.passedTC;
                  const totalTC = metrics.totalTC;
                  const sessionSubs = metrics.latestSubmissions;

                  const hasRecording = Boolean(session.proctoringVideoUrl || session.state === 'SUBMITTED' || session.state === 'TERMINATED_MALPRACTICE');

                  return (
                    <tr key={session.id} className="hover:bg-slate-800/40 transition">
                      {/* 1. Student Name */}
                      <td className="p-4">
                        <div className="flex items-center space-x-2.5">
                          <UserAvatar
                            name={session.candidateName || meta.user?.name || 'Candidate'}
                            avatarUrl={meta.user?.avatar || (session as any).candidateAvatar || (session as any).photoUrl || (session as any).avatar}
                            sizeClassName="w-8 h-8"
                            textClassName="text-xs"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white">{session.candidateName || meta.user?.name || 'Candidate'}</span>
                              {session.attemptNumber && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  Attempt #{session.attemptNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{session.candidateEmail || meta.user?.email || 'N/A'}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Register / Roll No */}
                      <td className="p-4 font-mono font-bold text-indigo-400 uppercase">
                        {session.candidateRegisterNo || meta.registerNo}
                      </td>

                      {/* 3. Class */}
                      <td className="p-4">
                        <div className="text-slate-200 font-medium">{meta.className}</div>
                      </td>

                      {/* 4. Attempt Date / Time */}
                      <td className="p-4">
                        <div className="text-slate-200 font-medium">
                          {new Date(session.startedAt || session.completedAt || Date.now()).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {new Date(session.startedAt || session.completedAt || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* 5. Duration */}
                      <td className="p-4 font-mono text-slate-300">
                        {formatDurationMs(session.startedAt, session.completedAt)}
                      </td>

                      {/* 6. Submission Status */}
                      <td className="p-4">
                        {isMalpractice ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            Terminated (Malpractice)
                          </span>
                        ) : session.state === 'SUBMITTED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                            Submitted
                          </span>
                        ) : session.state === 'AUTO_SUBMITTED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            Auto Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300">
                            In Progress
                          </span>
                        )}
                      </td>

                      {/* 7. Marks Obtained / Max Mark */}
                      <td className="p-4">
                        {scoreVal !== undefined && scoreVal !== null ? (
                          <div className="space-y-1">
                            <div className="font-mono font-bold text-white text-sm">
                              {scoreVal} <span className="text-slate-400 font-medium text-xs">/ {maxMarks}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ({percentage}%)
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isPassed
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                              }`}
                            >
                              {isPassed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Evaluating</span>
                        )}
                      </td>

                      {/* No. of Warnings */}
                      <td className="p-4 text-center font-mono font-bold">
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

                      {/* 8. Proctor Recording */}
                      <td className="p-4">
                        {hasRecording ? (
                          <button
                            onClick={() => {
                              setSelectedCandidateSession(session);
                              setActiveRecordedTest(selectedAssessment);
                            }}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold border border-indigo-500/30 transition cursor-pointer group/rec"
                          >
                            <Video className="w-3.5 h-3.5 text-indigo-400 group-hover/rec:text-white" />
                            <span>Watch Recording</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">No Video</span>
                        )}
                      </td>

                      {/* 9. Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {onInspectCandidate && (
                            <button
                              onClick={() => onInspectCandidate(session.id)}
                              title="Inspect full proctoring recording, logs & code submissions"
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-semibold text-xs border border-indigo-500/30 hover:border-indigo-500/50 transition inline-flex items-center space-x-1 cursor-pointer shadow-sm active:scale-95"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          )}
                          <button
                            onClick={() => setRestartModalSession(session)}
                            title="Grant +1 retake attempt for student (preserves past history)"
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 font-semibold text-xs border border-amber-500/25 hover:border-amber-500/40 transition inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Grant Retake</span>
                          </button>
                          <button
                            onClick={() => setDetailModalSession(session)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 hover:border-slate-600 transition inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            <span>View Details</span>
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
        {filteredStudentSessions.length > pageSize && (
          <div className="bg-slate-950 border-t border-slate-800 p-4 flex items-center justify-between text-xs">
            <div className="text-slate-400">
              Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({filteredStudentSessions.length} students)
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
      {/* MODAL 1: STUDENT DETAILS & MALPRACTICE INSPECTION MODAL */}
      {/* ===================================================================== */}
      {detailModalSession && (() => {
        const studentMeta = getStudentMeta(detailModalSession.candidateId);
        const passingScore =
          selectedAssessment.passingScore !== undefined && selectedAssessment.passingScore !== null
            ? selectedAssessment.passingScore
            : 50;

        const modalMetrics = getCandidateSessionMetrics(
          detailModalSession,
          submissions,
          selectedAssessment,
          resolvedQuestions,
          results,
          passingScore
        );
        const modalMaxMarks = modalMetrics.maxScore;
        const modalScore = modalMetrics.score;
        const modalPercentage = modalMetrics.percentage;
        const modalPassedTC = modalMetrics.passedTC;
        const modalTotalTC = modalMetrics.totalTC;
        const isPassed = modalMetrics.isPassed;
        const studentSubmissions = modalMetrics.latestSubmissions;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <UserAvatar
                    name={detailModalSession.candidateName || studentMeta.user?.name || 'Candidate'}
                    avatarUrl={studentMeta.user?.avatar || (detailModalSession as any).candidateAvatar || (detailModalSession as any).photoUrl || (detailModalSession as any).avatar}
                    sizeClassName="w-10 h-10"
                    textClassName="text-sm"
                  />
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{detailModalSession.candidateName || studentMeta.user?.name || 'Candidate Details'}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                        {studentMeta.registerNo}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {detailModalSession.candidateEmail || studentMeta.user?.email} • {studentMeta.className}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setRestartModalSession(detailModalSession)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="Grant +1 retake attempt for student"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Grant Retake (+1 Attempt)</span>
                  </button>
                  <button
                    onClick={() => {
                      onInspectCandidate(detailModalSession.id);
                      setDetailModalSession(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Full Review Workspace</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDetailModalSession(null)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {/* Score & Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Marks Obtained / Max Mark</span>
                    <div className="text-2xl font-bold text-white font-mono">
                      {modalScore ?? 0}{' '}
                      <span className="text-xs text-slate-400 font-normal">/ {modalMaxMarks}</span>
                    </div>
                    {modalScore !== undefined && modalScore !== null && (
                      <div className="text-[10px] text-indigo-400 font-mono font-semibold">
                        {modalPercentage}% Score
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Outcome</span>
                    <div className="text-sm font-bold mt-1">
                      {detailModalSession.state === 'TERMINATED_MALPRACTICE' ? (
                        <span className="text-rose-400">Terminated (Malpractice)</span>
                      ) : isPassed ? (
                        <span className="text-emerald-400">Passed (≥{passingScore}%)</span>
                      ) : (
                        <span className="text-rose-400">Failed (&lt;{passingScore}%)</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Warnings Logged</span>
                    <div className={`text-2xl font-bold font-mono ${(detailModalSession.warningsCount || 0) >= 3 ? 'text-rose-400' : (detailModalSession.warningsCount || 0) > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {detailModalSession.warningsCount || 0}
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Proctor Status</span>
                    <div className="text-sm font-bold text-slate-200 font-mono pt-1">
                      {(detailModalSession.warningsCount || 0) >= 3 ? 'FLAGGED' : 'VERIFIED'}
                    </div>
                  </div>
                </div>

                {/* Proctoring Violations Log */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Proctoring Infractions & Alerts ({detailModalSession.proctoringEvents?.length || 0})</span>
                  </h4>

                  {detailModalSession.proctoringEvents && detailModalSession.proctoringEvents.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {detailModalSession.proctoringEvents.map((evt, idx) => (
                        <div
                          key={evt.id || idx}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-rose-400 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{evt.type.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(evt.timestamp).toLocaleString()} • Severity: <strong>{evt.severity}</strong>
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 font-mono text-[10px] border border-rose-500/20">
                            Warning
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500">
                      <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                      <span>No proctoring infractions recorded for this student attempt.</span>
                    </div>
                  )}
                </div>

                {/* Submissions & Questions Attempted */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    <span>Question Responses & Submissions ({studentSubmissions.length})</span>
                  </h4>

                  {studentSubmissions.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {studentSubmissions.map((sub, idx) => {
                        const matchedQ = resolvedQuestions.find((q) => q.id === sub.questionId);
                        const qMax = matchedQ
                          ? getQuestionMaxMarks(matchedQ, selectedAssessment)
                          : (sub.maxScore || (selectedAssessment?.isEqualMarks && selectedAssessment?.marksPerQuestion ? Number(selectedAssessment.marksPerQuestion) : 10));
                        const rawScore = sub.score !== undefined && sub.score !== null ? Number(sub.score) : 0;
                        const subScore = sub.maxScore && sub.maxScore > qMax && rawScore > qMax
                          ? Math.round((rawScore / sub.maxScore) * qMax)
                          : Math.min(rawScore, qMax);
                        const isCorrect = sub.status === 'Accepted' || subScore >= qMax;

                        return (
                          <div key={sub.id || idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-white">{sub.questionTitle || matchedQ?.title || `Question #${idx + 1}`}</div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isCorrect
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                {sub.status || (isCorrect ? 'Accepted' : 'Wrong Answer')} • {subScore} / {qMax} pts
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                              <span>Lang: {sub.language}</span>
                              <span>Time: {sub.executionTimeMs}ms</span>
                              <span>Test Cases: <strong className="text-emerald-400">{sub.testCasesPassed ?? (isCorrect ? (sub.totalTestCases || matchedQ?.testCases?.length || 1) : 0)} / {sub.totalTestCases || matchedQ?.testCases?.length || 1}</strong></span>
                            </div>

                            {sub.sourceCode && (
                              <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-32">
                                {sub.sourceCode}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500">
                      <span>No code submissions recorded for this attempt.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setDetailModalSession(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================================================================== */}
      {/* MODAL 2: HIGH FIDELITY TEST RECORDING PLAYBACK MODAL */}
      {/* ===================================================================== */}
      {activeRecordedTest && selectedCandidateSession && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Proctoring Stream: {selectedCandidateSession.candidateName}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {activeRecordedTest.title} • {new Date(selectedCandidateSession.startedAt || Date.now()).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveRecordedTest(null);
                  setSelectedCandidateSession(null);
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Playback Channel Selector (Webcam vs Desktop Screen) */}
            <div className="px-6 pt-3 flex items-center justify-between">
              <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackChannel('camera');
                    setVideoLoadError(false);
                  }}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    playbackChannel === 'camera'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Webcam Recording</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackChannel('screen');
                    setVideoLoadError(false);
                  }}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    playbackChannel === 'screen'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Desktop Screen Recording</span>
                </button>
              </div>
            </div>

            {/* Video Screen */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div
                ref={playerContainerRef}
                className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-slate-800 flex items-center justify-center group"
              >
                <video
                  ref={videoRef}
                  src={
                    !retentionInfo.isExpired && !videoLoadError
                      ? (storedVideoUrl ||
                          (playbackChannel === 'screen'
                            ? selectedCandidateSession.screenVideoUrl || `/api/recordings/rec_${selectedCandidateSession.id}/playback`
                            : selectedCandidateSession.proctoringVideoUrl || '/api/recordings/stream/sample-proctoring') ||
                          undefined)
                      : undefined
                  }
                  className="w-full h-full object-contain"
                  playsInline
                  autoPlay
                  muted={isMuted}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration && isFinite(vid.duration) && vid.duration > 0) {
                      setDuration(Math.round(vid.duration));
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const activeVideoSrc = !retentionInfo.isExpired ? (storedVideoUrl || selectedCandidateSession?.proctoringVideoUrl) : null;
                    if (activeVideoSrc && !videoLoadError) {
                      setCurrentTime(Math.round(e.currentTarget.currentTime));
                    }
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => {
                    console.warn('[HistoryView] Video load error, using stream fallback');
                    setVideoLoadError(true);
                  }}
                />

                {/* Candidate Feed Watermark Tag */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-700 text-xs text-white z-10 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Feed: <strong>{selectedCandidateSession.candidateName}</strong></span>
                </div>

                {/* Retention Badge */}
                <div className="absolute top-3 right-3 z-10">
                  {retentionInfo.isExpired ? (
                    <span className="bg-rose-950/90 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Clock className="w-3 h-3 text-rose-400" />
                      RETENTION EXPIRED ({retentionInfo.retentionDays}D LIMIT)
                    </span>
                  ) : (
                    <span className="bg-slate-950/80 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      {retentionInfo.retentionDays}-DAY RETENTION ({retentionInfo.daysRemaining}D LEFT)
                    </span>
                  )}
                </div>

                {/* Video Controls Bar */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 space-y-2 opacity-90 group-hover:opacity-100 transition z-20">
                  {/* Scrubber */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />

                  {/* Toolbar */}
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={handlePlayPause}
                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      </button>

                      <span className="text-xs font-mono text-slate-300">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>

                      <div className="flex items-center space-x-1.5 pl-2">
                        <button
                          onClick={() => setIsMuted(!isMuted)}
                          className="p-1 text-slate-300 hover:text-white"
                        >
                          {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            setVolume(Number(e.target.value));
                            setIsMuted(false);
                          }}
                          className="w-16 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700 text-xs">
                        <span className="text-slate-400">Speed:</span>
                        {[1, 1.25, 1.5, 2].map((spd) => (
                          <button
                            key={spd}
                            onClick={() => setPlaybackSpeed(spd)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              playbackSpeed === spd ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={toggleFullscreen}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Toggle Fullscreen"
                      >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Proctoring & Screen Event Markers */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{playbackChannel === 'screen' ? 'Desktop Screen Activity & Infractions Timeline' : 'Proctoring Infractions Timeline'}</span>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                      {playbackChannel === 'screen' ? `${screenTimelineEvents.length} Events` : `${selectedCandidateSession.proctoringEvents?.length || 0} Infractions`}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Click marker to seek exact timestamp</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {playbackChannel === 'screen' && screenTimelineEvents.length > 0 ? (
                    screenTimelineEvents.map((evt) => (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => handleSeek(Math.min(evt.offsetSeconds, duration || evt.offsetSeconds))}
                        className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] transition flex items-center gap-1.5 cursor-pointer ${
                          evt.severity === 'HIGH'
                            ? 'bg-rose-950/40 hover:bg-rose-900/60 border-rose-500/40 text-rose-300'
                            : evt.severity === 'MEDIUM'
                            ? 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-500/40 text-amber-300'
                            : 'bg-slate-900 hover:bg-indigo-600/30 border-slate-800 hover:border-indigo-500/50 text-indigo-300'
                        }`}
                        title={evt.message || evt.type}
                      >
                        <Clock className="w-3 h-3 text-indigo-400" />
                        <span className="font-semibold">{evt.type}</span>
                        <span className="text-slate-400 font-bold">
                          {formatTime(evt.offsetSeconds)}
                        </span>
                      </button>
                    ))
                  ) : selectedCandidateSession.proctoringEvents && selectedCandidateSession.proctoringEvents.length > 0 ? (
                    selectedCandidateSession.proctoringEvents.map((evt, idx) => {
                      const startTimeMs = new Date(selectedCandidateSession.startedAt || evt.timestamp).getTime();
                      const evtTimeMs = new Date(evt.timestamp).getTime();
                      const offsetSeconds = Math.max(0, Math.floor((evtTimeMs - startTimeMs) / 1000));
                      const targetSeek = duration > 0 ? Math.min(offsetSeconds, duration) : offsetSeconds;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSeek(targetSeek)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-indigo-600/30 border border-slate-800 hover:border-indigo-500/50 text-rose-400 font-mono text-[10px] transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>{evt.type}</span>
                          <span className="text-slate-500">
                            ({new Date(evt.timestamp).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })})
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-slate-500 italic">No violations recorded. Session is verified clean.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* RESTART TEST MODAL */}
      <RestartTestModal
        isOpen={Boolean(restartModalSession)}
        onClose={() => setRestartModalSession(null)}
        assessment={
          selectedAssessment ||
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
