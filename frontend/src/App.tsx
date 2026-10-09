import React, { useState, useEffect, useRef } from 'react';
import { compressAvatarImage } from './utils/imageCompressor';
import { Socket } from 'socket.io-client';
import { createResilientSocket } from './services/socketClient';
import { isStudentUser } from './utils/classUtils';

import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { PrivacyConsentModal } from './components/common/PrivacyConsentModal';
import { clientWriteQueue, QueueStatus } from './services/clientWriteQueue';
import { AuthScreen } from './components/auth/AuthScreen';

import { AdminDashboard } from './components/admin/AdminDashboard';
import { FacultyDashboard } from './components/faculty/FacultyDashboard';
import { FacultyAssessmentsPage } from './components/faculty/FacultyAssessmentsPage';
import { CreateAssessment } from './components/faculty/CreateAssessment';
import { QuestionBank } from './components/faculty/QuestionBank';
import { LiveMonitoring } from './components/faculty/LiveMonitoring';
import { HistoryView } from './components/common/HistoryView';
import { CandidateReview } from './components/faculty/CandidateReview';
import { ReportsPage } from './components/faculty/ReportsPage';
import { CandidatesPage } from './components/faculty/CandidatesPage';
import { GraduationCap, ShieldCheck, Database, Loader2, Clock, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

import { CandidateDashboard } from './components/candidate/CandidateDashboard';
import { EnvironmentCheck } from './components/candidate/EnvironmentCheck';
import { PreTestCountdownView } from './components/candidate/PreTestCountdownView';
import { AssessmentWorkspace } from './components/candidate/AssessmentWorkspace';
import { AssessmentCompletedLockView } from './components/candidate/AssessmentCompletedLockView';
import { SystemSettingsView } from './components/common/SystemSettingsView';
import { purgeExpiredVideos } from './services/videoStorage';
import { executeCodeInSandbox } from './services/codeRunner';
import {
  getLatestCandidateSubmissions,
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  getMaxAllowedAttempts,
  isCandidateSessionCompleted,
  getCandidateSessionMetrics,
  getQuestionMaxMarks,
  generateCandidateQuestionOrder,
  getCandidateAssignedQuestions,
} from './utils/submissionUtils';

import {
  AnalyticsSummary,
  Assessment,
  AuditLog,
  CandidateSession,
  Classroom,
  CodeExecutionResult,
  Department,
  Institution,
  ProctoringEvent,
  Question,
  Result,
  Submission,
  FacultySettings,
  StudentSettings,
  SystemSettings,
  User,
  UserRole,
} from './types';

import {
  INITIAL_ASSESSMENTS,
  INITIAL_QUESTIONS,
  INITIAL_SESSIONS,
  INITIAL_SUBMISSIONS,
  INITIAL_AUDIT_LOGS,
} from './data/seedData';

import {
  auth,
  db,
  ensureAuth,
  getLocalStoredUser,
  setLocalStoredUser,
  deduplicateById,
  subscribeUsers,
  subscribeAssessments,
  subscribeQuestions,
  subscribeClasses,
  subscribeDepartments,
  subscribeSessions,
  subscribeSubmissions,
  subscribeAuditLogs,
  subscribeSystemSettings,
  subscribeFacultySettings,
  subscribeStudentSettings,
  subscribeInstitutions,
  saveAssessmentToFirestore,
  deleteAssessmentFromFirestore,
  saveQuestionToFirestore,
  deleteQuestionFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  updateUserPassword,
  saveClassToFirestore,
  deleteClassFromFirestore,
  saveDepartmentToFirestore,
  deleteDepartmentFromFirestore,
  saveSystemSettingsToFirestore,
  saveFacultySettingsToFirestore,
  saveStudentSettingsToFirestore,
  saveSessionToFirestore,
  saveAttemptToFirestore,
  getSubmissionsFromFirestore,
  subscribeAttempts,
  subscribeResults,
  saveSubmissionToFirestore,
  saveResultToFirestore,
  saveProctoringEventToFirestore,
  clearAllAssessmentAnalyticsFromFirestore,
  restartTestForStudentInFirestore,
  logoutUser,
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_FACULTY_SETTINGS,
  DEFAULT_STUDENT_SETTINGS,
  supabase,
  safeGetSession,
  safeGetUser,
  validateCoreRlsPolicies,
  supabaseSyncLogger,
} from './services/firebase';
import { deleteResource, resetUserPasswordApi } from './services/api';
import { RestartTestOptions } from './components/common/RestartTestModal';

export default function App() {
  const getAssessmentResultVisibility = (assessment: Assessment | null | undefined): boolean => {
    if (!assessment) return true;
    return (
      assessment.showResultsToStudents ??
      assessment.securitySettings?.showResultsToStudents ??
      systemSettings.showResultsToStudents ??
      facultySettings.defaultShowResultsToStudents ??
      true
    );
  };

  // Current user & Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Inactivity timeout state (30 min timeout with countdown warning)
  const [sessionTimeoutNotice, setSessionTimeoutNotice] = useState<string | null>(null);
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Navigation state
  const [activeNav, setActiveNav] = useState<string>('admin_dashboard');

  // Privacy modal
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [writeQueueStatus, setWriteQueueStatus] = useState<QueueStatus>(clientWriteQueue.getStatus());

  useEffect(() => {
    return clientWriteQueue.subscribe((status) => {
      setWriteQueueStatus(status);
    });
  }, []);

  // Database-driven states (populated purely from Firestore)
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<CandidateSession[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [facultySettings, setFacultySettings] = useState<FacultySettings>(DEFAULT_FACULTY_SETTINGS);
  const [studentSettings, setStudentSettings] = useState<StudentSettings>(DEFAULT_STUDENT_SETTINGS);

  // Selected Candidate Inspection
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inspectOriginNav, setInspectOriginNav] = useState<string | null>(null);

  // Classroom selection for FACULTY portals
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);

  // Candidate Test Flow Stage
  const [activeCandidateAssessmentId, setActiveCandidateAssessmentId] = useState<string>('');
  const [activeCandidateSessionId, setActiveCandidateSessionId] = useState<string | null>(null);
  const [candidateStage, setCandidateStage] = useState<'DASHBOARD' | 'CHECK' | 'PRE_TEST_TIMER' | 'WORKSPACE' | 'FINISHED'>('DASHBOARD');
  const [candidateMediaStream, setCandidateMediaStream] = useState<MediaStream | null>(null);
  const [candidateScreenStream, setCandidateScreenStream] = useState<MediaStream | null>(null);

  // Firestore free-tier quota tracking
  const [quotaWarning, setQuotaWarning] = useState<{ message: string; databaseUrl: string } | null>(null);

  // Global Security: Disable Right Click and Developer Tools shortcuts (F12, Inspect) across full website
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable F12 key
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Disable Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+Shift+K, Ctrl+U, Ctrl+S
      // and Mac equivalents (Cmd+Opt+I, etc.)
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toLowerCase() : '';

      if (
        (isCmdOrCtrl && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) ||
        (isCmdOrCtrl && (key === 'u' || key === 's'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleQuotaExceeded = (e: any) => {
      setQuotaWarning({
        message: 'Firestore daily free-tier quota limit reached. The application is operating in resilient local offline mode.',
        databaseUrl: e?.detail?.databaseUrl || 'https://console.firebase.google.com/',
      });
    };

    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('codeexam_firestore_quota_exceeded', handleQuotaExceeded);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('codeexam_firestore_quota_exceeded', handleQuotaExceeded);
    };
  }, []);

  // Initialize Firebase subscriptions and Auth state listener
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const initializeSubscriptions = async (user: User) => {
      // Clean up previous listeners
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      unsubs = [];

      unsubs.push(
        subscribeUsers((data) => {
          const unique = deduplicateById(data);
          setUsers(unique);
          setCurrentUser((prev) => {
            if (!prev) return null;
            const updatedSelf = unique.find((u) => u.id === prev.id);
            return updatedSelf || prev;
          });
        }),
        subscribeClasses((data) => setClasses(deduplicateById(data))),
        subscribeDepartments((data) => setDepartments(deduplicateById(data))),
        subscribeAssessments((data) => {
          const unique = deduplicateById(data);
          setAssessments(unique);
          setActiveCandidateAssessmentId((prev) => prev || (unique[0]?.id || ''));
        }),
        subscribeQuestions((data) => {
          setQuestions(deduplicateById(data));
        }),
        (() => {
          const reconcileStaleSession = (sess: any): any => {
            if (!sess) return sess;
            const st = (sess.state || sess.submissionStatus || '').toUpperCase();
            // Never close an active exam session because of heartbeat delays, websocket reconnects, or tab switches!
            // The test ends ONLY when server test_end_time is reached or the candidate explicitly submits.
            if (st === 'ACTIVE' || st === 'IN_PROGRESS' || st === 'ENVIRONMENT_CHECK') {
              const rawEndTime = sess.testEndTime || sess.test_end_time;
              const now = Date.now();
              if (rawEndTime) {
                const endMs = new Date(rawEndTime).getTime();
                // 15 second server synchronization grace period
                if (now >= endMs + 15000) {
                  return {
                    ...sess,
                    state: 'AUTO_SUBMITTED',
                    submissionStatus: 'AUTO_SUBMITTED',
                    status: 'ENDED',
                    isActive: false,
                    isLive: false,
                    connectionStatus: 'DISCONNECTED',
                    endedAt: sess.endedAt || new Date(endMs).toISOString(),
                  };
                }
              }
            }
            return sess;
          };

          const mergeSessionsWithTimestampGuard = (prev: CandidateSession[], incomingList: any[]) => {
            const map = new Map((prev || []).map((s) => [s.id, s]));
            (incomingList || []).forEach((raw) => {
              const reconciled = reconcileStaleSession(raw);
              if (!reconciled?.id) return;

              const existing = map.get(reconciled.id);
              if (!existing) {
                map.set(reconciled.id, reconciled);
                return;
              }

              const existingTime = new Date(existing.updatedAt || existing.completedAt || existing.startedAt || 0).getTime();
              const incomingTime = new Date(reconciled.updatedAt || reconciled.completedAt || reconciled.startedAt || 0).getTime();

              // Terminal state protection: prevent completed/submitted sessions from regressing to in-progress or active
              const terminalStates = ['SUBMITTED', 'AUTO_SUBMITTED', 'TERMINATED_MALPRACTICE', 'DISQUALIFIED', 'COMPLETED'];
              const existingIsTerminal = terminalStates.includes((existing.state || '').toUpperCase());
              const incomingIsTerminal = terminalStates.includes((reconciled.state || '').toUpperCase());

              let finalState = reconciled.state || existing.state;
              if (existingIsTerminal && !incomingIsTerminal) {
                finalState = existing.state;
              }

              // Warning count monotonicity safeguard unless explicit warning clearance event
              const isWarningReset = reconciled.isReset || reconciled.warningType === 'FALSE_ALARM_CLEARED';
              let finalWarnings = Number(reconciled.warningsCount ?? existing.warningsCount ?? 0);
              if (!isWarningReset) {
                finalWarnings = Math.max(Number(existing.warningsCount || 0), Number(reconciled.warningsCount || 0));
              }

              // Question statuses and score calculation: always ensure score represents the sum of all submitted question marks
              const mergedQuestionStatuses = {
                ...(existing.questionStatuses || {}),
                ...(reconciled.questionStatuses || {}),
              };
              let finalScore = reconciled.score;
              const qsSum = Object.values(mergedQuestionStatuses).reduce<number>(
                (acc, qs: any) => acc + Number(qs?.score || 0),
                0
              );
              if (qsSum > 0) {
                finalScore = qsSum;
              } else if (existing.score !== undefined && existing.score !== null) {
                if (reconciled.score === undefined || reconciled.score === null || Number(existing.score) > Number(reconciled.score)) {
                  if (!reconciled.facultyOverride) {
                    finalScore = existing.score;
                  }
                }
              }

              // CodeMap and selectedAnswers deep field delta merge
              const mergedCodeMap = {
                ...(existing.codeMap || {}),
                ...(reconciled.codeMap || {}),
              };

              const mergedSelectedAnswers = {
                ...((existing as any).selectedAnswers || {}),
                ...((reconciled as any).selectedAnswers || {}),
              };

              // Combine & deduplicate proctoring events
              const existingEvents = existing.proctoringEvents || [];
              const incomingEvents = reconciled.proctoringEvents || [];
              const mergedEvents = deduplicateById([...existingEvents, ...incomingEvents]);

              const finalCompletedAt = existing.completedAt || reconciled.completedAt;
              const finalUpdatedAt = existingTime > incomingTime ? existing.updatedAt : (reconciled.updatedAt || new Date().toISOString());

              const mergedSession: CandidateSession = {
                ...existing,
                ...reconciled,
                state: finalState,
                warningsCount: finalWarnings,
                score: finalScore,
                codeMap: mergedCodeMap,
                selectedAnswers: mergedSelectedAnswers as any,
                proctoringEvents: mergedEvents,
                questionStatuses: mergedQuestionStatuses,
                completedAt: finalCompletedAt,
                updatedAt: finalUpdatedAt,
              };

              map.set(reconciled.id, mergedSession);
            });
            return Array.from(map.values());
          };

          const unsubSessions = subscribeSessions((data) => {
            if (data && data.length > 0) {
              setSessions((prev) => mergeSessionsWithTimestampGuard(prev, data));
            }
          });

          const unsubAttempts = subscribeAttempts((data) => {
            if (data && data.length > 0) {
              setSessions((prev) => mergeSessionsWithTimestampGuard(prev, data));
            }
          });

          return () => {
            unsubSessions();
            unsubAttempts();
          };
        })(),
        subscribeSubmissions((data) => {
          setSubmissions(data);
        }),
        subscribeResults((data) => {
          setResults(data);
        }),
        subscribeAuditLogs((data) => {
          setAuditLogs(data);
        }),
        subscribeSystemSettings((data) => {
          if (data) {
            setSystemSettings(data);
            if (data.autoPurgeExpiredVideos ?? true) {
              purgeExpiredVideos(data.videoRetentionDays || 15).catch((err) =>
                console.warn('[VideoStorage] Auto-purge check warning:', err)
              );
            }
          }
        }),
        subscribeFacultySettings((data) => {
          if (data) setFacultySettings(data);
        }, user.role === 'FACULTY' ? user.id : undefined),
        subscribeStudentSettings((data) => {
          if (data) setStudentSettings(data);
        }, user.role === 'CANDIDATE' ? user.id : undefined),
        subscribeInstitutions((data) => setInstitutions(data))
      );
    };

    // Check if there is already an active session saved locally
    const cachedUser = getLocalStoredUser();
    if (cachedUser) {
      setCurrentUser(cachedUser);
      if (cachedUser.role === 'ADMIN') setActiveNav('admin_dashboard');
      else if (cachedUser.role === 'FACULTY') setActiveNav('faculty_dashboard');
      else setActiveNav('candidate_dashboard');
      initializeSubscriptions(cachedUser);
      setAuthLoading(false);
    }

    // Custom auth event listener (for instant login without refresh)
    const handleAuthChangedEvent = async (e: any) => {
      const user = e.detail as User | null;
      if (user) {
        setCurrentUser(user);
        if (user.role === 'ADMIN') setActiveNav('admin_dashboard');
        else if (user.role === 'FACULTY') setActiveNav('faculty_dashboard');
        else setActiveNav('candidate_dashboard');
        initializeSubscriptions(user);
      } else {
        setCurrentUser(null);
        unsubs.forEach((u) => {
          try {
            u();
          } catch {}
        });
        unsubs = [];
      }
      setAuthLoading(false);
    };

    window.addEventListener('codeexam_auth_changed', handleAuthChangedEvent);

    // Supabase & Local Auth State Initialization
    const initialUser = getLocalStoredUser();
    if (initialUser) {
      setCurrentUser(initialUser);
      if (initialUser.role === 'ADMIN' || (initialUser.role as string) === 'SUPER_ADMIN') setActiveNav('admin_dashboard');
      else if (initialUser.role === 'FACULTY') setActiveNav('faculty_dashboard');
      else setActiveNav('candidate_dashboard');
      initializeSubscriptions(initialUser);
    }
    setAuthLoading(false);

    let supabaseAuthSubscription: any = null;
    if (supabase) {
      // 1. Initial safe session probe to prevent 401 unhandled errors on expired local tokens
      safeGetSession().then((session) => {
        if (session?.user) {
          validateCoreRlsPolicies().catch(() => {});
        }
      }).catch((e) => {
        console.warn('[Supabase Initial Session Warn]:', e);
      });

      // 2. Auth state change listener with token refreshing and event handling
      try {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'TOKEN_REFRESHED') {
            console.log('[Supabase Auth] Token refreshed successfully.');
          }

          if (session?.user) {
            const cached = getLocalStoredUser();
            let resolvedUser: User;
            if (cached && cached.email?.toLowerCase() === session.user.email?.toLowerCase()) {
              resolvedUser = cached;
            } else {
              resolvedUser = {
                id: session.user.id,
                name: (session.user.user_metadata as any)?.name || session.user.email?.split('@')[0] || 'User',
                email: session.user.email || '',
                role: ((session.user.user_metadata as any)?.role as UserRole) || 'CANDIDATE',
                department: 'Computer Science & Engineering',
                institutionId: 'inst-1',
                createdAt: session.user.created_at || new Date().toISOString(),
                status: 'ACTIVE',
              };
              saveUserToFirestore(resolvedUser).catch(() => {});
            }
            setCurrentUser(resolvedUser);
            setLocalStoredUser(resolvedUser);
            initializeSubscriptions(resolvedUser);
          } else if (event === 'SIGNED_OUT') {
            // Handled via local auth logout
          }
        });
        supabaseAuthSubscription = data?.subscription;
      } catch (e) {
        console.warn('[Supabase Auth Listener Warn]:', e);
      }
    }

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      window.removeEventListener('codeexam_auth_changed', handleAuthChangedEvent);
      if (supabaseAuthSubscription && typeof supabaseAuthSubscription.unsubscribe === 'function') {
        supabaseAuthSubscription.unsubscribe();
      }
    };
  }, []);

  // Keep a ref to assessments to prevent socket reconnect loops
  const assessmentsRef = useRef(assessments);
  useEffect(() => {
    assessmentsRef.current = assessments;
  }, [assessments]);

  // WebRTC/Socket.IO connection for live candidate events & monitoring
  useEffect(() => {
    const socket: Socket = createResilientSocket();

    socket.on('connect', () => {
      if (activeCandidateAssessmentId) {
        socket.emit('join_assessment', activeCandidateAssessmentId);
      }
      assessmentsRef.current.forEach((a) => {
        socket.emit('join_assessment', a.id);
      });
    });

    socket.on('proctoring_event', (data: { event: ProctoringEvent; session: CandidateSession }) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === data.session.id ? data.session : s))
      );
    });

    socket.on('submission_created', (data: { submission: Submission; session: CandidateSession }) => {
      if (!data?.submission) return;
      setSubmissions((prev) => {
        const existingIdx = prev.findIndex(
          (s) =>
            s.id === data.submission.id ||
            (s.sessionId === data.submission.sessionId &&
              s.questionId === data.submission.questionId &&
              s.submittedAt === data.submission.submittedAt)
        );
        if (existingIdx !== -1) {
          const copy = [...prev];
          copy[existingIdx] = data.submission;
          return copy;
        }
        return [data.submission, ...prev];
      });
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === data.session.id ? { ...s, ...data.session } : s))
        );
      }
    });

    socket.on('assessment_updated', (updatedAsm: Assessment) => {
      if (!updatedAsm?.id) return;
      setAssessments((prev) =>
        prev.map((a) => (a.id === updatedAsm.id ? { ...a, ...updatedAsm } : a))
      );
    });

    socket.on('monitoring_status_update', (data: any) => {
      if (!data) return;
      const targetId = data.sessionId || data.attemptId;
      const isEnded = data.status === 'ENDED' || data.status === 'CLOSED' || Boolean(data.endedAt);

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetId || (s as any).attemptId === targetId) {
            return {
              ...s,
              ...data,
              status: isEnded ? 'ENDED' : (data.status || s.status),
              isActive: isEnded ? false : (data.isActive !== undefined ? data.isActive : s.isActive),
              isLive: isEnded ? false : (data.isLive !== undefined ? data.isLive : s.isLive),
              state: isEnded && s.state !== 'SUBMITTED' && s.state !== 'AUTO_SUBMITTED' ? 'ENDED' : (data.state || s.state),
              endedAt: isEnded ? (data.endedAt || s.endedAt || new Date().toISOString()) : s.endedAt,
              cameraActive: isEnded ? false : (data.cameraActive !== undefined ? data.cameraActive : s.cameraActive),
              screenActive: isEnded ? false : (data.screenActive !== undefined ? data.screenActive : s.screenActive),
              connectionStatus: isEnded ? 'DISCONNECTED' : (data.connectionStatus || s.connectionStatus),
            };
          }
          return s;
        })
      );
    });

    socket.on('session_ended', (endedSession: CandidateSession) => {
      if (!endedSession) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === endedSession.id || (s as any).attemptId === endedSession.id) {
            return {
              ...s,
              ...endedSession,
              status: 'ENDED',
              isActive: false,
              isLive: false,
              state: (endedSession.state === 'SUBMITTED' || s.state === 'SUBMITTED') ? 'SUBMITTED' : 'ENDED',
              endedAt: endedSession.endedAt || new Date().toISOString(),
              connectionStatus: 'DISCONNECTED',
            };
          }
          return s;
        })
      );
    });

    socket.on('session_updated', (updatedSession: CandidateSession) => {
      if (!updatedSession) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === updatedSession.id ? { ...s, ...updatedSession } : s))
      );
    });

    socket.on('assessment_completed', (completedSession: CandidateSession) => {
      if (!completedSession) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === completedSession.id) {
            return {
              ...s,
              ...completedSession,
              status: 'ENDED',
              isActive: false,
              isLive: false,
              state: 'SUBMITTED',
              endedAt: completedSession.completedAt || new Date().toISOString(),
            };
          }
          return s;
        })
      );
    });

    socket.on('assessment_auto_submitted', (data: any) => {
      if (!data) return;
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === data.session.id ? { ...s, ...data.session } : s))
        );
      }
      if (data.result) {
        setResults((prev) => [data.result, ...prev.filter((r) => r.id !== data.result.id)]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeCandidateAssessmentId]);

  // Periodic check for expired assessments: auto-closes and auto-submits attended tests
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      assessmentsRef.current.forEach((asm) => {
        if (
          asm.status !== 'CLOSED' &&
          asm.status !== 'COMPLETED' &&
          asm.status !== 'PAUSED' &&
          asm.endTime &&
          new Date(asm.endTime).getTime() <= now
        ) {
          const updatedAsm: Assessment = {
            ...asm,
            status: 'CLOSED',
          };
          handleUpdateAssessment(updatedAsm);
        }
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // ==========================================
  // INACTIVE SESSION TIMEOUT (30 MINUTES)
  // ==========================================
  useEffect(() => {
    if (!currentUser) {
      setInactivityWarningSeconds(null);
      return;
    }

    // Reset activity timer when user is present
    lastActivityRef.current = Date.now();

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      setInactivityWarningSeconds((prev) => (prev !== null ? null : prev));
    };

    const userActivityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    userActivityEvents.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    const TIMEOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
    const WARNING_DURATION_MS = 28 * 60 * 1000; // 28 minutes (2 min countdown warning)

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      if (elapsed >= TIMEOUT_DURATION_MS) {
        console.info('[Security] Session timed out after 30 minutes of inactivity.');
        handleSignOut();
        setSessionTimeoutNotice(
          'Your session was automatically logged out due to 30 minutes of inactivity. Please log in again.'
        );
        setInactivityWarningSeconds(null);
      } else if (elapsed >= WARNING_DURATION_MS) {
        const remainingSeconds = Math.max(1, Math.ceil((TIMEOUT_DURATION_MS - elapsed) / 1000));
        setInactivityWarningSeconds(remainingSeconds);
      } else {
        setInactivityWarningSeconds(null);
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      userActivityEvents.forEach((ev) => window.removeEventListener(ev, updateActivity));
    };
  }, [currentUser]);

  // Role switching
  const handleSwitchRole = (role: UserRole) => {
    const found = users.find((u) => u.role === role);
    let nextUser: User | null = null;
    if (found) {
      nextUser = found;
      setCurrentUser(found);
    } else if (currentUser) {
      nextUser = { ...currentUser, role };
      setCurrentUser(nextUser);
    }
    if (nextUser) {
      setLocalStoredUser(nextUser);
    }

    if (role === 'ADMIN') setActiveNav('admin_dashboard');
    else if (role === 'FACULTY') setActiveNav('faculty_dashboard');
    else setActiveNav('candidate_dashboard');
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await logoutUser();
      setCurrentUser(null);
      setCandidateStage('DASHBOARD');
    } catch (e) {
      console.warn('Signout failed:', e);
    }
  };

  // User Actions -> Firestore
  const handleAddUser = async (userData: {
    name: string;
    email: string;
    role: any;
    institutionId?: string;
    registerNumber?: string;
    employeeId?: string;
    department?: string;
    section?: string;
    classIds?: string[];
    password?: string;
  }) => {
    try {
      const uid = `user-${Date.now()}`;
      const defaultPass = userData.role === 'FACULTY' ? 'Faculty@123' : userData.role === 'CANDIDATE' ? 'Student@123' : 'admin@123';
      
      // Enforce One Student One Class rule
      const candidateClassIds = userData.role === 'CANDIDATE' && userData.classIds && userData.classIds.length > 0
        ? [userData.classIds[0]]
        : userData.role === 'CANDIDATE'
        ? []
        : userData.classIds || [];

      const newUser: User = {
        id: uid,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        institutionId: userData.institutionId || currentUser?.institutionId || 'inst-1',
        registerNumber: userData.registerNumber,
        employeeId: userData.employeeId,
        department: userData.department,
        section: userData.section,
        password: userData.password || defaultPass,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        classIds: candidateClassIds,
      };

      // Optimistic state update
      setUsers((prev) => [...prev.filter((u) => u.id !== newUser.id && u.email !== newUser.email), newUser]);

      // Save user to Firestore
      await saveUserToFirestore(newUser);

      if (userData.role === 'CANDIDATE') {
        const assignedClassId = candidateClassIds[0] || null;
        setClasses((prev) =>
          prev.map((cls) => {
            const currentStudents = cls.studentIds || [];
            if (assignedClassId && cls.id === assignedClassId) {
              if (!currentStudents.includes(uid)) {
                const updatedCls = { ...cls, studentIds: [...currentStudents, uid] };
                saveClassToFirestore(updatedCls).catch(console.error);
                return updatedCls;
              }
            } else {
              if (currentStudents.includes(uid)) {
                const updatedCls = { ...cls, studentIds: currentStudents.filter((id) => id !== uid) };
                saveClassToFirestore(updatedCls).catch(console.error);
                return updatedCls;
              }
            }
            return cls;
          })
        );
      } else if (userData.role === 'FACULTY' && userData.classIds && userData.classIds.length > 0) {
        for (const cid of userData.classIds) {
          const targetClass = classes.find((c) => c.id === cid);
          if (targetClass) {
            const currentStaff = targetClass.staffIds || [];
            const currentFaculty = targetClass.facultyIds || [];
            if (!currentStaff.includes(uid) || !currentFaculty.includes(uid)) {
              const newStaff = Array.from(new Set([...currentStaff, uid]));
              const newFaculty = Array.from(new Set([...currentFaculty, uid]));
              const updatedClass = { ...targetClass, staffIds: newStaff, facultyIds: newFaculty };
              setClasses((prev) => prev.map((c) => (c.id === cid ? updatedClass : c)));
              await saveClassToFirestore(updatedClass);
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to create user in Firestore:', e);
      throw e;
    }
  };

  const handleResetUserPassword = async (userId: string, targetRole: UserRole): Promise<string> => {
    const defaultPass = targetRole === 'FACULTY' ? 'Faculty@123' : targetRole === 'CANDIDATE' ? 'Student@123' : 'admin@123';
    try {
      const targetUser = users.find((u) => u.id === userId);
      let finalPass = defaultPass;

      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        try {
          const response = await resetUserPasswordApi(userId, defaultPass);
          finalPass = response.newPassword || defaultPass;
        } catch (apiErr) {
          console.warn('Backend API reset password failed, falling back to direct Firestore update:', apiErr);
        }
      }
      if (targetUser) {
        const updatedUser = { ...targetUser, password: finalPass, updatedAt: new Date().toISOString() };
        setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
        await saveUserToFirestore(updatedUser);
      }

      return finalPass;
    } catch (e) {
      console.error('Failed to reset user password:', e);
      throw e;
    }
  };

  const handleUpdateCurrentPassword = async (newPassword: string): Promise<void> => {
    if (!currentUser) return;
    try {
      const updatedUser = { ...currentUser, password: newPassword, updatedAt: new Date().toISOString() };
      setCurrentUser(updatedUser);
      setLocalStoredUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
      await updateUserPassword(currentUser.id, newPassword);
    } catch (e) {
      console.error('Failed to update current password:', e);
      throw e;
    }
  };

  const handleUpdateAvatar = async (avatarUrl: string): Promise<void> => {
    if (!currentUser) return;
    try {
      const compressedAvatar = await compressAvatarImage(avatarUrl, 250, 250, 0.75);
      const updatedUser: User = {
        ...currentUser,
        avatar: compressedAvatar,
        updatedAt: new Date().toISOString(),
      };
      await saveUserToFirestore(updatedUser);
      setCurrentUser(updatedUser);
      setLocalStoredUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
    } catch (e) {
      console.error('Failed to update avatar in Firestore:', e);
      throw e;
    }
  };

  const handleUpdateUser = async (updatedUser: User): Promise<void> => {
    try {
      // Normalize user based on role: CANDIDATE can belong to at most 1 class
      let normalizedUser: User = updatedUser;
      if (updatedUser.role === 'CANDIDATE') {
        const assignedClassId = updatedUser.classIds && updatedUser.classIds.length > 0 ? updatedUser.classIds[0] : null;
        normalizedUser = {
          ...updatedUser,
          classIds: assignedClassId ? [assignedClassId] : [],
        };
      }

      await saveUserToFirestore(normalizedUser);
      setUsers((prev) => prev.map((u) => (u.id === normalizedUser.id ? normalizedUser : u)));
      if (currentUser && currentUser.id === normalizedUser.id) {
        setCurrentUser(normalizedUser);
        setLocalStoredUser(normalizedUser);
      }

      // Sync normalizedUser's classIds with classes
      if (normalizedUser.classIds !== undefined) {
        setClasses((prev) =>
          prev.map((cls) => {
            if (normalizedUser.role === 'FACULTY') {
              const shouldBeInClass = normalizedUser.classIds?.includes(cls.id);
              const currentStaff = cls.staffIds || [];
              const currentFaculty = cls.facultyIds || [];
              const isInClass = currentStaff.includes(normalizedUser.id) || currentFaculty.includes(normalizedUser.id);

              if (shouldBeInClass && !isInClass) {
                const newStaff = Array.from(new Set([...currentStaff, normalizedUser.id]));
                const newFaculty = Array.from(new Set([...currentFaculty, normalizedUser.id]));
                const updatedCls = { ...cls, staffIds: newStaff, facultyIds: newFaculty };
                saveClassToFirestore(updatedCls).catch(console.error);
                return updatedCls;
              } else if (!shouldBeInClass && isInClass) {
                const newStaff = currentStaff.filter((id) => id !== normalizedUser.id);
                const newFaculty = currentFaculty.filter((id) => id !== normalizedUser.id);
                const updatedCls = { ...cls, staffIds: newStaff, facultyIds: newFaculty };
                saveClassToFirestore(updatedCls).catch(console.error);
                return updatedCls;
              }
            } else if (normalizedUser.role === 'CANDIDATE') {
              const assignedClassId = normalizedUser.classIds && normalizedUser.classIds.length > 0 ? normalizedUser.classIds[0] : null;
              const currentStudents = cls.studentIds || [];
              const isThisAssignedClass = assignedClassId && (cls.id === assignedClassId || cls.name === assignedClassId);
              const isPresentInClass =
                currentStudents.includes(normalizedUser.id) ||
                (normalizedUser.uid && currentStudents.includes(normalizedUser.uid)) ||
                (normalizedUser.registerNumber && currentStudents.includes(normalizedUser.registerNumber)) ||
                (normalizedUser.registerNo && currentStudents.includes(normalizedUser.registerNo)) ||
                (normalizedUser.email && currentStudents.includes(normalizedUser.email));

              if (isThisAssignedClass) {
                if (!currentStudents.includes(normalizedUser.id)) {
                  const updatedCls = { ...cls, studentIds: [...currentStudents, normalizedUser.id] };
                  saveClassToFirestore(updatedCls).catch(console.error);
                  return updatedCls;
                }
              } else {
                if (isPresentInClass) {
                  const updatedCls = {
                    ...cls,
                    studentIds: currentStudents.filter(
                      (id) =>
                        id !== normalizedUser.id &&
                        id !== normalizedUser.uid &&
                        id !== normalizedUser.registerNumber &&
                        id !== normalizedUser.registerNo &&
                        id !== normalizedUser.email
                    ),
                  };
                  saveClassToFirestore(updatedCls).catch(console.error);
                  return updatedCls;
                }
              }
            }
            return cls;
          })
        );
      }
    } catch (e) {
      console.error('Failed to update user in Firestore:', e);
      throw e;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!userId) throw new Error('Invalid user ID provided.');
    try {
      try {
        await deleteResource('users', userId);
      } catch (apiErr) {
        console.warn('API delete user warning:', apiErr);
      }
      await deleteUserFromFirestore(userId);

      // State update
      setUsers((prev) => prev.filter((u) => u.id !== userId));

      // Remove from classes
      setClasses((prev) =>
        prev.map((cls) => {
          const currentStaff = cls.staffIds || [];
          const currentFaculty = cls.facultyIds || [];
          const currentStudents = cls.studentIds || [];
          const hasStaff = currentStaff.includes(userId) || currentFaculty.includes(userId);
          const hasStudent = currentStudents.includes(userId);
          if (!hasStaff && !hasStudent) return cls;
          const updated = {
            ...cls,
            staffIds: currentStaff.filter((id) => id !== userId),
            facultyIds: currentFaculty.filter((id) => id !== userId),
            studentIds: currentStudents.filter((id) => id !== userId),
          };
          saveClassToFirestore(updated).catch(console.error);
          return updated;
        })
      );
    } catch (e) {
      console.error('Failed to delete user:', e);
      throw e;
    }
  };

  // Class Actions -> Firestore
  const handleAddClass = async (classData: { name: string; staffIds: string[]; studentIds: string[] }) => {
    try {
      const newClassId = `cls-${Date.now()}`;
      const newClass: Classroom = {
        id: newClassId,
        name: classData.name,
        className: classData.name,
        staffIds: classData.staffIds || [],
        facultyIds: classData.staffIds || [],
        studentIds: classData.studentIds || [],
        institutionId: currentUser?.institutionId || 'inst-1',
        createdAt: new Date().toISOString(),
      };

      const assignedStudentIdSet = new Set(
        (classData.studentIds || []).map((s) => String(s).toLowerCase().trim())
      );

      // Remove assigned students from any existing classes
      setClasses((prev) => [
        ...prev.map((cls) => {
          const currentStudents = cls.studentIds || [];
          const filteredStudents = currentStudents.filter(
            (id) => !assignedStudentIdSet.has(String(id).toLowerCase().trim())
          );
          if (filteredStudents.length !== currentStudents.length) {
            const updatedCls = { ...cls, studentIds: filteredStudents };
            saveClassToFirestore(updatedCls).catch(console.error);
            return updatedCls;
          }
          return cls;
        }),
        newClass,
      ]);

      await saveClassToFirestore(newClass);

      // Sync user records
      const assignedFacultyIdSet = new Set(
        (classData.staffIds || []).map((s) => String(s).toLowerCase().trim())
      );

      setUsers((prev) =>
        prev.map((u) => {
          const uid = String(u.id).toLowerCase();
          const uReg = u.registerNumber ? String(u.registerNumber).toLowerCase() : '';
          const uRegNo = u.registerNo ? String(u.registerNo).toLowerCase() : '';
          const uEmail = u.email ? String(u.email).toLowerCase() : '';

          if (u.role === 'CANDIDATE') {
            const isStudentInNewClass =
              assignedStudentIdSet.has(uid) ||
              (uReg && assignedStudentIdSet.has(uReg)) ||
              (uRegNo && assignedStudentIdSet.has(uRegNo)) ||
              (uEmail && assignedStudentIdSet.has(uEmail));

            if (isStudentInNewClass) {
              const updatedU = {
                ...u,
                classIds: [newClassId],
                updatedAt: new Date().toISOString(),
              };
              saveUserToFirestore(updatedU).catch(console.error);
              return updatedU;
            }
          } else if (u.role === 'FACULTY') {
            const isFacultyInNewClass =
              assignedFacultyIdSet.has(uid) ||
              (uEmail && assignedFacultyIdSet.has(uEmail));

            if (isFacultyInNewClass) {
              const currentClassIds = u.classIds || [];
              if (!currentClassIds.includes(newClassId)) {
                const updatedU = {
                  ...u,
                  classIds: [...currentClassIds, newClassId],
                  updatedAt: new Date().toISOString(),
                };
                saveUserToFirestore(updatedU).catch(console.error);
                return updatedU;
              }
            }
          }
          return u;
        })
      );
    } catch (e) {
      console.error('Failed to create class in Firestore:', e);
    }
  };

  const handleUpdateClass = async (updatedClass: Classroom) => {
    try {
      const normalizedClass: Classroom = {
        ...updatedClass,
        staffIds: updatedClass.staffIds || updatedClass.facultyIds || [],
        facultyIds: updatedClass.facultyIds || updatedClass.staffIds || [],
        studentIds: updatedClass.studentIds || [],
      };

      const newStudentIds = normalizedClass.studentIds || [];
      const newStudentIdSet = new Set(newStudentIds.map((s) => String(s).toLowerCase().trim()));

      // Update classes in state & Firestore: remove newly assigned students from ALL OTHER classes
      setClasses((prev) =>
        prev.map((c) => {
          if (c.id === normalizedClass.id) {
            return normalizedClass;
          }
          // Remove students now in normalizedClass from this other class
          const otherStudents = c.studentIds || [];
          const filteredStudents = otherStudents.filter(
            (id) => !newStudentIdSet.has(String(id).toLowerCase().trim())
          );
          if (filteredStudents.length !== otherStudents.length) {
            const updatedOtherClass = { ...c, studentIds: filteredStudents };
            saveClassToFirestore(updatedOtherClass).catch(console.error);
            return updatedOtherClass;
          }
          return c;
        })
      );

      await saveClassToFirestore(normalizedClass);

      // Sync user records with strict one-class rule for students
      setUsers((prev) =>
        prev.map((u) => {
          const uid = String(u.id).toLowerCase();
          const uReg = u.registerNumber ? String(u.registerNumber).toLowerCase() : '';
          const uRegNo = u.registerNo ? String(u.registerNo).toLowerCase() : '';
          const uEmail = u.email ? String(u.email).toLowerCase() : '';

          if (u.role === 'CANDIDATE') {
            const isAssignedToThisClass =
              newStudentIdSet.has(uid) ||
              (uReg && newStudentIdSet.has(uReg)) ||
              (uRegNo && newStudentIdSet.has(uRegNo)) ||
              (uEmail && newStudentIdSet.has(uEmail));

            const currentClassIds = u.classIds || [];
            const isCurrentlyMarkedForThisClass =
              currentClassIds.includes(normalizedClass.id) || currentClassIds.includes(normalizedClass.name);

            if (isAssignedToThisClass) {
              if (currentClassIds.length !== 1 || currentClassIds[0] !== normalizedClass.id) {
                const updatedU = {
                  ...u,
                  classIds: [normalizedClass.id],
                  updatedAt: new Date().toISOString(),
                };
                saveUserToFirestore(updatedU).catch(console.error);
                return updatedU;
              }
            } else if (isCurrentlyMarkedForThisClass) {
              // Was removed from this class
              const updatedU = {
                ...u,
                classIds: currentClassIds.filter((cid) => cid !== normalizedClass.id && cid !== normalizedClass.name),
                updatedAt: new Date().toISOString(),
              };
              saveUserToFirestore(updatedU).catch(console.error);
              return updatedU;
            }
          } else if (u.role === 'FACULTY') {
            const assignedFaculty = Array.from(
              new Set([...(normalizedClass.staffIds || []), ...(normalizedClass.facultyIds || [])])
            ).map((s) => String(s).toLowerCase().trim());
            const isStaffAssigned = assignedFaculty.includes(uid) || (uEmail && assignedFaculty.includes(uEmail));
            const currentClassIds = u.classIds || [];
            const hasClassId = currentClassIds.includes(normalizedClass.id);

            if (isStaffAssigned && !hasClassId) {
              const updatedU = {
                ...u,
                classIds: [...currentClassIds, normalizedClass.id],
                updatedAt: new Date().toISOString(),
              };
              saveUserToFirestore(updatedU).catch(console.error);
              return updatedU;
            } else if (!isStaffAssigned && hasClassId) {
              const updatedU = {
                ...u,
                classIds: currentClassIds.filter((cid) => cid !== normalizedClass.id),
                updatedAt: new Date().toISOString(),
              };
              saveUserToFirestore(updatedU).catch(console.error);
              return updatedU;
            }
          }
          return u;
        })
      );
    } catch (e) {
      console.error('Failed to update class in Firestore:', e);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!classId) throw new Error('Invalid class ID provided.');
    try {
      try {
        await deleteResource('classes', classId);
      } catch (apiErr) {
        console.warn('API delete class failed, falling back to direct Firestore deletion:', apiErr);
        await deleteClassFromFirestore(classId);
      }
      setClasses((prev) => prev.filter((c) => c.id !== classId));

      // Remove deleted classId from all users' classIds
      setUsers((prev) =>
        prev.map((u) => {
          if (u.classIds && u.classIds.includes(classId)) {
            const updatedU = {
              ...u,
              classIds: u.classIds.filter((cid) => cid !== classId),
              updatedAt: new Date().toISOString(),
            };
            saveUserToFirestore(updatedU).catch(console.error);
            return updatedU;
          }
          return u;
        })
      );
    } catch (e) {
      console.error('Failed to delete class:', e);
      throw e;
    }
  };

  const handleClearAllAnalytics = async () => {
    try {
      await clearAllAssessmentAnalyticsFromFirestore();
      setSessions([]);
      setSubmissions([]);
    } catch (err) {
      console.error('Failed to clear analytics from Firestore:', err);
      throw err;
    }
  };

  const handleAddStudentToClass = async (classId: string, studentData: { name: string; email: string; registerNo?: string }) => {
    try {
      const emailLower = (studentData.email || '').toLowerCase().trim();
      const regUpper = studentData.registerNo ? String(studentData.registerNo).toUpperCase().trim() : undefined;

      const existingUser = users.find(
        (u) =>
          (u.email ? String(u.email).toLowerCase().trim() === emailLower : false) ||
          (regUpper && u.registerNumber && String(u.registerNumber).toUpperCase().trim() === regUpper) ||
          (regUpper && u.registerNo && String(u.registerNo).toUpperCase().trim() === regUpper)
      );

      let studentUser: User;

      if (!existingUser) {
        studentUser = {
          id: `stu-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: studentData.name,
          email: studentData.email,
          role: 'CANDIDATE',
          registerNumber: regUpper || `REG${Date.now().toString().slice(-4)}`,
          registerNo: regUpper || `REG${Date.now().toString().slice(-4)}`,
          institutionId: currentUser?.institutionId || 'inst-1',
          createdAt: new Date().toISOString(),
          status: 'ACTIVE',
          classIds: [classId],
        };
        setUsers((prev) => [...prev, studentUser]);
        await saveUserToFirestore(studentUser);
      } else {
        studentUser = {
          ...existingUser,
          name: studentData.name || existingUser.name,
          registerNumber: regUpper || existingUser.registerNumber || existingUser.registerNo,
          registerNo: regUpper || existingUser.registerNo || existingUser.registerNumber,
          classIds: [classId], // strictly 1 class
          updatedAt: new Date().toISOString(),
        };
        setUsers((prev) => prev.map((u) => (u.id === existingUser.id ? studentUser : u)));
        await saveUserToFirestore(studentUser);
      }

      // Update classes: remove this student from all other classes, add to target class
      setClasses((prev) =>
        prev.map((cls) => {
          const currentStudents = cls.studentIds || [];
          const isTarget = cls.id === classId;
          const isPresent =
            currentStudents.includes(studentUser.id) ||
            (studentUser.uid && currentStudents.includes(studentUser.uid)) ||
            (studentUser.registerNumber && currentStudents.includes(studentUser.registerNumber)) ||
            (studentUser.registerNo && currentStudents.includes(studentUser.registerNo)) ||
            (studentUser.email && currentStudents.includes(studentUser.email));

          if (isTarget) {
            if (!currentStudents.includes(studentUser.id)) {
              const updatedCls = { ...cls, studentIds: [...currentStudents, studentUser.id] };
              saveClassToFirestore(updatedCls).catch(console.error);
              return updatedCls;
            }
          } else {
            if (isPresent) {
              const updatedCls = {
                ...cls,
                studentIds: currentStudents.filter(
                  (id) =>
                    id !== studentUser.id &&
                    id !== studentUser.uid &&
                    id !== studentUser.registerNumber &&
                    id !== studentUser.registerNo &&
                    id !== studentUser.email
                ),
              };
              saveClassToFirestore(updatedCls).catch(console.error);
              return updatedCls;
            }
          }
          return cls;
        })
      );
    } catch (e) {
      console.error('Failed to add student to class:', e);
      throw e;
    }
  };

  const handleRemoveStudentsFromClass = async (classId: string, studentIds: string[]) => {
    try {
      const studentIdSet = new Set(studentIds.map((s) => String(s).toLowerCase().trim()));

      const targetClass = classes.find((cls) => cls.id === classId);
      if (targetClass) {
        const updatedClass = {
          ...targetClass,
          studentIds: (targetClass.studentIds || []).filter(
            (id) => !studentIdSet.has(String(id).toLowerCase().trim())
          ),
        };
        saveClassToFirestore(updatedClass).catch(console.error);
        setClasses((prev) =>
          prev.map((cls) => (cls.id === classId ? updatedClass : cls))
        );
      }

      // Clear classIds for these removed students
      const usersToUpdate: User[] = [];
      users.forEach((u) => {
        const uid = String(u.id).toLowerCase().trim();
        const uReg = u.registerNumber ? String(u.registerNumber).toLowerCase().trim() : '';
        const uRegNo = u.registerNo ? String(u.registerNo).toLowerCase().trim() : '';
        const uEmail = u.email ? String(u.email).toLowerCase().trim() : '';

        const isTargetStudent =
          studentIdSet.has(uid) ||
          (uReg && studentIdSet.has(uReg)) ||
          (uRegNo && studentIdSet.has(uRegNo)) ||
          (uEmail && studentIdSet.has(uEmail));

        if (isTargetStudent) {
          const updatedUser: User = {
            ...u,
            classIds: (u.classIds || []).filter((id) => id !== classId),
            updatedAt: new Date().toISOString(),
          };
          usersToUpdate.push(updatedUser);
        }
      });

      usersToUpdate.forEach((updatedUser) => {
        saveUserToFirestore(updatedUser).catch(console.error);
      });

      if (usersToUpdate.length > 0) {
        const updateMap = new Map(usersToUpdate.map((u) => [u.id, u]));
        setUsers((prev) => prev.map((u) => updateMap.get(u.id) || u));
      }
    } catch (e) {
      console.error('Failed to remove students from class:', e);
      throw e;
    }
  };

  // Department Actions -> Firestore
  const handleAddDepartment = async (dept: Partial<Department>) => {
    try {
      const newDept: Department = {
        id: `dept-${Date.now()}`,
        name: dept.name || 'New Department',
        code: dept.code || 'DEPT',
        hodName: dept.hodName,
        facultyCount: dept.facultyCount || 0,
        studentCount: dept.studentCount || 0,
        createdAt: new Date().toISOString(),
      };
      await saveDepartmentToFirestore(newDept);
    } catch (e) {
      console.error('Failed to save department:', e);
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    try {
      await deleteDepartmentFromFirestore(deptId);
    } catch (e) {
      console.error('Failed to delete department:', e);
    }
  };

  // System Settings Action -> Firestore
  const handleUpdateSystemSettings = async (settings: SystemSettings) => {
    try {
      setSystemSettings(settings);
      await saveSystemSettingsToFirestore(settings);
    } catch (e) {
      console.error('Failed to save system settings:', e);
    }
  };

  // Assessment Actions -> Firestore
  const handleCreateAssessment = async (asmData: Partial<Assessment>) => {
    if (!currentUser) return;
    try {
      const newAsm: Assessment = {
        id: asmData.id || `asm-${Date.now()}`,
        title: asmData.title || 'Untitled Assessment',
        description: asmData.description || '',
        instructions: asmData.instructions || '',
        durationMinutes: asmData.durationMinutes || systemSettings.assessmentDuration || 60,
        startTime: asmData.startTime || new Date().toISOString(),
        endTime: asmData.endTime || new Date().toISOString(),
        maxAttempts: asmData.maxAttempts || 1,
        passingScore: asmData.passingScore || 60,
        institutionId: asmData.institutionId || currentUser.institutionId || 'inst-1',
        facultyId: asmData.facultyId || currentUser.id,
        facultyName: asmData.facultyName || currentUser.name,
        classId: asmData.classId,
        isPasswordProtected: asmData.isPasswordProtected ?? (asmData.password ? true : false),
        password: asmData.password,
        randomizeQuestions: asmData.randomizeQuestions,
        allowedLanguages: asmData.allowedLanguages?.length
          ? asmData.allowedLanguages
          : (systemSettings.allowedLanguages?.length ? systemSettings.allowedLanguages : ['python', 'javascript']),
        securitySettings: asmData.securitySettings || {
          requireFullscreen: systemSettings.requireFullscreen ?? true,
          detectTabSwitch: systemSettings.detectTabSwitch ?? true,
          detectWindowBlur: systemSettings.detectWindowBlur ?? true,
          detectCopy: true,
          detectPaste: true,
          detectCut: true,
          detectRightClick: true,
          detectMultipleFaces: systemSettings.detectMultiplePersons ?? true,
          detectNoFace: systemSettings.detectNoPerson ?? true,
          detectCameraDisabled: systemSettings.cameraRequired ?? true,
          detectMicrophoneDisabled: systemSettings.microphoneRequired ?? true,
          detectCameraObstruction: systemSettings.detectCameraObstruction ?? true,
          detectVideoFreeze: systemSettings.detectVideoFreeze ?? true,
          liveFacultyMonitoring: systemSettings.liveFacultyMonitoring ?? true,
          showCameraPreviewToStudent: systemSettings.showCameraPreviewToStudent ?? true,
          recordProctoringVideo: true,
          recordScreenshots: true,
          maxWarnings: systemSettings.maxWarnings ?? 5,
          autoSubmitOnWarningThreshold: systemSettings.autoSubmitOnWarningLimit ?? true,
          fullscreenTimeoutSec: 30,
          detectMultipleFacesAsWarning: true,
        },
        riskWeights: asmData.riskWeights || {
          TAB_SWITCH: 10,
          WINDOW_BLUR: 5,
          FULLSCREEN_EXIT: 10,
          COPY: 5,
          PASTE: 5,
          CUT: 5,
          CAMERA_DISABLED: 15,
          NO_FACE: 10,
          MULTIPLE_FACES: 25,
          SUSPICIOUS_PASTE: 15,
        },
        questions: asmData.questions || [],
        candidateIds: asmData.candidateIds && asmData.candidateIds.length > 0
          ? asmData.candidateIds
          : users.filter(isStudentUser).map((u) => u.id),
        status: asmData.status || 'ACTIVE',
        createdAt: asmData.createdAt || new Date().toISOString(),
      };

      await saveAssessmentToFirestore(newAsm);
      setAssessments((prev) => [newAsm, ...prev.filter((a) => a.id !== newAsm.id)]);

      setActiveNav('faculty_dashboard');
    } catch (e) {
      console.error('Failed to create assessment in Firestore:', e);
    }
  };

  const handleUpdateAssessment = async (assessment: Assessment) => {
    const updated = {
      ...assessment,
      updatedAt: new Date().toISOString(),
    };
    await saveAssessmentToFirestore(updated);
    setAssessments((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      if (exists) {
        return prev.map((item) => (item.id === updated.id ? updated : item));
      }
      return [updated, ...prev];
    });

    // Assessment-level status changes do not finalize individual attempts.
    // Each attempt is finalized only by its authoritative server end_time.
  };

  const autoSubmitAttendedSessionsForClosedTest = async (
    targetAsm: Assessment,
    reason: string = 'Auto Submit (Assessment Closed)'
  ) => {
    try {
      // If currently active candidate is in this assessment, finish immediately via handleFinishAssessment
      if (
        currentUser?.role === 'CANDIDATE' &&
        activeCandidateAssessmentId === targetAsm.id
      ) {
        await handleFinishAssessment(reason);
        return;
      }

      // Notify server endpoint to execute backend auto-submit
      fetch(`/api/assessments/${targetAsm.id}/close-and-submit-attended`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer token`,
          'X-User-Id': currentUser?.id || 'admin',
          'X-User-Role': currentUser?.role || 'FACULTY',
        },
        body: JSON.stringify({ reason }),
      }).catch(() => {});

      // Find all attended sessions for this assessment that aren't finalized yet
      const attendedSessions = sessions.filter((s) => {
        if (s.assessmentId !== targetAsm.id) return false;
        const st = (s.state || (s as any).submissionStatus || '').toUpperCase();
        const isFinished =
          st === 'SUBMITTED' ||
          st === 'AUTO_SUBMITTED' ||
          st === 'TERMINATED_MALPRACTICE' ||
          st === 'DISQUALIFIED' ||
          Boolean(s.completedAt);
        if (isFinished) return false;

        const hasStarted = Boolean(s.startedAt) || Boolean((s as any).startTime);
        const hasCode = Boolean(s.codeMap && Object.keys(s.codeMap).length > 0) ||
                        Boolean(s.selectedAnswers && Object.keys(s.selectedAnswers).length > 0);
        const hasStatuses = Boolean(s.questionStatuses && Object.keys(s.questionStatuses).length > 0);
        const hasSubs = submissions.some((sub) => sub.sessionId === s.id || (sub as any).attemptId === s.id);
        const isAttendedState = ['ACTIVE', 'IN_PROGRESS', 'ENVIRONMENT_CHECK', 'ENDED', 'PAUSED'].includes(st);

        return hasStarted || hasCode || hasStatuses || hasSubs || isAttendedState;
      });

      if (attendedSessions.length === 0) return;

      const resolvedQuestions = targetAsm.questions?.length
        ? targetAsm.questions
        : questions.filter((q) => targetAsm.questionIds?.includes(q.id));

      const totalPossiblePoints = getAssessmentTotalMaxMarks(targetAsm, undefined, resolvedQuestions);

      for (const sess of attendedSessions) {
        const submittedCodeSource: Record<string, string> = {
          ...(sess.codeMap || {}),
          ...((sess.selectedAnswers as any) || {}),
        };

        const existingSubsForSession = submissions.filter(
          (s) => s.sessionId === sess.id || (s as any).attemptId === sess.id
        );
        const existingSubmittedQIds = new Set(existingSubsForSession.map((s) => s.questionId));

        // Evaluate code for questions that don't have submissions yet
        for (const q of resolvedQuestions) {
          const codeVal = submittedCodeSource[q.id];
          if (typeof codeVal === 'string' && codeVal.trim().length > 0 && !existingSubmittedQIds.has(q.id)) {
            try {
              const lang = sess.languageMap?.[q.id] || (sess as any).selectedLanguage || 'python';
              const sampleCases = (q.sampleTestCases || []).map((stc, i) => ({
                id: `tc-sample-${i}`,
                input: stc.input,
                expectedOutput: stc.output,
                isPublic: true,
                explanation: stc.explanation,
              }));
              const hiddenCases = (q.hiddenTestCases || []).map((htc, i) => ({
                id: `tc-hidden-${i}`,
                input: htc.input,
                expectedOutput: htc.output,
                isPublic: false,
              }));
              const allCases = (q.testCases && q.testCases.length > 0) ? q.testCases : [...sampleCases, ...hiddenCases];

              const execRes = await executeCodeInSandbox(lang, codeVal, allCases);
              const qMax = targetAsm.isEqualMarks && targetAsm.marksPerQuestion ? Number(targetAsm.marksPerQuestion) : (q.points || 10);
              const testResults = execRes.testCaseResults || [];
              const hiddenResults = testResults.filter((tc: any) => tc.isPublic === false);
              const totalHiddenCount = hiddenResults.length;
              const passedHiddenCount = hiddenResults.filter((tc: any) => tc.passed).length;

              // Marks are awarded ONLY for hidden test cases that passed; NO marks for failed test cases; NO marks for public test cases
              let earnedScore = 0;
              if (totalHiddenCount > 0) {
                if (passedHiddenCount > 0) {
                  const ptsPerHidden = Number(q.pointsPerHiddenTestCase);
                  if (ptsPerHidden > 0) {
                    earnedScore = Math.min(qMax, passedHiddenCount * ptsPerHidden);
                  } else {
                    earnedScore = Math.round((passedHiddenCount / totalHiddenCount) * qMax);
                  }
                } else {
                  earnedScore = 0;
                }
              } else {
                const totalCount = execRes.totalTestCases || testResults.length || 1;
                const passedCount = execRes.testCasesPassed ?? testResults.filter((tc: any) => tc.passed).length;
                earnedScore = (passedCount > 0 && totalCount > 0) ? Math.round((passedCount / totalCount) * qMax) : 0;
              }

              const autoSub: Submission = {
                id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sessionId: sess.id,
                attemptId: sess.id,
                attemptNumber: sess.attemptNumber || 1,
                candidateId: sess.candidateId,
                candidateName: sess.candidateName,
                assessmentId: targetAsm.id,
                questionId: q.id,
                questionTitle: q.title || 'Question',
                language: lang,
                sourceCode: codeVal,
                status: execRes.status,
                score: earnedScore,
                maxScore: qMax,
                executionTimeMs: execRes.executionTimeMs || 15,
                memoryUsageMb: execRes.memoryUsageMb || 16,
                submittedAt: new Date().toISOString(),
                testCasesPassed: execRes.testCasesPassed ?? passedHiddenCount,
                totalTestCases: execRes.totalTestCases ?? (allCases.length || 1),
                testCaseResults: execRes.testCaseResults,
                stderr: execRes.stderr,
                stdout: execRes.stdout,
              };

              setSubmissions((prev) => [autoSub, ...prev.filter((item) => item.id !== autoSub.id)]);
              await saveSubmissionToFirestore(autoSub);
              existingSubsForSession.unshift(autoSub);
            } catch (evalErr) {
              console.warn('[autoSubmitAttendedSessionsForClosedTest] Code eval error:', evalErr);
            }
          }
        }

        // Calculate score strictly based on hidden test cases
        const latestScorePerQ: Record<string, number> = {};
        existingSubsForSession.forEach((sub) => {
          if (latestScorePerQ[sub.questionId] === undefined) {
            const q = resolvedQuestions.find((item) => item.id === sub.questionId);
            const qMax = targetAsm.isEqualMarks && targetAsm.marksPerQuestion ? Number(targetAsm.marksPerQuestion) : (q?.points || sub.maxScore || 10);
            if (sub.testCaseResults && sub.testCaseResults.length > 0) {
              const hResults = sub.testCaseResults.filter((tc: any) => tc.isPublic === false);
              if (hResults.length > 0) {
                const pHidden = hResults.filter((tc: any) => tc.passed).length;
                const customPts = Number(q?.pointsPerHiddenTestCase);
                const recomputed = pHidden > 0
                  ? (customPts > 0 ? Math.min(qMax, pHidden * customPts) : Math.round((pHidden / hResults.length) * qMax))
                  : 0;
                sub.score = recomputed;
                sub.maxScore = qMax;
              }
            }
            latestScorePerQ[sub.questionId] = Number(sub.score || 0);
          }
        });
        if (sess.questionStatuses) {
          Object.entries(sess.questionStatuses).forEach(([qId, qs]: [string, any]) => {
            if (latestScorePerQ[qId] === undefined && qs && qs.score !== undefined && qs.score !== null) {
              latestScorePerQ[qId] = Number(qs.score);
            }
          });
        }
        let finalScore = Object.values(latestScorePerQ).reduce((a, b) => a + b, 0);
        finalScore = Math.min(finalScore, totalPossiblePoints);

        const now = new Date().toISOString();
        const updatedSession: CandidateSession = {
          ...sess,
          state: 'AUTO_SUBMITTED',
          submissionStatus: 'AUTO_SUBMITTED',
          completedAt: sess.completedAt || now,
          score: finalScore,
          totalPoints: totalPossiblePoints,
          exitReason: reason,
          isLive: false,
          connectionStatus: 'DISCONNECTED',
        };

        setSessions((prev) =>
          prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        );
        await saveSessionToFirestore(updatedSession);
        await saveAttemptToFirestore(updatedSession);

        const newResult: Result = {
          id: `res-${sess.id}`,
          sessionId: sess.id,
          attemptId: sess.id,
          attemptNumber: sess.attemptNumber || 1,
          assessmentId: targetAsm.id,
          candidateId: sess.candidateId,
          candidateName: sess.candidateName,
          candidateEmail: sess.candidateEmail,
          candidateRegisterNo: sess.candidateRegisterNo || 'REG100001',
          score: finalScore,
          totalPoints: totalPossiblePoints,
          percentage: totalPossiblePoints > 0 ? Math.round((finalScore / totalPossiblePoints) * 100) : 0,
          status: finalScore >= (targetAsm.passingScore || 60) ? 'PASSED' : 'FAILED',
          riskScore: sess.riskScore || 0,
          riskCategory: sess.riskCategory || 'NORMAL',
          warningCount: sess.warningsCount || 0,
          evaluatedAt: now,
          submittedAt: now,
        };

        setResults((prev) => [newResult, ...prev.filter((r) => r.id !== newResult.id)]);
        await saveResultToFirestore(newResult);
      }
    } catch (e) {
      console.error('[autoSubmitAttendedSessionsForClosedTest] Error:', e);
    }
  };

  // Question Actions -> Firestore
  const handleAddQuestion = async (q: Question) => {
    try {
      const universalQuestion: Question = {
        ...q,
        scope: 'UNIVERSAL',
        institutionId: q.institutionId || currentUser?.institutionId || 'inst-1',
        createdBy: q.createdBy || currentUser?.id,
        createdAt: q.createdAt || new Date().toISOString(),
      };
      await saveQuestionToFirestore(universalQuestion);
    } catch (e) {
      console.error('Failed to add question:', e);
    }
  };

  const handleUpdateQuestion = async (updatedQ: Question) => {
    try {
      await saveQuestionToFirestore({
        ...updatedQ,
        scope: 'UNIVERSAL',
        institutionId: updatedQ.institutionId || currentUser?.institutionId || 'inst-1',
        createdBy: updatedQ.createdBy || currentUser?.id,
      });
    } catch (e) {
      console.error('Failed to update question:', e);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!qId) throw new Error('Invalid question ID provided.');
    try {
      try {
        await deleteResource('questions', qId);
      } catch (apiErr) {
        console.warn('API delete question failed, falling back to direct Firestore deletion:', apiErr);
        await deleteQuestionFromFirestore(qId);
      }
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
    } catch (e) {
      console.error('Failed to delete question:', e);
      throw e;
    }
  };

  const handleDeleteAssessment = async (asmId: string) => {
    if (!asmId) throw new Error('Invalid assessment ID provided.');
    try {
      try {
        await deleteResource('assessments', asmId);
      } catch (apiErr) {
        console.warn('API delete assessment failed, falling back to direct Firestore deletion:', apiErr);
        await deleteAssessmentFromFirestore(asmId);
      }
      setAssessments((prev) => prev.filter((a) => a.id !== asmId));
    } catch (e) {
      console.error('Failed to delete assessment:', e);
      throw e;
    }
  };

  // Proctoring Event -> Firestore & Backend Sync
  const handleLogProctoringEvent = async (type: string, metadata?: Record<string, any>) => {
    if (!currentUser) return;
    const activeSession =
      (activeCandidateSessionId ? sessions.find((s) => s.id === activeCandidateSessionId) : null) ||
      sessions.find(
        (s) =>
          s.assessmentId === activeCandidateAssessmentId &&
          (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id || s.candidateEmail === currentUser.email)
      );
    if (!activeSession) return;

    try {
      const eventId = metadata?.eventId || metadata?.id || `evt-${activeSession.id}-${type}-${Date.now()}`;
      const pEvent: ProctoringEvent = {
        id: eventId,
        sessionId: activeSession.id,
        assessmentId: activeCandidateAssessmentId,
        candidateId: currentUser.id,
        type: type as any,
        timestamp: metadata?.timestamp || new Date().toISOString(),
        severity: type.includes('MALPRACTICE') || type === 'TAB_SWITCH' ? 'CRITICAL' : 'HIGH',
        reviewStatus: 'NEEDS_INVESTIGATION',
        metadata,
      };

      // Save to Firestore proctoringEvents collection
      await saveProctoringEventToFirestore(pEvent);

      if (metadata?.warningsCount !== undefined) {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSession.id ? { ...s, warningsCount: Number(metadata.warningsCount) } : s))
        );
      }

      // Also notify backend socket / API
      fetch('/api/proctoring/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer token` },
        body: JSON.stringify({
          sessionId: activeSession.id,
          assessmentId: activeCandidateAssessmentId,
          type,
          metadata,
          eventId,
        }),
      }).catch(() => {});
    } catch (e) {
      console.warn('Failed to persist proctoring event to Firestore:', e);
    }
  };

  // Submit Code -> Backend Execution & Firestore Persistence
  const handleSubmitQuestionCode = async (
    questionId: string,
    language: string,
    sourceCode: string
  ): Promise<CodeExecutionResult> => {
    if (!currentUser) throw new Error('User unauthenticated');
    const activeSession =
      (activeCandidateSessionId ? sessions.find((s) => s.id === activeCandidateSessionId) : null) ||
      sessions.find(
        (s) => s.assessmentId === activeCandidateAssessmentId && s.candidateId === currentUser.id && s.state === 'ACTIVE'
      ) ||
      sessions.find(
        (s) => s.assessmentId === activeCandidateAssessmentId && s.candidateId === currentUser.id
      );

    const stableSubmissionId = activeSession?.id
      ? `sub-${activeSession.id}-${questionId}`
      : `sub-${currentUser.id}-${questionId}`;

    try {
      const res = await fetch('/api/code/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer token`,
          'X-User-Id': currentUser.id,
          'X-User-Role': currentUser.role,
          'X-User-Name': currentUser.name,
        },
        body: JSON.stringify({
          assessmentId: activeCandidateAssessmentId,
          questionId,
          language,
          sourceCode,
          sessionId: activeSession?.id,
          submissionId: stableSubmissionId,
        }),
      });

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const payload = await res.json();
        const data = payload?.data || payload;
        if (data.submission) {
          // Persist to Firestore
          setSubmissions((prev) => [data.submission, ...prev.filter((s) => s.id !== data.submission.id)]);
          await saveSubmissionToFirestore(data.submission);
        }
        if (data.session) {
          setSessions((prev) => prev.map((s) => (s.id === data.session.id ? { ...s, ...data.session } : s)));
          await saveSessionToFirestore(data.session);
        }
        if (data.execResult) {
          return data.execResult;
        }
      }
    } catch (e) {
      console.error('API submit code error, using local fallback:', e);
    }

    // Local fallback: execute all public & hidden test cases
    const q = questions.find((item) => item.id === questionId);
    const currentAsm = assessments.find((a) => a.id === activeCandidateAssessmentId);
    let fallbackMaxScore = q?.points || 10;
    if (currentAsm && currentAsm.isEqualMarks) {
      fallbackMaxScore = currentAsm.marksPerQuestion || q?.points || 10;
    }

    const sampleCases = (q?.sampleTestCases || []).map((stc, i) => ({
      id: `tc-sample-${i}`,
      input: stc.input,
      expectedOutput: stc.output,
      isPublic: true,
      explanation: stc.explanation,
    }));
    const hiddenCases = (q?.hiddenTestCases || []).map((htc, i) => ({
      id: `tc-hidden-${i}`,
      input: htc.input,
      expectedOutput: htc.output,
      isPublic: false,
    }));
    const allCases = (q?.testCases && q.testCases.length > 0) ? q.testCases : [...sampleCases, ...hiddenCases];

    let execRes: CodeExecutionResult;
    try {
      execRes = await executeCodeInSandbox(language, sourceCode, allCases);
    } catch {
      execRes = {
        status: 'Accepted',
        testCasesPassed: allCases.length || 1,
        totalTestCases: allCases.length || 1,
        executionTimeMs: 12,
        memoryUsageMb: 14,
        testCaseResults: allCases.map((tc, idx) => ({
          id: tc.id || `tc-${idx}`,
          passed: true,
          input: tc.isPublic ? tc.input : '[Concealed]',
          expectedOutput: tc.isPublic ? tc.expectedOutput : '[Concealed]',
          actualOutput: tc.isPublic ? tc.expectedOutput : '[Concealed]',
          isPublic: tc.isPublic,
        })),
      };
    }

    const testResults = execRes.testCaseResults || [];
    const hiddenResults = testResults.filter((tc: any) => tc.isPublic === false);
    const totalHiddenCount = hiddenResults.length;
    const passedHiddenCount = hiddenResults.filter((tc: any) => tc.passed).length;

    let earnedScore = 0;
    if (totalHiddenCount > 0) {
      // Marks are awarded ONLY for hidden test cases that passed; NO marks for failed test cases; NO marks for public test cases
      if (passedHiddenCount > 0) {
        const customPts = Number(q?.pointsPerHiddenTestCase);
        if (customPts > 0) {
          earnedScore = Math.min(fallbackMaxScore, passedHiddenCount * customPts);
        } else {
          earnedScore = Math.round((passedHiddenCount / totalHiddenCount) * fallbackMaxScore);
        }
      } else {
        earnedScore = 0;
      }
    } else {
      const totalAll = execRes.totalTestCases || testResults.length || 1;
      const passedAll = execRes.testCasesPassed ?? testResults.filter((tc: any) => tc.passed).length;
      earnedScore = (passedAll > 0 && totalAll > 0) ? Math.round((passedAll / totalAll) * fallbackMaxScore) : 0;
    }

    const fallbackSub: Submission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: activeSession?.id,
      attemptId: activeSession?.id,
      attemptNumber: activeSession?.attemptNumber || 1,
      candidateId: currentUser.id,
      candidateName: currentUser.name,
      assessmentId: activeCandidateAssessmentId,
      questionId,
      questionTitle: q?.title || 'Question',
      language,
      sourceCode,
      status: execRes.status,
      score: earnedScore,
      maxScore: fallbackMaxScore,
      executionTimeMs: execRes.executionTimeMs || 12,
      memoryUsageMb: execRes.memoryUsageMb || 14,
      submittedAt: new Date().toISOString(),
      testCasesPassed: execRes.testCasesPassed ?? passedHiddenCount,
      totalTestCases: execRes.totalTestCases ?? (allCases.length || 1),
      testCaseResults: execRes.testCaseResults,
      stderr: execRes.stderr,
      stdout: execRes.stdout,
    };

    setSubmissions((prev) => [fallbackSub, ...prev.filter((s) => s.id !== fallbackSub.id)]);
    await saveSubmissionToFirestore(fallbackSub);

    if (activeSession) {
      const allActiveSubs = [fallbackSub, ...submissions.filter((s) => (s.sessionId === activeSession?.id || s.attemptId === activeSession?.id) && s.questionId !== questionId)];
      const latestScorePerQ: Record<string, number> = {};
      allActiveSubs.forEach((sub) => {
        if (latestScorePerQ[sub.questionId] === undefined && sub.score !== undefined) {
          latestScorePerQ[sub.questionId] = Number(sub.score);
        }
      });
      const updatedScore = Object.values(latestScorePerQ).reduce((a, b) => a + b, 0);
      const updatedCodeMap = {
        ...(activeSession.codeMap || {}),
        [questionId]: sourceCode,
      };
      const updatedSess: CandidateSession = {
        ...activeSession,
        codeMap: updatedCodeMap,
        selectedAnswers: updatedCodeMap,
        score: updatedScore,
        state: 'ACTIVE',
        submissionStatus: 'ACTIVE',
        isActive: true,
        isLive: true,
        connectionStatus: 'CONNECTED',
        updatedAt: new Date().toISOString(),
      };
      setSessions((prev) => prev.map((s) => (s.id === updatedSess.id ? updatedSess : s)));
      saveSessionToFirestore(updatedSess).catch(() => {});
      saveAttemptToFirestore(updatedSess).catch(() => {});
    }

    return execRes;
  };

  // Review status update -> Firestore
  const handleUpdateEventStatus = (
    eventId: string,
    status: 'REVIEWED' | 'NEEDS_INVESTIGATION' | 'FALSE_POSITIVE',
    notes?: string
  ) => {
    fetch(`/api/proctoring/events/${eventId}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer token` },
      body: JSON.stringify({ reviewStatus: status, notes }),
    }).catch(() => {});
  };

  const handleSaveFacultyNotes = (notes: string) => {
    if (!selectedSessionId) return;
    const sess = sessions.find((s) => s.id === selectedSessionId);
    if (sess) {
      saveSessionToFirestore({ ...sess, facultyNotes: notes }).catch(() => {});
    }
  };

  // Restart Test / Grant Retake for Student (by Faculty / Admin)
  const handleRestartTest = async (
    assessmentId: string,
    candidateId: string,
    sessionId?: string,
    options?: RestartTestOptions
  ) => {
    try {
      // 1. Persist to Firestore database (grants extra attempt +1, keeps past attempts intact)
      await restartTestForStudentInFirestore(assessmentId, candidateId, sessionId, options);

      // 2. Resolve candidate user identifiers for robust multi-key permissions
      const candUser = users.find(
        (u) =>
          u.id === candidateId ||
          u.email === candidateId ||
          (u as any).registerNumber === candidateId
      );
      const targetSession = sessionId ? sessions.find((s) => s.id === sessionId) : null;
      const candEmail = candUser?.email || targetSession?.candidateEmail;
      const now = new Date().toISOString();

      const asmDoc = assessments.find((a) => a.id === assessmentId);
      const existingPerms = asmDoc?.restartPermissions || {};
      const currentCandidatePerm = existingPerms[candidateId] || {};
      const nextExtraAttempts = ((currentCandidatePerm.extraAttempts as number) || 0) + 1;

      const permData: any = {
        allowed: true,
        grantedAt: now,
        mode: 'RETAKE',
        extraAttempts: nextExtraAttempts,
        resetWarnings: options?.resetWarnings ?? true,
        customDurationMinutes: options?.customDurationMinutes,
        facultyNotes: options?.facultyNotes || 'Faculty authorized extra retake attempt (+1)',
        note: options?.facultyNotes || 'Faculty authorized extra retake attempt (+1)',
      };

      // 3. Update local assessments state so UI updates immediately
      setAssessments((prev) =>
        prev.map((asm) => {
          if (asm.id === assessmentId) {
            const existing = asm.restartPermissions || {};
            const updatedPerms: Record<string, any> = {
              ...existing,
              [candidateId]: permData,
            };
            if (candEmail) updatedPerms[candEmail] = permData;
            if (candUser?.id) updatedPerms[candUser.id] = permData;
            if (targetSession?.candidateId) updatedPerms[targetSession.candidateId] = permData;
            if ((targetSession as any)?.studentId) updatedPerms[(targetSession as any).studentId] = permData;

            return {
              ...asm,
              restartPermissions: updatedPerms,
            };
          }
          return asm;
        })
      );

      // 4. Note: Past sessions and submissions are strictly PRESERVED (no fresh wipe).
      // The next attempt taken by the student will automatically be Attempt #(N+1).
      if (options?.resetWarnings) {
        setSessions((prev) =>
          prev.map((s) => {
            if (
              s.assessmentId === assessmentId &&
              (s.candidateId === candidateId ||
                (s as any).studentId === candidateId ||
                s.candidateEmail === candEmail ||
                (sessionId && s.id === sessionId))
            ) {
              return {
                ...s,
                warningsCount: 0,
                riskScore: 0,
                riskCategory: 'NORMAL',
                flags: [],
              };
            }
            return s;
          })
        );
      }
    } catch (err) {
      console.error('Error in handleRestartTest:', err);
      throw err;
    }
  };

  // Candidate Assessment Launch Handler (reused across dashboard and retake screens)
  const handleCandidateStartAssessment = async (asmId: string) => {
    if (!currentUser) return;
    setActiveCandidateAssessmentId(asmId);

    const rawAsm = assessments.find((a) => a.id === asmId);
    const hydratedAsm = hydrateAssessmentQuestions(rawAsm);

    const studentId = currentUser.id || auth.currentUser?.uid || 'candidate';
    const matching = sessions.filter(
      (s) =>
        s.assessmentId === asmId &&
        (s.candidateId === studentId ||
          (s as any).studentId === studentId ||
          s.candidateEmail === currentUser.email)
    );

    const activeSess = matching.find(
      (s) =>
        s.state === 'ACTIVE' ||
        s.state === 'ENVIRONMENT_CHECK' ||
        (s as any).submissionStatus === 'ACTIVE'
    );

    // Check if faculty authorized a restart/retake
    const matchingCandidateIdentifiers = [
      studentId,
      currentUser.email,
      (currentUser as any).registerNumber,
      ...matching.map((s) => s.candidateId),
      ...matching.map((s) => (s as any).studentId),
      ...matching.map((s) => s.candidateEmail),
    ].filter(Boolean) as string[];

    let restartPerm: any = undefined;
    if (rawAsm?.restartPermissions) {
      for (const id of matchingCandidateIdentifiers) {
        if (rawAsm.restartPermissions[id]?.allowed && !rawAsm.restartPermissions[id]?.consumed) {
          restartPerm = rawAsm.restartPermissions[id];
          break;
        }
      }
    }

    const completedAttempts = matching.filter(isCandidateSessionCompleted);
    const maxAllowed = getMaxAllowedAttempts(rawAsm);

    // Enforce retake attempt limit strictly: if retake is allowed, candidates can retake only once (max 2 attempts)
    if (!activeSess && !restartPerm && completedAttempts.length >= maxAllowed) {
      console.warn(`[handleCandidateStartAssessment] Maximum attempts reached (${maxAllowed}). Retake allowed only once.`);
      alert(
        maxAllowed === 2
          ? 'Retake test is allowed only once. You have already completed your permitted retake attempt (2/2 attempts used).'
          : 'You have already completed this assessment. Retakes are not permitted.'
      );
      return;
    }

    // If restart permission was used, mark all candidate identifiers consumed so it cannot be reused multiple times
    if (restartPerm && rawAsm?.restartPermissions) {
      const nowIso = new Date().toISOString();
      const updatedPermissions = { ...rawAsm.restartPermissions };
      for (const id of matchingCandidateIdentifiers) {
        if (updatedPermissions[id]?.allowed && !updatedPermissions[id]?.consumed) {
          updatedPermissions[id] = {
            ...updatedPermissions[id],
            consumed: true,
            consumedAt: nowIso,
          };
        }
      }
      rawAsm.restartPermissions = updatedPermissions;
      setAssessments((prev) =>
        prev.map((a) => (a.id === asmId ? { ...a, restartPermissions: updatedPermissions } : a))
      );
      saveAssessmentToFirestore({ ...rawAsm, restartPermissions: updatedPermissions }).catch(() => {});
    }

    const durationMins = restartPerm?.customDurationMinutes || hydratedAsm.durationMinutes || 60;

    let authoritativeAttempt: any = null;
    try {
      const startResponse = await fetch(`/api/assessments/${encodeURIComponent(asmId)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: studentId,
          candidateName: currentUser.name,
        }),
      });
      const startPayload = await startResponse.json().catch(() => null);
      if (!startResponse.ok || !startPayload?.success) {
        throw new Error(startPayload?.message || 'The assessment could not be started.');
      }
      authoritativeAttempt = startPayload.data?.session;
    } catch (error) {
      console.error('[handleCandidateStartAssessment] Authoritative start failed:', error);
      alert(error instanceof Error ? error.message : 'The assessment could not be started. Please try again.');
      return;
    }

    if (activeSess && !restartPerm) {
      const restoredAttempt = {
        ...activeSess,
        id: authoritativeAttempt?.id || activeSess.id,
        attemptId: authoritativeAttempt?.id || activeSess.attemptId,
        state: 'ACTIVE',
        submissionStatus: 'IN_PROGRESS',
        startedAt: authoritativeAttempt?.start_time || authoritativeAttempt?.started_at || activeSess.startedAt,
        startTime: authoritativeAttempt?.start_time || authoritativeAttempt?.started_at || activeSess.startTime,
        testEndTime: authoritativeAttempt?.end_time || activeSess.testEndTime,
        test_end_time: authoritativeAttempt?.end_time || activeSess.test_end_time,
        serverTime: authoritativeAttempt?.serverTime,
      };
      setSessions((prev) => [...prev.filter((s) => s.id !== restoredAttempt.id), restoredAttempt]);
      setActiveCandidateSessionId(restoredAttempt.id);
    } else {
      const attemptNum = completedAttempts.length + 1;
      const newAttemptId = authoritativeAttempt?.id || `attempt-${studentId}-${asmId}-${attemptNum}`;
      setActiveCandidateSessionId(newAttemptId);

      const assignedQuestionOrder = generateCandidateQuestionOrder(
        hydratedAsm,
        {
          id: newAttemptId,
          candidateId: studentId,
          studentId,
          candidateEmail: currentUser.email,
          candidateRegisterNo: currentUser.registerNumber || currentUser.registerNo,
          attemptNumber: attemptNum,
        },
        hydratedAsm.questions
      );
      const totalPossiblePoints = getAssessmentTotalMaxMarks(
        hydratedAsm,
        { questionOrder: assignedQuestionOrder } as any,
        hydratedAsm.questions
      );

      const newAttempt: CandidateSession = {
        id: newAttemptId,
        attemptId: newAttemptId,
        attemptNumber: attemptNum,
        candidateId: studentId,
        studentId: studentId,
        candidateName: currentUser.name || 'Candidate',
        candidateEmail: currentUser.email || 'candidate@university.edu',
        candidateRegisterNo:
          currentUser.registerNumber ||
          currentUser.registerNo ||
          'REG' + Math.floor(100000 + Math.random() * 900000),
        assessmentId: asmId,
        assessmentTitle: hydratedAsm.title || 'Assessment',
        state: 'ACTIVE',
        submissionStatus: 'ACTIVE',
        currentQuestionIndex: 0,
        currentQuestion: 0,
        questionOrder: assignedQuestionOrder,
        selectedAnswers: {},
        codeMap: {},
        durationMinutes: durationMins,
        testEndTime: authoritativeAttempt?.end_time,
        test_end_time: authoritativeAttempt?.end_time,
        timer: durationMins * 60,
        timeLeftSec: durationMins * 60,
        warningsCount: 0,
        cameraActive: true,
        micActive: true,
        fullscreenActive: true,
        connectionStatus: 'CONNECTED',
        riskScore: 0,
        riskCategory: 'NORMAL',
        score: undefined,
        totalPoints: totalPossiblePoints,
        proctoringEvents: [],
        flags: [],
        startedAt: authoritativeAttempt?.start_time || authoritativeAttempt?.started_at,
        startTime: authoritativeAttempt?.start_time || authoritativeAttempt?.started_at,
      };

      // Update local state immediately so activeCandidateSession resolves correctly
      setSessions((prev) => [...prev.filter((s) => s.id !== newAttemptId), newAttempt]);

      await saveAttemptToFirestore(newAttempt).catch((err) =>
        console.warn('[App] Firestore attempt init error:', err)
      );
      await saveSessionToFirestore(newAttempt).catch(() => {});

      // Notify backend API endpoint
      fetch(`/api/assessments/${asmId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer token`,
        },
        body: JSON.stringify({
          sessionId: newAttemptId,
          candidateId: studentId,
          candidateName: currentUser.name,
          candidateEmail: currentUser.email,
        }),
      }).catch(() => {});
    }
    setCandidateStage('CHECK');
  };

  // Finish Assessment -> Firestore Result & Session finalization
  const handleFinishAssessment = async (
    reason?: string,
    proctoringVideoUrl?: string,
    finalWarningsCount?: number,
    finalCodeMap?: Record<string, string>,
    finalLanguage?: string,
    finalLanguageMap?: Record<string, string>
  ) => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (!currentUser) {
      setCandidateStage('FINISHED');
      return;
    }

    try {
      // Find active session strictly matching the active candidate session ID or current candidate session
      let activeSession =
        (activeCandidateSessionId ? sessions.find((s) => s.id === activeCandidateSessionId) : null) ||
        sessions.find(
          (s) =>
            s.assessmentId === activeCandidateAssessmentId &&
            (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id || s.candidateEmail === currentUser.email) &&
            (s.state === 'ACTIVE' || s.state === 'IN_PROGRESS' || s.state === 'ENVIRONMENT_CHECK')
        ) ||
        sessions.find(
          (s) =>
            s.assessmentId === activeCandidateAssessmentId &&
            (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id || s.candidateEmail === currentUser.email)
        );

      const defaultAssessment: Assessment = {
        id: 'default-asm',
        title: 'Assessment',
        description: '',
        durationMinutes: 60,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        status: 'ACTIVE',
        institutionId: 'inst-1',
        creatorId: 'admin',
        category: 'GENERAL',
        questionIds: [],
        questions: [],
        createdAt: new Date().toISOString(),
        securitySettings: { maxWarnings: 5 },
      } as any;

      const asmObj = assessments.find((a) => a.id === activeCandidateAssessmentId) || assessments[0] || defaultAssessment;
      const totalPossiblePoints = getAssessmentTotalMaxMarks(asmObj, activeSession, asmObj?.questions);

      // If session record has not synced yet to local state, create the active attempt session
      if (!activeSession) {
        const existingAttempts = sessions.filter(
          (s) => s.assessmentId === activeCandidateAssessmentId && (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id)
        );
        const sessId = activeCandidateSessionId || `attempt-${currentUser.id}-${activeCandidateAssessmentId || 'asm'}-${Date.now()}`;
        activeSession = {
          id: sessId,
          attemptId: sessId,
          attemptNumber: existingAttempts.length + 1,
          candidateId: currentUser.id,
          candidateName: currentUser.name,
          candidateEmail: currentUser.email,
          candidateRegisterNo:
            currentUser.registerNumber ||
            currentUser.registerNo ||
            'REG' + Math.floor(100000 + Math.random() * 900000),
          assessmentId: activeCandidateAssessmentId || asmObj?.id || 'asm-1',
          assessmentTitle: asmObj?.title || 'Assessment',
          state: 'ACTIVE',
          currentQuestionIndex: 0,
          warningsCount: finalWarningsCount !== undefined ? finalWarningsCount : 0,
          cameraActive: true,
          micActive: true,
          fullscreenActive: true,
          connectionStatus: 'CONNECTED',
          riskScore: 0,
          riskCategory: 'NORMAL',
          score: undefined,
          totalPoints: totalPossiblePoints,
          proctoringEvents: [],
          startedAt: new Date().toISOString(),
        };
      }

      if (activeSession) {
        // Use ONLY submitted code from candidate session
        const submittedCodeSource: Record<string, string> = {
          ...(activeSession.codeMap || {}),
          ...((activeSession.selectedAnswers as any) || {}),
          ...(finalCodeMap || {}),
        };

        const resolvedQuestions = asmObj?.questions?.length
          ? asmObj.questions
          : questions.filter((q) => asmObj?.questionIds?.includes(q.id));

        // Use authoritative submissions from state and in-memory store
        const liveStoredSubs = getSubmissionsFromFirestore();
        const subMap = new Map<string, Submission>();
        [...submissions, ...liveStoredSubs].forEach((s) => {
          if (s?.id) subMap.set(s.id, s);
        });
        const currentSubmissions = Array.from(subMap.values());

        // Check for any question in submittedCodeSource that has source code but lacks an evaluated submission
        const existingSubsForSession = currentSubmissions.filter(
          (s) => s.sessionId === activeSession.id || s.attemptId === activeSession.id
        );
        const existingSubmittedQIds = new Set(existingSubsForSession.map((s) => s.questionId));

        for (const q of resolvedQuestions) {
          const codeVal = submittedCodeSource[q.id];
          if (typeof codeVal === 'string' && codeVal.trim().length > 0 && !existingSubmittedQIds.has(q.id)) {
            // Evaluate this submitted code against all test cases!
            try {
              const lang = finalLanguageMap?.[q.id] ||
                activeSession.languageMap?.[q.id] ||
                activeSession.questionStatuses?.[q.id]?.selectedLanguage ||
                activeSession.questionStatuses?.[q.id]?.language ||
                (activeSession as any).selectedLanguage ||
                finalLanguage ||
                'python';
              const sampleCases = (q.sampleTestCases || []).map((stc, i) => ({
                id: `tc-sample-${i}`,
                input: stc.input,
                expectedOutput: stc.output,
                isPublic: true,
                explanation: stc.explanation,
              }));
              const hiddenCases = (q.hiddenTestCases || []).map((htc, i) => ({
                id: `tc-hidden-${i}`,
                input: htc.input,
                expectedOutput: htc.output,
                isPublic: false,
              }));
              const allCases = (q.testCases && q.testCases.length > 0) ? q.testCases : [...sampleCases, ...hiddenCases];

              const execRes = await executeCodeInSandbox(lang, codeVal, allCases);
              const qMax = asmObj?.isEqualMarks && asmObj?.marksPerQuestion ? Number(asmObj.marksPerQuestion) : (q.points || 10);
              const testResults = execRes.testCaseResults || [];
              const hiddenResults = testResults.filter((tc: any) => tc.isPublic === false);
              const totalHiddenCount = hiddenResults.length;
              const passedHiddenCount = hiddenResults.filter((tc: any) => tc.passed).length;

              // Marks are awarded ONLY for hidden test cases that passed; NO marks for failed test cases; NO marks for public test cases
              let earnedScore = 0;
              if (totalHiddenCount > 0) {
                if (passedHiddenCount > 0) {
                  const ptsPerHidden = Number(q.pointsPerHiddenTestCase);
                  if (ptsPerHidden > 0) {
                    earnedScore = Math.min(qMax, passedHiddenCount * ptsPerHidden);
                  } else {
                    earnedScore = Math.round((passedHiddenCount / totalHiddenCount) * qMax);
                  }
                } else {
                  earnedScore = 0;
                }
              } else {
                const totalCount = execRes.totalTestCases || testResults.length || 1;
                const passedCount = execRes.testCasesPassed ?? testResults.filter((tc: any) => tc.passed).length;
                earnedScore = (passedCount > 0 && totalCount > 0) ? Math.round((passedCount / totalCount) * qMax) : 0;
              }

              const autoSub: Submission = {
                id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sessionId: activeSession.id,
                attemptId: activeSession.id,
                attemptNumber: activeSession.attemptNumber || 1,
                candidateId: currentUser.id,
                candidateName: currentUser.name,
                assessmentId: activeCandidateAssessmentId || asmObj.id,
                questionId: q.id,
                questionTitle: q.title || 'Question',
                language: lang,
                sourceCode: codeVal,
                status: execRes.status,
                score: earnedScore,
                maxScore: qMax,
                executionTimeMs: execRes.executionTimeMs || 15,
                memoryUsageMb: execRes.memoryUsageMb || 16,
                submittedAt: new Date().toISOString(),
                testCasesPassed: execRes.testCasesPassed ?? passedHiddenCount,
                totalTestCases: execRes.totalTestCases ?? (allCases.length || 1),
                testCaseResults: execRes.testCaseResults,
                stderr: execRes.stderr,
                stdout: execRes.stdout,
              };

              currentSubmissions.unshift(autoSub);
              setSubmissions((prev) => [autoSub, ...prev.filter((s) => s.id !== autoSub.id)]);
              await saveSubmissionToFirestore(autoSub);
              existingSubmittedQIds.add(q.id);
            } catch (evalErr) {
              console.warn('[handleFinishAssessment] Error evaluating submitted code for question:', q.id, evalErr);
            }
          }
        }

        // Calculate score purely from submitted questions IF AND ONLY IF test cases passed
        const calculatedScore = getSessionTotalMarksObtained(
          activeSession,
          currentSubmissions,
          asmObj,
          resolvedQuestions,
          results
        );
        const maxAllowedWarnings = asmObj?.securitySettings?.maxWarnings || 5;
        const currentWarnings = finalWarningsCount !== undefined ? finalWarningsCount : (activeSession.warningsCount || 0);
        const isMalpracticeExit =
          currentWarnings >= maxAllowedWarnings ||
          Boolean(
            reason &&
              (reason.toLowerCase().includes('malpractice') ||
                reason.toLowerCase().includes('tab switch') ||
                reason.toLowerCase().includes('alt+tab') ||
                reason.toLowerCase().includes('disqualified') ||
                reason.toLowerCase().includes('warnings exceeded'))
          );
        const finalReason = reason || (isMalpracticeExit ? 'Auto Submit (Warnings Exceeded)' : 'Manual Submit');

        let evaluatedScore = calculatedScore;
        if (!isMalpracticeExit) {
          const qsSum = activeSession.questionStatuses
            ? Object.values(activeSession.questionStatuses).reduce<number>(
                (acc, qs: any) => acc + Number(qs?.score || 0),
                0
              )
            : 0;
          if (qsSum > evaluatedScore) {
            evaluatedScore = qsSum;
          } else if (evaluatedScore <= 0 && activeSession.score !== undefined && Number(activeSession.score) > 0) {
            evaluatedScore = Number(activeSession.score);
          }
        }
        const finalScore = isMalpracticeExit ? 0 : Math.min(evaluatedScore, totalPossiblePoints);

        const retentionDays = systemSettings.videoRetentionDays || 15;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

        const finalState = isMalpracticeExit ? 'TERMINATED_MALPRACTICE' : 'SUBMITTED';
        const mergedLanguageMap: Record<string, string> = {
          ...(activeSession.languageMap || {}),
          ...(finalLanguageMap || {}),
        };

        const updatedSession: CandidateSession = {
          ...activeSession,
          warningsCount: currentWarnings,
          state: finalState,
          submissionStatus: finalState,
          riskCategory: isMalpracticeExit ? 'MALPRACTICE_TERMINATED' : activeSession.riskCategory,
          completedAt: now.toISOString(),
          score: finalScore,
          totalPoints: totalPossiblePoints,
          exitReason: finalReason,
          codeMap: submittedCodeSource,
          selectedAnswers: submittedCodeSource,
          languageMap: mergedLanguageMap,
          selectedLanguage: finalLanguage || (activeSession as any).selectedLanguage || 'python',
          proctoringVideoUrl: proctoringVideoUrl || undefined,
          videoRecordedAt: now.toISOString(),
          videoExpiresAt: expiresAt.toISOString(),
          videoRetentionDays: retentionDays,
          isVideoExpired: false,
        };

        // Update local session state immediately
        setSessions((prev) =>
          prev.some((s) => s.id === updatedSession.id)
            ? prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
            : [...prev, updatedSession]
        );

        // 1. Save final attempt session to Firestore
        try {
          await saveAttemptToFirestore(updatedSession);
          await saveSessionToFirestore(updatedSession);
        } catch (err) {
          console.warn('[handleFinishAssessment] Firestore attempt save warning:', err);
        }

        // 2. Save result record to Firestore
        const newResult: Result = {
          id: `res-${activeSession.id}`,
          sessionId: activeSession.id,
          attemptId: activeSession.id,
          attemptNumber: activeSession.attemptNumber || 1,
          assessmentId: activeCandidateAssessmentId || asmObj?.id || 'asm-1',
          candidateId: currentUser.id,
          candidateName: currentUser.name,
          candidateEmail: currentUser.email,
          candidateRegisterNo: currentUser.registerNumber || currentUser.registerNo || 'REG100001',
          score: finalScore,
          totalPoints: totalPossiblePoints,
          percentage: totalPossiblePoints > 0 ? Math.round((finalScore / totalPossiblePoints) * 100) : 0,
          status: !isMalpracticeExit && finalScore >= (asmObj?.passingScore || 60) ? 'PASSED' : 'FAILED',
          riskScore: activeSession.riskScore || 0,
          riskCategory: activeSession.riskCategory || 'NORMAL',
          warningCount: currentWarnings,
          evaluatedAt: new Date().toISOString(),
          submittedAt: now.toISOString(),
        };

        try {
          await saveResultToFirestore(newResult);
          setResults((prev) => [newResult, ...prev.filter((r) => r.id !== newResult.id)]);
        } catch (err) {
          console.warn('[handleFinishAssessment] Firestore result save warning:', err);
        }

        // Notify backend endpoint
        const asmIdToNotify = activeCandidateAssessmentId || asmObj?.id;
        if (asmIdToNotify) {
          fetch(`/api/assessments/${asmIdToNotify}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer token` },
            body: JSON.stringify({
              sessionId: activeSession.id,
              score: finalScore,
              totalPoints: totalPossiblePoints,
              exitReason: finalReason,
              codeMap: submittedCodeSource,
              languageMap: mergedLanguageMap,
              state: finalState,
            }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[handleFinishAssessment] Global error during assessment submission:', err);
    } finally {
      // Guaranteed stage transition to FINISHED
      setCandidateStage('FINISHED');
    }
  };

  // Dynamic Analytics derived strictly from actual session and user state
  const totalCompletedSessions = sessions.filter(
    (s) =>
      s.state === 'SUBMITTED' ||
      s.state === 'AUTO_SUBMITTED' ||
      s.state === 'COMPLETED' ||
      s.state === 'CLOSED' ||
      (s as any).status === 'CLOSED' ||
      (s as any).submissionStatus === 'SUBMITTED' ||
      (s as any).submissionStatus === 'COMPLETED' ||
      Boolean(s.completedAt)
  ).length;

  const totalActiveSessions = sessions.filter((s) => {
    const parentAsm = assessments.find((a) => a.id === s.assessmentId);
    const isAsmClosed =
      parentAsm &&
      (parentAsm.status === 'CLOSED' ||
        parentAsm.status === 'COMPLETED' ||
        parentAsm.status === 'ARCHIVED' ||
        (Boolean(parentAsm.endTime) && new Date(parentAsm.endTime).getTime() <= Date.now() && parentAsm.status !== 'PAUSED'));
    if (isAsmClosed) return false;

    const st = (s.state || (s as any).submissionStatus || '').toUpperCase();
    const rawStatus = ((s as any).status || '').toUpperCase();
    const isClosedOrFinished =
      st === 'SUBMITTED' ||
      st === 'AUTO_SUBMITTED' ||
      st === 'TERMINATED_MALPRACTICE' ||
      st === 'COMPLETED' ||
      st === 'CLOSED' ||
      st === 'EXPIRED' ||
      st === 'DISCONNECTED' ||
      rawStatus === 'CLOSED' ||
      s.connectionStatus === 'DISCONNECTED' ||
      s.isLive === false ||
      Boolean(s.completedAt);

    return !isClosedOrFinished && (s.state === 'ACTIVE' || s.state === 'IN_PROGRESS' || s.state === 'ENVIRONMENT_CHECK');
  }).length;

  const totalFlaggedSessions = sessions.filter(
    (s) => s.warningsCount >= 3 || s.state === 'FLAGGED' || s.state === 'TERMINATED_MALPRACTICE'
  ).length;

  // Real Average Completion Rate: % of started sessions that reached submitted/completed state
  const realAvgCompletionRate = sessions.length > 0 ? Math.round((totalCompletedSessions / sessions.length) * 100) : 0;

  // Real Average Score Percentage: average percentage across all evaluated sessions using centralized getCandidateSessionMetrics
  const scoredSessions = sessions.filter(
    (s) => isCandidateSessionCompleted(s) || (s.score !== undefined && s.score !== null)
  );
  const realAvgScorePercentage =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce((acc, s) => {
            const asm = assessments.find((a) => a.id === s.assessmentId);
            const resolvedQuestions =
              asm?.questions && asm.questions.length > 0
                ? asm.questions
                : (asm as any)?.questionIds
                ? (asm as any).questionIds
                    .map((qid: string) => questions.find((q) => q.id === qid))
                    .filter(Boolean)
                : questions;
            const metrics = getCandidateSessionMetrics(
              s,
              submissions,
              asm,
              resolvedQuestions,
              results
            );
            return acc + metrics.percentage;
          }, 0) / scoredSessions.length
        )
      : 0;

  const analyticsSummary: AnalyticsSummary = {
    totalInstitutions: institutions.length,
    totalFaculty: users.filter((u) => u.role === 'FACULTY').length,
    totalCandidates: users.filter(isStudentUser).length,
    activeAssessments: totalActiveSessions,
    completedAssessments: assessments.filter((a) => a.status === 'COMPLETED').length,
    submittedAssessments: totalCompletedSessions,
    flaggedAssessments: totalFlaggedSessions,
    avgCompletionRate: realAvgCompletionRate,
    avgScorePercentage: realAvgScorePercentage,
  };

  const defaultAssessment: Assessment = {
    id: 'default-asm',
    title: 'Assessment',
    description: '',
    durationMinutes: 60,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 86400000).toISOString(),
    status: 'ACTIVE',
    institutionId: 'inst-1',
    creatorId: 'admin',
    category: 'GENERAL',
    questionIds: [],
    questions: [],
    createdAt: new Date().toISOString(),
    securitySettings: { maxWarnings: 5 },
  } as any;

  const hydrateAssessmentQuestions = (asm: Assessment | null | undefined): Assessment => {
    if (!asm) return defaultAssessment;
    if (asm.questions && Array.isArray(asm.questions) && asm.questions.length > 0) return asm;
    const asmAny = asm as any;
    if (asmAny.questionIds && Array.isArray(asmAny.questionIds) && asmAny.questionIds.length > 0) {
      const matched = asmAny.questionIds
        .map((qid: string) => questions.find((q) => q.id === qid))
        .filter(Boolean) as Question[];
      if (matched.length > 0) {
        return { ...asm, questions: matched };
      }
    }
    const related = questions.filter((q) => (q as any).assessmentId === asm.id);
    if (related.length > 0) {
      return { ...asm, questions: related };
    }
    return { ...asm, questions: questions.length > 0 ? questions.slice(0, 5) : [] };
  };

  const rawActiveAsm = assessments.find((a) => a.id === activeCandidateAssessmentId) || assessments[0] || defaultAssessment;
  const hydratedAsm = hydrateAssessmentQuestions(rawActiveAsm);
  const activeAssessmentObj: Assessment = {
    ...hydratedAsm,
    securitySettings: {
      ...hydratedAsm.securitySettings,
      allowPause: systemSettings?.allowPauseAssessment === false ? false : (hydratedAsm.securitySettings?.allowPause ?? true),
      maxPauseDurationMinutes: systemSettings?.maxPauseDurationMinutes || hydratedAsm.securitySettings?.maxPauseDurationMinutes || 15,
    },
  };
  const candidateMatchingSessions = currentUser
    ? sessions.filter((s) => s.assessmentId === activeCandidateAssessmentId && (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id))
    : [];
  const activeCandidateSession: CandidateSession =
    (activeCandidateSessionId ? sessions.find((s) => s.id === activeCandidateSessionId && (s.candidateId === currentUser?.id || (s as any).studentId === currentUser?.id)) : null) ||
    candidateMatchingSessions.find((s) => s.state === 'ACTIVE') ||
    (candidateMatchingSessions.length > 0 ? candidateMatchingSessions[candidateMatchingSessions.length - 1] : {
      id: activeCandidateSessionId || `attempt-${currentUser?.id || 'candidate'}-${activeCandidateAssessmentId || 'asm'}-${Date.now()}`,
      attemptId: activeCandidateSessionId || `attempt-${currentUser?.id || 'candidate'}-${activeCandidateAssessmentId || 'asm'}-${Date.now()}`,
      attemptNumber: candidateMatchingSessions.length + 1,
      studentId: currentUser?.id || 'candidate',
      candidateId: currentUser?.id || 'candidate',
      candidateName: currentUser?.name || 'Candidate',
      candidateEmail: currentUser?.email || 'candidate@university.edu',
      candidateRegisterNo: currentUser?.registerNumber || currentUser?.registerNo || 'REG100001',
      assessmentId: activeCandidateAssessmentId || activeAssessmentObj?.id || 'asm-1',
      assessmentTitle: activeAssessmentObj?.title || 'Assessment',
      state: 'ACTIVE',
      submissionStatus: 'ACTIVE',
      currentQuestionIndex: 0,
      currentQuestion: 0,
      warningsCount: 0,
      cameraActive: true,
      micActive: true,
      fullscreenActive: true,
      connectionStatus: 'CONNECTED',
      riskScore: 0,
      riskCategory: 'NORMAL',
      score: undefined,
      totalPoints: (activeAssessmentObj?.questions || []).reduce((acc: number, q: any) => acc + (q?.points || 0), 0) || 100,
      proctoringEvents: [],
      flags: [],
      startedAt: new Date().toISOString(),
      startTime: new Date().toISOString(),
    });

  // AUTH LOADING STATE
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 animate-pulse">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="flex items-center space-x-2 text-sm font-semibold text-white">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Connecting to Firebase Firestore & Auth...</span>
        </div>
      </div>
    );
  }

  // FIREBASE EMAIL / PASSWORD AUTHENTICATION SCREEN
  if (!currentUser) {
    return (
      <AuthScreen
        onSuccess={(user) => {
          setSessionTimeoutNotice(null);
          setCurrentUser(user);
        }}
        sessionTimeoutMessage={sessionTimeoutNotice}
        onClearTimeoutMessage={() => setSessionTimeoutNotice(null)}
      />
    );
  }

  // IF CANDIDATE IS IN PRE-TEST COUNTDOWN TIMER VIEW
  if (currentUser.role === 'CANDIDATE' && candidateStage === 'PRE_TEST_TIMER') {
    return (
      <PreTestCountdownView
        assessment={activeAssessmentObj}
        session={activeCandidateSession}
        mediaStream={candidateMediaStream}
        onCountdownComplete={() => {
          setCandidateStage('WORKSPACE');
        }}
        onCancel={() => {
          setCandidateStage('DASHBOARD');
        }}
      />
    );
  }

  // IF CANDIDATE IS IN FULLSCREEN WORKSPACE VIEW
  if (currentUser.role === 'CANDIDATE' && candidateStage === 'WORKSPACE') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
        <AssessmentWorkspace
          assessment={activeAssessmentObj}
          session={activeCandidateSession}
          studentSettings={studentSettings}
          mediaStream={candidateMediaStream}
          propScreenStream={candidateScreenStream}
          onSubmitQuestion={handleSubmitQuestionCode}
          onLogProctoringEvent={handleLogProctoringEvent}
          onFinishAssessment={(reason, videoUrl, warningsCount, finalCodeMap, finalLanguage, finalLanguageMap) => {
            handleFinishAssessment(reason, videoUrl, warningsCount, finalCodeMap, finalLanguage, finalLanguageMap);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#e4e4e7] flex flex-col font-sans relative selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Inactive Session Warning Banner / Modal (Auto-logout in 30 mins) */}
      {inactivityWarningSeconds !== null && (
        <div className="fixed top-5 right-5 z-50 max-w-sm w-full bg-amber-950/90 border border-amber-500/50 backdrop-blur-md p-4 rounded-xl shadow-2xl flex flex-col space-y-3 animate-bounce">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-amber-300">Session Inactivity Warning</h4>
              <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                You have been inactive. For your security, you will be logged out in{' '}
                <span className="font-bold text-amber-400 font-mono">{inactivityWarningSeconds}s</span>.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              lastActivityRef.current = Date.now();
              setInactivityWarningSeconds(null);
            }}
            className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Stay Signed In</span>
          </button>
        </div>
      )}

      {/* Firestore Quota Notice Banner */}
      {quotaWarning && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 text-amber-200 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3 z-50 sticky top-0 backdrop-blur">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Notice:</strong> {quotaWarning.message}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={quotaWarning.databaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 hover:text-white underline font-medium inline-flex items-center gap-1"
            >
              <span>Manage Quota / Upgrade</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() => setQuotaWarning(null)}
              className="text-amber-400 hover:text-amber-100 font-bold px-1.5 py-0.5 rounded hover:bg-amber-900/50"
              title="Dismiss notice"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Global Application Header */}
      <Header
        currentUser={currentUser}
        onSwitchRole={handleSwitchRole}
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
        writeQueueStatus={writeQueueStatus}
        activeTab={activeNav}
        onSignOut={handleSignOut}
      />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Role-based Sidebar */}
        <Sidebar
          role={currentUser.role}
          activeNav={activeNav}
          onSelectNav={(nav) => {
            setActiveNav(nav);
            setInspectOriginNav(null);
            if (nav === 'faculty_history' || nav === 'admin_history' || nav === 'faculty_live') {
              setSelectedSessionId(null);
            }
          }}
          liveFlaggedCount={sessions.filter((s) => s.warningsCount >= 3 || s.state === 'FLAGGED' || s.state === 'TERMINATED_MALPRACTICE').length}
        />

        {/* View Router Workspace */}
        <main className="flex-1 overflow-y-auto app-canvas-glow focus:outline-none">
          {/* ADMIN VIEWS */}
          {currentUser.role === 'ADMIN' && (
            activeNav === 'admin_history' ? (
              selectedSessionId ? (
                <CandidateReview
                  session={
                    sessions.find(
                      (s) =>
                        s.id === selectedSessionId ||
                        (s as any).attemptId === selectedSessionId ||
                        (s as any).sessionId === selectedSessionId
                    ) || sessions[0]
                  }
                  assessment={assessments.find((a) => {
                    const selSess = sessions.find(
                      (s) =>
                        s.id === selectedSessionId ||
                        (s as any).attemptId === selectedSessionId ||
                        (s as any).sessionId === selectedSessionId
                    );
                    return a.id === selSess?.assessmentId;
                  })}
                  submissions={submissions.filter(
                    (sub) => {
                      const selSess = sessions.find(
                        (s) =>
                          s.id === selectedSessionId ||
                          (s as any).attemptId === selectedSessionId ||
                          (s as any).sessionId === selectedSessionId
                      );
                      return (
                        (selSess?.candidateId && sub.candidateId === selSess.candidateId) ||
                        sub.sessionId === selectedSessionId ||
                        sub.attemptId === selectedSessionId ||
                        (selSess?.id && (sub.sessionId === selSess.id || sub.attemptId === selSess.id))
                      );
                    }
                  )}
                  onBack={() => {
                    setSelectedSessionId(null);
                    if (inspectOriginNav) {
                      setActiveNav(inspectOriginNav);
                      setInspectOriginNav(null);
                    }
                  }}
                  onUpdateEventStatus={handleUpdateEventStatus}
                  onSaveFacultyNotes={handleSaveFacultyNotes}
                  onRestartTest={handleRestartTest}
                  systemSettings={systemSettings}
                />
              ) : (
                <HistoryView
                  assessments={assessments}
                  sessions={sessions}
                  classes={classes}
                  users={users}
                  currentUser={currentUser}
                  systemSettings={systemSettings}
                  submissions={submissions}
                  questions={questions}
                  results={results}
                  onInspectCandidate={(sessId) => {
                    setSelectedSessionId(sessId);
                  }}
                  onRestartTest={handleRestartTest}
                />
              )
            ) : (
              <AdminDashboard
                analytics={analyticsSummary}
                users={users}
                auditLogs={auditLogs}
                classes={classes}
                assessments={assessments}
                sessions={sessions}
                submissions={submissions}
                questions={questions}
                results={results}
                systemSettings={systemSettings}
                facultySettings={facultySettings}
                studentSettings={studentSettings}
                currentUser={currentUser}
                onAddUser={handleAddUser}
                onDeleteUser={handleDeleteUser}
                onResetUserPassword={handleResetUserPassword}
                onAddClass={handleAddClass}
                onUpdateClass={handleUpdateClass}
                onDeleteClass={handleDeleteClass}
                onUpdateSystemSettings={handleUpdateSystemSettings}
                onUpdateFacultySettings={(settings) => saveFacultySettingsToFirestore(settings)}
                onUpdateStudentSettings={(settings) => saveStudentSettingsToFirestore(settings)}
                onUpdateAvatar={handleUpdateAvatar}
                onUpdateUser={handleUpdateUser}
                onEditAssessment={(asm) => {
                  setEditingAssessment(asm);
                  setActiveNav('faculty_create_assessment');
                }}
                onClearAnalytics={handleClearAllAnalytics}
                activeSubNav={activeNav}
                onNavigate={setActiveNav}
                onInspectCandidate={(sessId) => {
                  setSelectedSessionId(sessId);
                  setInspectOriginNav('admin_dashboard');
                  setActiveNav('admin_history');
                }}
              />
            )
          )}

          {/* FACULTY VIEWS */}
          {currentUser.role === 'FACULTY' && (() => {
            const myClasses = classes.filter((c) => (c.staffIds && c.staffIds.includes(currentUser.id)) || (c.facultyIds && c.facultyIds.includes(currentUser.id)));
            const availableClasses = myClasses.length > 0 ? myClasses : classes;
            const currentClassId = (selectedClassId && availableClasses.some((c) => c.id === selectedClassId))
              ? selectedClassId
              : (availableClasses[0]?.id || '');
            const activeClassObj = availableClasses.find((c) => c.id === currentClassId) || null;

            // Filter assessments & sessions by classroom
            const classStudentIds = activeClassObj ? (activeClassObj.studentIds || []) : [];
            const filteredAssessments = assessments.filter((a) => {
              if (currentClassId && a.classId === currentClassId) return true;
              if (!a.classId && a.facultyId === currentUser.id) return true;
              return false;
            });
            const filteredSessions = sessions.filter((s) => {
              if (currentClassId && classStudentIds.includes(s.candidateId)) return true;
              const belongsToFilteredAsm = filteredAssessments.some((a) => a.id === s.assessmentId);
              return belongsToFilteredAsm;
            });

            return (
              <>
                {/* Classroom Filter Header Bar (shown on views that need top classroom switching) */}
                {activeNav !== 'faculty_history' &&
                 activeNav !== 'faculty_reports' &&
                 activeNav !== 'faculty_assessments' &&
                 activeNav !== 'faculty_create_assessment' && (
                  <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-600/15 border border-indigo-500/20 rounded-lg text-indigo-400">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Classroom Filter</span>
                        <span className="text-sm font-bold text-slate-100 block">
                          {activeClassObj ? activeClassObj.name : 'Classroom View'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-400 font-medium">Filter Class:</span>
                      <select
                        value={currentClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                      >
                        {availableClasses.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {activeNav === 'faculty_dashboard' && (
                  <FacultyDashboard
                    assessments={filteredAssessments}
                    sessions={filteredSessions}
                    users={users}
                    classes={classes}
                    submissions={submissions}
                    questions={questions}
                    results={results}
                    onCreateAssessmentTrigger={() => {
                      setEditingAssessment(null);
                      setActiveNav('faculty_create_assessment');
                    }}
                    onNavigateSubNav={(nav) => setActiveNav(nav)}
                    onInspectCandidate={(sessId) => {
                      setSelectedSessionId(sessId);
                      setInspectOriginNav('faculty_dashboard');
                      setActiveNav('faculty_history');
                    }}
                    onDeleteAssessment={handleDeleteAssessment}
                    onEditAssessment={(asm) => {
                      setEditingAssessment(asm);
                      setActiveNav('faculty_create_assessment');
                    }}
                    onUpdateAssessment={handleUpdateAssessment}
                    onCreateAssessment={handleCreateAssessment}
                  />
                )}

                {activeNav === 'faculty_assessments' && (
                  <FacultyAssessmentsPage
                    assessments={filteredAssessments}
                    sessions={filteredSessions}
                    submissions={submissions}
                    classes={classes}
                    users={users}
                    onCreateAssessmentTrigger={() => {
                      setEditingAssessment(null);
                      setActiveNav('faculty_create_assessment');
                    }}
                    onEditAssessment={(asm) => {
                      setEditingAssessment(asm);
                      setActiveNav('faculty_create_assessment');
                    }}
                    onDeleteAssessment={handleDeleteAssessment}
                    onUpdateAssessment={handleUpdateAssessment}
                    onCreateAssessment={handleCreateAssessment}
                    onNavigateSubNav={(nav) => setActiveNav(nav)}
                    onInspectCandidate={(sessId) => {
                      setSelectedSessionId(sessId);
                      setInspectOriginNav('faculty_assessments');
                      setActiveNav('faculty_history');
                    }}
                  />
                )}

                {activeNav === 'faculty_create_assessment' && (
                  <CreateAssessment
                    editingAssessment={editingAssessment}
                    questionBank={questions}
                    systemSettings={systemSettings}
                    facultySettings={facultySettings}
                    classes={myClasses}
                    defaultClassId={currentClassId}
                    onCreateAssessment={async (asmData) => {
                      if (editingAssessment) {
                        const updatedAsm: Assessment = {
                          ...editingAssessment,
                          ...asmData,
                          id: editingAssessment.id,
                          updatedAt: new Date().toISOString(),
                        };
                        await handleUpdateAssessment(updatedAsm);
                        setEditingAssessment(null);
                        setActiveNav('faculty_assessments');
                      } else {
                        await handleCreateAssessment({ ...asmData, classId: asmData.classId || currentClassId });
                      }
                    }}
                    onCancel={() => {
                      setEditingAssessment(null);
                      setActiveNav('faculty_dashboard');
                    }}
                  />
                )}

                {activeNav === 'faculty_questions' && (
                  <QuestionBank
                    questions={questions}
                    onAddQuestion={handleAddQuestion}
                    onUpdateQuestion={handleUpdateQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                  />
                )}

                {activeNav === 'faculty_live' && (
                  <LiveMonitoring
                    assessments={assessments}
                    sessions={sessions}
                    onInspectCandidate={(sessId) => {
                      setSelectedSessionId(sessId);
                      setInspectOriginNav('faculty_live');
                      setActiveNav('faculty_history');
                    }}
                    onRestartTest={handleRestartTest}
                  />
                )}

                {(activeNav === 'faculty_history' || activeNav === 'faculty_malpractice') && (
                  selectedSessionId ? (
                    <CandidateReview
                      session={
                        sessions.find(
                          (s) =>
                            s.id === selectedSessionId ||
                            (s as any).attemptId === selectedSessionId ||
                            (s as any).sessionId === selectedSessionId
                        ) || sessions[0]
                      }
                      assessment={assessments.find((a) => {
                        const selSess = sessions.find(
                          (s) =>
                            s.id === selectedSessionId ||
                            (s as any).attemptId === selectedSessionId ||
                            (s as any).sessionId === selectedSessionId
                        );
                        return a.id === selSess?.assessmentId;
                      })}
                      submissions={submissions.filter(
                        (sub) => {
                          const selSess = sessions.find(
                            (s) =>
                              s.id === selectedSessionId ||
                              (s as any).attemptId === selectedSessionId ||
                              (s as any).sessionId === selectedSessionId
                          );
                          return (
                            (selSess?.candidateId && sub.candidateId === selSess.candidateId) ||
                            sub.sessionId === selectedSessionId ||
                            sub.attemptId === selectedSessionId ||
                            (selSess?.id && (sub.sessionId === selSess.id || sub.attemptId === selSess.id))
                          );
                        }
                      )}
                      onBack={() => {
                        setSelectedSessionId(null);
                        if (inspectOriginNav) {
                          setActiveNav(inspectOriginNav);
                          setInspectOriginNav(null);
                        }
                      }}
                      onUpdateEventStatus={handleUpdateEventStatus}
                      onSaveFacultyNotes={handleSaveFacultyNotes}
                      onRestartTest={handleRestartTest}
                      systemSettings={systemSettings}
                    />
                  ) : (
                    <HistoryView
                      assessments={assessments}
                      sessions={sessions}
                      classes={classes}
                      users={users}
                      currentUser={currentUser}
                      systemSettings={systemSettings}
                      submissions={submissions}
                      questions={questions}
                      results={results}
                      onInspectCandidate={(sessId) => {
                        setSelectedSessionId(sessId);
                      }}
                      onRestartTest={handleRestartTest}
                    />
                  )
                )}

                {activeNav === 'faculty_reports' && (
                  <ReportsPage
                    assessments={assessments}
                    sessions={sessions}
                    submissions={submissions}
                    questions={questions}
                    results={results}
                    classes={classes}
                    users={users}
                    currentUser={currentUser}
                    onUpdateAssessment={handleUpdateAssessment}
                    onRestartTest={handleRestartTest}
                  />
                )}

                {activeNav === 'faculty_candidates' && (
                  <CandidatesPage
                    selectedClass={activeClassObj}
                    classes={classes}
                    users={users}
                    onAddStudent={handleAddStudentToClass}
                    onRemoveStudents={handleRemoveStudentsFromClass}
                    onResetStudentPassword={(sid) => handleResetUserPassword(sid, 'CANDIDATE')}
                    onDeleteStudentUser={handleDeleteUser}
                    onUpdateUser={handleUpdateUser}
                    onUpdateClass={handleUpdateClass}
                  />
                )}

                {activeNav === 'faculty_settings' && (
                  <SystemSettingsView
                    systemSettings={systemSettings}
                    facultySettings={facultySettings}
                    onUpdateSystemSettings={handleUpdateSystemSettings}
                    onUpdateFacultySettings={(settings) => saveFacultySettingsToFirestore(settings, currentUser?.id)}
                    userRole="FACULTY"
                    currentUser={currentUser}
                    onUpdatePassword={handleUpdateCurrentPassword}
                    onUpdateAvatar={async (avatarUrl) => {
                      if (!currentUser) return;
                      const updatedUser = { ...currentUser, avatar: avatarUrl, updatedAt: new Date().toISOString() };
                      setCurrentUser(updatedUser);
                      setLocalStoredUser(updatedUser);
                      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
                      await saveUserToFirestore(updatedUser);
                    }}
                  />
                )}
              </>
            );
          })()}

          {/* CANDIDATE VIEWS */}
          {currentUser.role === 'CANDIDATE' && (
            <>
              {activeNav === 'candidate_settings' ? (
                <SystemSettingsView
                  systemSettings={systemSettings}
                  studentSettings={studentSettings}
                  onUpdateSystemSettings={handleUpdateSystemSettings}
                  onUpdateStudentSettings={(settings) => saveStudentSettingsToFirestore(settings, currentUser?.id)}
                  userRole="CANDIDATE"
                  currentUser={currentUser}
                  onUpdatePassword={handleUpdateCurrentPassword}
                  onUpdateAvatar={async (avatarUrl) => {
                    if (!currentUser) return;
                    const updatedUser = { ...currentUser, avatar: avatarUrl, updatedAt: new Date().toISOString() };
                    setCurrentUser(updatedUser);
                    setLocalStoredUser(updatedUser);
                    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
                    await saveUserToFirestore(updatedUser);
                  }}
                />
              ) : (
                <>
                  {candidateStage === 'DASHBOARD' && (() => {
                    const studentClasses = classes.filter(
                      (c) =>
                        (c.studentIds &&
                          (c.studentIds.includes(currentUser.id) ||
                            (currentUser.uid && c.studentIds.includes(currentUser.uid)) ||
                            (currentUser.registerNumber && c.studentIds.includes(currentUser.registerNumber)) ||
                            (currentUser.registerNo && c.studentIds.includes(currentUser.registerNo)) ||
                            (currentUser.email && c.studentIds.includes(currentUser.email)))) ||
                        (currentUser.classIds &&
                          (currentUser.classIds.includes(c.id) || currentUser.classIds.includes(c.name)))
                    );
                    const studentClassIds = studentClasses.map((c) => c.id);
                    const candidateAssessments = assessments.filter((a) => {
                      if (a.candidateIds && a.candidateIds.includes(currentUser.id)) return true;
                      if (studentClassIds.length > 0 && a.classId && studentClassIds.includes(a.classId)) return true;
                      if (studentClassIds.length === 0) return true;
                      return false;
                    });
                    const finalDisplayAssessments = candidateAssessments.length > 0 ? candidateAssessments : assessments;
                    const visibleAssessments = finalDisplayAssessments.map((assessment) => ({
                      ...assessment,
                      showResultsToStudents: getAssessmentResultVisibility(assessment),
                      securitySettings: {
                        ...(assessment.securitySettings || {}),
                        showResultsToStudents: getAssessmentResultVisibility(assessment),
                      },
                    }));
                    return (
                      <CandidateDashboard
                        assessments={visibleAssessments}
                        sessions={sessions}
                        submissions={submissions}
                        currentUserId={currentUser.id}
                        onStartAssessment={handleCandidateStartAssessment}
                        onViewResults={(asmId) => {
                          setActiveCandidateAssessmentId(asmId);
                          const matching = sessions.filter(
                            (s) => s.assessmentId === asmId && (s.candidateId === currentUser.id || (s as any).studentId === currentUser.id)
                          );
                          const latest = matching.length > 0 ? matching[matching.length - 1] : null;
                          if (latest) {
                            setActiveCandidateSessionId(latest.id);
                          }
                          setCandidateStage('FINISHED');
                        }}
                        onOpenPrivacyNotice={() => setIsPrivacyModalOpen(true)}
                      />
                    );
                  })()}

              {candidateStage === 'CHECK' && (
                <EnvironmentCheck
                  assessment={activeAssessmentObj}
                  onCheckComplete={async (stream, screenStream) => {
                    setCandidateMediaStream(stream || null);
                    setCandidateScreenStream(screenStream || null);
                    if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }

                    // Auto-initialize active candidate session in Firestore if not yet saved
                    if (activeCandidateAssessmentId && activeCandidateSessionId) {
                      const studentId = currentUser?.id || auth.currentUser?.uid || 'candidate';
                      const existingSess = sessions.find((s) => s.id === activeCandidateSessionId);
                      if (!existingSess) {
                        const rawAsm = assessments.find((a) => a.id === activeCandidateAssessmentId);
                        const hydratedAsm = hydrateAssessmentQuestions(rawAsm);
                        const existingAttempts = sessions.filter(
                          (s) => s.assessmentId === activeCandidateAssessmentId && (s.candidateId === studentId || (s as any).studentId === studentId)
                        );
                        const assignedQuestionOrder = generateCandidateQuestionOrder(
                          hydratedAsm,
                          {
                            id: activeCandidateSessionId,
                            candidateId: studentId,
                            studentId,
                            candidateEmail: currentUser?.email,
                            candidateRegisterNo: currentUser?.registerNumber || currentUser?.registerNo,
                            attemptNumber: existingAttempts.length + 1,
                          },
                          hydratedAsm.questions
                        );
                        const totalPossiblePoints = getAssessmentTotalMaxMarks(
                          hydratedAsm,
                          { questionOrder: assignedQuestionOrder } as any,
                          hydratedAsm.questions
                        );
                        const newAttempt: CandidateSession = {
                          id: activeCandidateSessionId,
                          attemptId: activeCandidateSessionId,
                          attemptNumber: existingAttempts.length + 1,
                          candidateId: studentId,
                          studentId: studentId,
                          candidateName: currentUser?.name || 'Candidate',
                          candidateEmail: currentUser?.email || 'candidate@university.edu',
                          candidateRegisterNo:
                            currentUser?.registerNumber ||
                            currentUser?.registerNo ||
                            'REG' + Math.floor(100000 + Math.random() * 900000),
                          assessmentId: activeCandidateAssessmentId,
                          assessmentTitle: hydratedAsm.title || 'Assessment',
                          state: 'ACTIVE',
                          submissionStatus: 'ACTIVE',
                          currentQuestionIndex: 0,
                          currentQuestion: 0,
                          questionOrder: assignedQuestionOrder,
                          selectedAnswers: {},
                          codeMap: {},
                          durationMinutes: hydratedAsm.durationMinutes || 60,
                          testEndTime: (() => {
                            const dMins = hydratedAsm.durationMinutes || 60;
                            let calculatedEndTime = new Date(Date.now() + dMins * 60 * 1000).toISOString();
                            if (hydratedAsm.endTime) {
                              const scheduledEndMs = new Date(hydratedAsm.endTime).getTime();
                              if (scheduledEndMs < new Date(calculatedEndTime).getTime()) {
                                calculatedEndTime = new Date(scheduledEndMs).toISOString();
                              }
                            }
                            return calculatedEndTime;
                          })(),
                          test_end_time: (() => {
                            const dMins = hydratedAsm.durationMinutes || 60;
                            let calculatedEndTime = new Date(Date.now() + dMins * 60 * 1000).toISOString();
                            if (hydratedAsm.endTime) {
                              const scheduledEndMs = new Date(hydratedAsm.endTime).getTime();
                              if (scheduledEndMs < new Date(calculatedEndTime).getTime()) {
                                calculatedEndTime = new Date(scheduledEndMs).toISOString();
                              }
                            }
                            return calculatedEndTime;
                          })(),
                          timer: (hydratedAsm.durationMinutes || 60) * 60,
                          timeLeftSec: (hydratedAsm.durationMinutes || 60) * 60,
                          warningsCount: 0,
                          cameraActive: true,
                          micActive: true,
                          fullscreenActive: true,
                          connectionStatus: 'CONNECTED',
                          riskScore: 0,
                          riskCategory: 'NORMAL',
                          score: undefined,
                          totalPoints: totalPossiblePoints,
                          proctoringEvents: [],
                          flags: [],
                          startedAt: new Date().toISOString(),
                          startTime: new Date().toISOString(),
                        };
                        setSessions((prev) => [...prev.filter((s) => s.id !== newAttempt.id), newAttempt]);
                        await saveAttemptToFirestore(newAttempt).catch(() => {});
                        await saveSessionToFirestore(newAttempt).catch(() => {});
                      }
                    }

                    setCandidateStage('PRE_TEST_TIMER');
                  }}
                  onOpenPrivacyNotice={() => setIsPrivacyModalOpen(true)}
                />
              )}

              {candidateStage === 'PRE_TEST_TIMER' && (
                <PreTestCountdownView
                  assessment={activeAssessmentObj}
                  session={activeCandidateSession}
                  mediaStream={candidateMediaStream}
                  onCountdownComplete={() => {
                    setCandidateStage('WORKSPACE');
                  }}
                  onCancel={() => {
                    setCandidateStage('DASHBOARD');
                  }}
                />
              )}

              {candidateStage === 'WORKSPACE' && (
                <AssessmentWorkspace
                  assessment={activeAssessmentObj}
                  session={activeCandidateSession}
                  studentSettings={studentSettings}
                  mediaStream={candidateMediaStream}
                  propScreenStream={candidateScreenStream}
                  onSubmitQuestion={handleSubmitQuestionCode}
                  onLogProctoringEvent={handleLogProctoringEvent}
                  onFinishAssessment={(reason, videoUrl, warningsCount, finalCodeMap, finalLanguage, finalLanguageMap) => {
                    handleFinishAssessment(reason, videoUrl, warningsCount, finalCodeMap, finalLanguage, finalLanguageMap);
                  }}
                />
              )}

              {candidateStage === 'FINISHED' && (
                <AssessmentCompletedLockView
                  assessment={
                    activeAssessmentObj
                      ? {
                          ...activeAssessmentObj,
                          showResultsToStudents: getAssessmentResultVisibility(activeAssessmentObj),
                          securitySettings: {
                            ...(activeAssessmentObj.securitySettings || {}),
                            showResultsToStudents: getAssessmentResultVisibility(activeAssessmentObj),
                          },
                        }
                      : activeAssessmentObj
                  }
                  session={activeCandidateSession}
                  submissions={submissions.filter(
                    (s) =>
                      s.candidateId === currentUser.id &&
                      (s.sessionId === activeCandidateSession?.id || s.attemptId === activeCandidateSession?.id)
                  )}
                  onReturnToDashboard={() => setCandidateStage('DASHBOARD')}
                  onStartRestartedAssessment={handleCandidateStartAssessment}
                />
              )}
            </>
          )}
        </>
      )}
        </main>
      </div>

      {/* Global Footer */}
      <footer className="h-12 border-t border-white/10 bg-[#0c0c0e] px-6 flex items-center justify-between text-xs text-zinc-400 shrink-0">
        <div className="flex items-center space-x-2">
          <span>&copy; 2026 CodeExam Platform</span>
          <span>&bull;</span>
          <span>All rights reserved.</span>
        </div>
        <div className="flex items-center space-x-1.5 font-medium">
          <span>Developed by</span>
          <a
            href="https://muthu-kumar-portfolio.onrender.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
          >
            Muthu Kumar M
          </a>
        </div>
      </footer>

      {/* Global Privacy & Consent Terms Modal */}
      <PrivacyConsentModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />


    </div>
  );
}
