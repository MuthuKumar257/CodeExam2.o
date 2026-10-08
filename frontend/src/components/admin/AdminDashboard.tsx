import React, { useState, useEffect, useRef } from 'react';
import { isStudentAssignedToClass, isFacultyAssignedToClass, isStudentUser } from '../../utils/classUtils';
export { isStudentAssignedToClass, isFacultyAssignedToClass };
import { UserAvatar } from '../common/UserAvatar';
import {
  Building2,
  Users,
  GraduationCap,
  FileCode2,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  ShieldAlert,
  Plus,
  Search,
  CheckCircle,
  Settings,
  Save,
  Trash2,
  UserPlus,
  ShieldCheck,
  Sliders,
  Sparkles,
  Layers,
  Key,
  RotateCcw,
  Loader2,
  Upload,
  FileSpreadsheet,
  Trophy,
  Edit3,
} from 'lucide-react';
import { saveUserToFirestore, saveClassToFirestore, logAuditEntry } from '../../services/firebase';
import {
  AnalyticsSummary,
  Assessment,
  AuditLog,
  CandidateSession,
  Classroom,
  Institution,
  Question,
  Result,
  Submission,
  SystemSettings,
  FacultySettings,
  StudentSettings,
  User,
  UserRole,
} from '../../types';
import { getCandidateSessionMetrics, isCandidateSessionCompleted } from '../../utils/submissionUtils';
import { SystemSettingsView } from '../common/SystemSettingsView';
import { StudentRankingView } from '../common/StudentRankingView';
import { BulkImportModal } from './BulkImportModal';
import { FacultyAuditLogView } from './FacultyAuditLogView';

interface AdminDashboardProps {
  analytics: AnalyticsSummary;
  users: User[];
  auditLogs?: AuditLog[];
  classes?: Classroom[];
  assessments?: Assessment[];
  sessions?: CandidateSession[];
  submissions?: Submission[];
  questions?: Question[];
  results?: Result[];
  systemSettings?: SystemSettings;
  facultySettings?: FacultySettings;
  studentSettings?: StudentSettings;
  currentUser?: User;
  onAddUser: (user: {
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
  }) => Promise<void> | void;
  onDeleteUser?: (userId: string) => Promise<void> | void;
  onResetUserPassword?: (userId: string, role: UserRole) => Promise<string> | void;
  onAddClass: (classData: { name: string; staffIds: string[]; studentIds: string[] }) => void;
  onUpdateClass?: (classData: Classroom) => void;
  onDeleteClass?: (classId: string) => Promise<void> | void;
  onUpdateSystemSettings?: (settings: SystemSettings) => void;
  onUpdateFacultySettings?: (settings: FacultySettings) => void;
  onUpdateStudentSettings?: (settings: StudentSettings) => void;
  onUpdateAvatar?: (avatarUrl: string) => Promise<void>;
  onUpdatePassword?: (newPassword: string) => Promise<void>;
  onUpdateUser?: (updatedUser: User) => Promise<void> | void;
  onEditAssessment?: (asm: Assessment) => void;
  onClearAnalytics?: () => Promise<void> | void;
  activeSubNav?: string;
  onNavigate?: (nav) => void;
  onInspectCandidate?: (sessionId: string) => void;
}



export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  analytics,
  users,
  auditLogs = [],
  classes = [],
  assessments = [],
  sessions = [],
  submissions = [],
  questions = [],
  results = [],
  systemSettings,
  facultySettings,
  studentSettings,
  currentUser,
  onAddUser,
  onDeleteUser,
  onResetUserPassword,
  onAddClass,
  onUpdateClass,
  onDeleteClass,
  onUpdateSystemSettings,
  onUpdateFacultySettings,
  onUpdateStudentSettings,
  onUpdateAvatar,
  onUpdatePassword,
  onUpdateUser,
  onEditAssessment,
  onClearAnalytics,
  activeSubNav = 'admin_dashboard',
  onNavigate,
  onInspectCandidate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Clear Analytics state
  const [showClearAnalyticsModal, setShowClearAnalyticsModal] = useState(false);
  const [isClearingAnalytics, setIsClearingAnalytics] = useState(false);
  const [analyticsClearedMsg, setAnalyticsClearedMsg] = useState<string | null>(null);

  // User & Class deletion state
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);

  // User management feedback state
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [userSuccessMsg, setUserSuccessMsg] = useState<string | null>(null);
  const [userErrorMsg, setUserErrorMsg] = useState<string | null>(null);

  // Faculty state
  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [showBulkImportFaculty, setShowBulkImportFaculty] = useState(false);
  const [newFacName, setNewFacName] = useState('');
  const [newFacEmail, setNewFacEmail] = useState('');
  const [newFacEmpId, setNewFacEmpId] = useState('');
  const [newFacDept, setNewFacDept] = useState('Computer Science & Engineering');
  const [newFacClassIds, setNewFacClassIds] = useState<string[]>([]);

  // Faculty Edit state
  const [editingFacultyUser, setEditingFacultyUser] = useState<User | null>(null);
  const [editFacName, setEditFacName] = useState('');
  const [editFacEmail, setEditFacEmail] = useState('');
  const [editFacEmpId, setEditFacEmpId] = useState('');
  const [editFacDept, setEditFacDept] = useState('');
  const [editFacClassIds, setEditFacClassIds] = useState<string[]>([]);
  const [editFacIsActive, setEditFacIsActive] = useState(true);

  // Student state
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showBulkImportStudent, setShowBulkImportStudent] = useState(false);
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuRegNo, setNewStuRegNo] = useState('');
  const [newStuDept, setNewStuDept] = useState('Computer Science & Engineering');
  const [newStuClassIds, setNewStuClassIds] = useState<string[]>([]);

  // Student Batch & Sync state
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedBulkClassId, setSelectedBulkClassId] = useState<string>('');
  const [isSyncingRoster, setIsSyncingRoster] = useState(false);
  const [rosterSearchTerm, setRosterSearchTerm] = useState('');

  // Student Edit state
  const [editingStudentUser, setEditingStudentUser] = useState<User | null>(null);
  const [editStuName, setEditStuName] = useState('');
  const [editStuEmail, setEditStuEmail] = useState('');
  const [editStuRegNo, setEditStuRegNo] = useState('');
  const [editStuDept, setEditStuDept] = useState('');
  const [editStuClassIds, setEditStuClassIds] = useState<string[]>([]);
  const [editStuIsActive, setEditStuIsActive] = useState(true);

  const handleExecuteClearAnalytics = async () => {
    setIsClearingAnalytics(true);
    try {
      if (onClearAnalytics) {
        await onClearAnalytics();
      }
      setShowClearAnalyticsModal(false);
      setAnalyticsClearedMsg('Assessment telemetry, test session history, and metrics have been cleared successfully.');
      setTimeout(() => setAnalyticsClearedMsg(null), 5000);
    } catch (err: any) {
      console.error('Error clearing analytics:', err);
    } finally {
      setIsClearingAnalytics(false);
    }
  };

  const handleOpenEditFaculty = (fac: User) => {
    setEditingFacultyUser(fac);
    setEditFacName(fac.name || '');
    setEditFacEmail(fac.email || '');
    setEditFacEmpId(fac.employeeId || '');
    setEditFacDept(fac.department || 'Computer Science & Engineering');
    const assigned = classes
      .filter((c) => isFacultyAssignedToClass(c, fac))
      .map((c) => c.id);
    setEditFacClassIds(assigned);
    setEditFacIsActive(fac.isActive !== false);
  };

  const handleSaveEditFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacultyUser || !editFacName.trim() || !editFacEmail.trim()) return;

    setIsSubmittingUser(true);
    setUserErrorMsg(null);
    setUserSuccessMsg(null);

    try {
      const updatedUser: User = {
        ...editingFacultyUser,
        name: editFacName.trim(),
        email: editFacEmail.trim(),
        employeeId: editFacEmpId.trim(),
        department: editFacDept.trim(),
        classIds: editFacClassIds,
        isActive: editFacIsActive,
      };

      await saveUserToFirestore(updatedUser);
      if (onUpdateUser) {
        await onUpdateUser(updatedUser);
      }

      // Sync classroom staff assignments if changed
      if (onUpdateClass) {
        classes.forEach((cls) => {
          const isCurrentlyAssigned = isFacultyAssignedToClass(cls, editingFacultyUser);
          const shouldBeAssigned = editFacClassIds.includes(cls.id);

          if (isCurrentlyAssigned && !shouldBeAssigned) {
            onUpdateClass({
              ...cls,
              staffIds: (cls.staffIds || []).filter((id) => id !== editingFacultyUser.id),
              facultyIds: (cls.facultyIds || []).filter((id) => id !== editingFacultyUser.id),
            });
          } else if (!isCurrentlyAssigned && shouldBeAssigned) {
            onUpdateClass({
              ...cls,
              staffIds: Array.from(new Set([...(cls.staffIds || []), editingFacultyUser.id])),
              facultyIds: Array.from(new Set([...(cls.facultyIds || []), editingFacultyUser.id])),
            });
          }
        });
      }

      setUserSuccessMsg(`Faculty member "${updatedUser.name}" details updated successfully.`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
      setEditingFacultyUser(null);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to update faculty details.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleOpenEditStudent = (stu: User) => {
    setEditingStudentUser(stu);
    setEditStuName(stu.name || '');
    setEditStuEmail(stu.email || '');
    setEditStuRegNo(stu.registerNumber || stu.registerNo || '');
    setEditStuDept(stu.department || 'Computer Science & Engineering');
    const assigned = classes
      .filter((c) => isStudentAssignedToClass(c, stu))
      .map((c) => c.id);
    setEditStuClassIds(assigned);
    setEditStuIsActive(stu.isActive !== false);
  };

  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentUser || !editStuName.trim() || !editStuEmail.trim()) return;

    setIsSubmittingUser(true);
    setUserErrorMsg(null);
    setUserSuccessMsg(null);

    try {
      // Ensure one student is in only one class
      const singleClassIds = editStuClassIds.slice(-1);
      const chosenClassId = singleClassIds[0] || null;

      const updatedUser: User = {
        ...editingStudentUser,
        name: editStuName.trim(),
        email: editStuEmail.trim(),
        registerNumber: editStuRegNo.trim().toUpperCase(),
        registerNo: editStuRegNo.trim().toUpperCase(),
        department: editStuDept.trim(),
        classIds: singleClassIds,
        isActive: editStuIsActive,
      };

      await saveUserToFirestore(updatedUser);
      if (onUpdateUser) {
        await onUpdateUser(updatedUser);
      }

      // Sync classroom student assignments across all classes
      for (const cls of classes) {
        const isSelected = chosenClassId === cls.id;
        const currentStudents = cls.studentIds || [];
        const isPresent = currentStudents.includes(editingStudentUser.id);

        if (isSelected && !isPresent) {
          const updatedCls = {
            ...cls,
            studentIds: Array.from(new Set([...currentStudents, editingStudentUser.id])),
            updatedAt: new Date().toISOString(),
          };
          await saveClassToFirestore(updatedCls).catch(console.error);
          if (onUpdateClass) onUpdateClass(updatedCls);
        } else if (!isSelected && isPresent) {
          const updatedCls = {
            ...cls,
            studentIds: currentStudents.filter((id) => id !== editingStudentUser.id),
            updatedAt: new Date().toISOString(),
          };
          await saveClassToFirestore(updatedCls).catch(console.error);
          if (onUpdateClass) onUpdateClass(updatedCls);
        }
      }

      setUserSuccessMsg(`Student profile for "${updatedUser.name}" updated successfully.`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
      setEditingStudentUser(null);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to update student profile.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Classes state
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassStaffIds, setNewClassStaffIds] = useState<string[]>([]);
  const [newClassStudentIds, setNewClassStudentIds] = useState<string[]>([]);

  // Selected Class details modal for assignments
  const [selectedClassIdForStudents, setSelectedClassIdForStudents] = useState<string | null>(null);
  const [assignStaffModalClassId, setAssignStaffModalClassId] = useState<string | null>(null);
  const [addStudentToClassModalId, setAddStudentToClassModalId] = useState<string | null>(null);

  // Settings local state
  const [localSettings, setLocalSettings] = useState<SystemSettings>(
    systemSettings || {
      cameraRequired: true,
      microphoneRequired: true,
      liveFacultyMonitoring: true,
      showCameraPreviewToStudent: true,
      detectMultiplePersons: true,
      detectNoPerson: true,
      detectCameraObstruction: true,
      detectVideoFreeze: true,
      detectTabSwitch: true,
      detectWindowBlur: true,
      requireFullscreen: true,
      allowPageRefresh: false,
      allowReconnect: true,
      maxWarnings: 5,
      autoSubmitOnWarningLimit: true,
      allowedLanguages: ['python', 'javascript', 'cpp', 'java'],
      assessmentDuration: 60,
      questionNavigation: true,
      randomizeQuestions: false,
    }
  );

  const facultyMembers = users.filter((u) => u.role === 'FACULTY');
  const candidateMembers = users.filter(isStudentUser);

  // Compute Real Programming Language Distribution strictly from actual submissions
  const realLanguageDistribution = React.useMemo(() => {
    const counts: Record<string, number> = {
      python: 0,
      javascript: 0,
      cpp: 0,
      java: 0,
    };
    let total = 0;

    submissions.forEach((sub) => {
      if (sub.language) {
        const langKey = sub.language.toLowerCase().trim();
        const normalizedKey =
          langKey === 'js' || langKey === 'javascript' || langKey === 'node'
            ? 'javascript'
            : langKey === 'c++' || langKey === 'cpp'
            ? 'cpp'
            : langKey;
        counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
        total += 1;
      }
    });

    const standardLanguages = [
      { key: 'python', name: 'Python', color: 'bg-emerald-500' },
      { key: 'javascript', name: 'JavaScript / Node.js', color: 'bg-amber-400' },
      { key: 'cpp', name: 'C++', color: 'bg-indigo-500' },
      { key: 'java', name: 'Java', color: 'bg-rose-500' },
    ];

    if (total === 0) {
      return standardLanguages.map((l) => ({
        key: l.key,
        name: l.name,
        pct: 0,
        count: 0,
        color: l.color,
      }));
    }

    const colorMap: Record<string, string> = {
      python: 'bg-emerald-500',
      javascript: 'bg-amber-400',
      js: 'bg-amber-400',
      cpp: 'bg-indigo-500',
      'c++': 'bg-indigo-500',
      java: 'bg-rose-500',
      c: 'bg-cyan-500',
    };

    return Object.entries(counts).map(([lang, count]) => {
      const formattedName =
        lang === 'python'
          ? 'Python'
          : lang === 'javascript' || lang === 'js'
          ? 'JavaScript / Node.js'
          : lang === 'cpp' || lang === 'c++'
          ? 'C++'
          : lang === 'java'
          ? 'Java'
          : lang.toUpperCase();
      return {
        key: lang,
        name: formattedName,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        count,
        color: colorMap[lang] || 'bg-indigo-500',
      };
    });
  }, [submissions]);

  // Compute Real Session Proctoring & Submission Telemetry
  const realSessionStatusStats = React.useMemo(() => {
    const isMalpracticeSession = (s: CandidateSession) =>
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

    const terminatedCount = sessions.filter((s) => isMalpracticeSession(s)).length;
    const submittedCount = sessions.filter(
      (s) =>
        (s.state === 'SUBMITTED' ||
          s.state === 'AUTO_SUBMITTED' ||
          s.state === 'COMPLETED' ||
          (s as any).submissionStatus === 'SUBMITTED' ||
          (s as any).submissionStatus === 'COMPLETED' ||
          Boolean(s.completedAt)) &&
        !isMalpracticeSession(s)
    ).length;
    const activeCount = sessions.filter(
      (s) => {
        const parentAsm = (assessments || []).find((a) => a.id === s.assessmentId);
        const isAsmClosed =
          parentAsm &&
          (parentAsm.status === 'CLOSED' ||
            parentAsm.status === 'COMPLETED' ||
            parentAsm.status === 'ARCHIVED' ||
            (Boolean(parentAsm.endTime) && new Date(parentAsm.endTime).getTime() <= Date.now() && parentAsm.status !== 'PAUSED'));
        if (isAsmClosed) return false;

        const st = (s.state || (s as any).submissionStatus || '').toUpperCase();
        const rawStatus = ((s as any).status || '').toUpperCase();
        const isClosed =
          st === 'CLOSED' ||
          st === 'DISCONNECTED' ||
          st === 'EXPIRED' ||
          st === 'SUBMITTED' ||
          st === 'AUTO_SUBMITTED' ||
          st === 'COMPLETED' ||
          st === 'TERMINATED_MALPRACTICE' ||
          rawStatus === 'CLOSED' ||
          s.connectionStatus === 'DISCONNECTED' ||
          s.isLive === false ||
          Boolean(s.completedAt);
        return !isClosed && (s.state === 'IN_PROGRESS' || s.state === 'ACTIVE' || s.state === 'ENVIRONMENT_CHECK');
      }
    ).length;
    const flaggedCount = sessions.filter(
      (s) => ((s.warningsCount ?? (s.flags?.length || s.proctoringEvents?.length || 0)) >= 3 || s.state === 'FLAGGED') && !isMalpracticeSession(s)
    ).length;

    const total = sessions.length;

    const scoredSessions = sessions.filter(
      (s) => isCandidateSessionCompleted(s) || (s.score !== undefined && s.score !== null)
    );
    const avgScorePct =
      scoredSessions.length > 0
        ? Math.round(
            scoredSessions.reduce((acc, s) => {
              const asm = (assessments || []).find((a) => a.id === s.assessmentId);
              const resolvedQuestions =
                asm?.questions && asm.questions.length > 0
                  ? asm.questions
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

    const avgCompletionRate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

    return {
      submittedCount,
      activeCount,
      flaggedCount,
      terminatedCount,
      totalSessions: sessions.length,
      submittedPct: total > 0 ? Math.round((submittedCount / total) * 100) : 0,
      activePct: total > 0 ? Math.round((activeCount / total) * 100) : 0,
      flaggedPct: total > 0 ? Math.round((flaggedCount / total) * 100) : 0,
      terminatedPct: total > 0 ? Math.round((terminatedCount / total) * 100) : 0,
      scoredCount: scoredSessions.length,
      avgScorePct,
      avgCompletionRate,
    };
  }, [sessions, assessments]);

  const handleResetPasswordClick = async (u: User) => {
    const defaultPass = u.role === 'FACULTY' ? 'Faculty@123' : u.role === 'CANDIDATE' ? 'Student@123' : 'admin@123';
    if (window.confirm(`Reset password for ${u.name} (${u.email}) to default "${defaultPass}"?`)) {
      try {
        if (onResetUserPassword) {
          await onResetUserPassword(u.id, u.role);
        } else {
          await saveUserToFirestore({ ...u, password: defaultPass });
        }
        setUserSuccessMsg(`Password for "${u.name}" reset to default "${defaultPass}".`);
        setTimeout(() => setUserSuccessMsg(null), 4000);
      } catch (err: any) {
        setUserErrorMsg(err?.message || 'Failed to reset user password.');
      }
    }
  };

  const handleCreateFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacName || !newFacEmail) return;
    setIsSubmittingUser(true);
    setUserErrorMsg(null);
    try {
      await onAddUser({
        name: newFacName.trim(),
        email: newFacEmail.trim(),
        role: 'FACULTY',
        department: newFacDept.trim(),
        employeeId: newFacEmpId.trim() || undefined,
        classIds: newFacClassIds,
        password: 'Faculty@123',
      });
      setUserSuccessMsg(`Faculty member "${newFacName}" registered successfully with default password Faculty@123!`);
      setNewFacName('');
      setNewFacEmail('');
      setNewFacEmpId('');
      setNewFacClassIds([]);
      setShowAddFaculty(false);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to register faculty member.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStuName || !newStuEmail) return;
    setIsSubmittingUser(true);
    setUserErrorMsg(null);
    try {
      await onAddUser({
        name: newStuName.trim(),
        email: newStuEmail.trim(),
        role: 'CANDIDATE',
        registerNumber: newStuRegNo.trim() || `REG${Date.now().toString().slice(-4)}`,
        department: newStuDept.trim(),
        classIds: newStuClassIds,
        password: 'Student@123',
      });
      setUserSuccessMsg(`Student "${newStuName}" enrolled successfully with default password Student@123!`);
      setNewStuName('');
      setNewStuEmail('');
      setNewStuRegNo('');
      setNewStuClassIds([]);
      setShowAddStudent(false);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to enroll student.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleDeleteUserClick = async (u: User) => {
    if (window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      if (onDeleteUser) {
        setDeletingUserId(u.id);
        setUserErrorMsg(null);
        try {
          await onDeleteUser(u.id);
          setUserSuccessMsg(`User "${u.name}" deleted successfully.`);
          setTimeout(() => setUserSuccessMsg(null), 4000);
        } catch (err: any) {
          setUserErrorMsg(err?.message || 'Failed to delete user.');
        } finally {
          setDeletingUserId(null);
        }
      }
    }
  };

  const handleDeleteClassClick = async (cls: Classroom) => {
    if (window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      if (onDeleteClass) {
        setDeletingClassId(cls.id);
        setUserErrorMsg(null);
        try {
          await onDeleteClass(cls.id);
          setUserSuccessMsg(`Classroom "${cls.name}" deleted successfully.`);
          setTimeout(() => setUserSuccessMsg(null), 4000);
        } catch (err: any) {
          setUserErrorMsg(err?.message || 'Failed to delete classroom.');
        } finally {
          setDeletingClassId(null);
        }
      }
    }
  };

  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName) return;
    onAddClass({
      name: newClassName,
      staffIds: newClassStaffIds,
      studentIds: newClassStudentIds,
    });
    setNewClassName('');
    setNewClassStaffIds([]);
    setNewClassStudentIds([]);
    setShowAddClass(false);
  };

  const handleSaveSettings = (settingsToSave: SystemSettings) => {
    if (onUpdateSystemSettings) {
      onUpdateSystemSettings(settingsToSave);
    }
  };

  // Toggle staff assignment in existing class
  const toggleFacultyInClass = (classObj: Classroom, facId: string) => {
    if (!onUpdateClass) return;
    const currentStaff = classObj.staffIds || [];
    const currentFaculty = classObj.facultyIds || [];
    const exists = currentStaff.includes(facId) || currentFaculty.includes(facId);

    const updatedStaff = exists
      ? currentStaff.filter((id) => id !== facId)
      : Array.from(new Set([...currentStaff, facId]));
    const updatedFaculty = exists
      ? currentFaculty.filter((id) => id !== facId)
      : Array.from(new Set([...currentFaculty, facId]));

    onUpdateClass({ ...classObj, staffIds: updatedStaff, facultyIds: updatedFaculty });

    const facUser = users.find((u) => u.id === facId);
    if (facUser && onUpdateUser) {
      const currentClassIds = facUser.classIds || [];
      const updatedClassIds = exists
        ? currentClassIds.filter((id) => id !== classObj.id)
        : Array.from(new Set([...currentClassIds, classObj.id]));
      onUpdateUser({ ...facUser, classIds: updatedClassIds });
    }
  };

  // Toggle student assignment in existing class with resilient bidirectional Firestore persistence
  // Strictly enforcing "One Student, One Class"
  const toggleStudentInClass = async (classObj: Classroom, studentId: string) => {
    const stuUser = users.find((u) => u.id === studentId || u.uid === studentId || u.email === studentId);
    const isCurrentlyEnrolled = stuUser
      ? isStudentAssignedToClass(classObj, stuUser)
      : (classObj.studentIds || []).includes(studentId);

    const actualStudentId = stuUser ? stuUser.id : studentId;

    if (isCurrentlyEnrolled) {
      // Unenroll from this class
      const updatedClassObj: Classroom = {
        ...classObj,
        studentIds: (classObj.studentIds || []).filter((id) => id !== actualStudentId),
        updatedAt: new Date().toISOString(),
      };
      await saveClassToFirestore(updatedClassObj).catch(console.error);
      if (onUpdateClass) onUpdateClass(updatedClassObj);

      if (stuUser) {
        const updatedStuUser: User = {
          ...stuUser,
          classIds: [],
          updatedAt: new Date().toISOString(),
        };
        await saveUserToFirestore(updatedStuUser).catch(console.error);
        if (onUpdateUser) onUpdateUser(updatedStuUser);
      }
    } else {
      // Enroll into this class -> Remove from any other class first
      for (const otherClass of classes) {
        if (otherClass.id !== classObj.id && otherClass.studentIds?.includes(actualStudentId)) {
          const updatedOther: Classroom = {
            ...otherClass,
            studentIds: otherClass.studentIds.filter((id) => id !== actualStudentId),
            updatedAt: new Date().toISOString(),
          };
          await saveClassToFirestore(updatedOther).catch(console.error);
          if (onUpdateClass) onUpdateClass(updatedOther);
        }
      }

      // Add to this class
      const updatedClassObj: Classroom = {
        ...classObj,
        studentIds: Array.from(new Set([...(classObj.studentIds || []), actualStudentId])),
        updatedAt: new Date().toISOString(),
      };
      await saveClassToFirestore(updatedClassObj).catch(console.error);
      if (onUpdateClass) onUpdateClass(updatedClassObj);

      if (stuUser) {
        const updatedStuUser: User = {
          ...stuUser,
          classIds: [classObj.id],
          updatedAt: new Date().toISOString(),
        };
        await saveUserToFirestore(updatedStuUser).catch(console.error);
        if (onUpdateUser) onUpdateUser(updatedStuUser);
      }
    }
  };

  // Quick 1-click assign/switch a single student to a class (or unassign if empty)
  const handleQuickAssignStudentToClass = async (stu: User, targetClassId: string) => {
    try {
      setIsSyncingRoster(true);
      setUserErrorMsg(null);

      if (!targetClassId || targetClassId === 'unassigned') {
        // Unassign from all classes
        for (const cls of classes) {
          if (cls.studentIds?.includes(stu.id)) {
            const updatedCls: Classroom = {
              ...cls,
              studentIds: cls.studentIds.filter((id) => id !== stu.id),
              updatedAt: new Date().toISOString(),
            };
            await saveClassToFirestore(updatedCls).catch(console.error);
            if (onUpdateClass) onUpdateClass(updatedCls);
          }
        }

        const updatedStu: User = { ...stu, classIds: [], updatedAt: new Date().toISOString() };
        await saveUserToFirestore(updatedStu);
        if (onUpdateUser) onUpdateUser(updatedStu);

        setUserSuccessMsg(`Unassigned "${stu.name}" from all classes.`);
      } else {
        const targetClass = classes.find((c) => c.id === targetClassId);
        if (!targetClass) return;

        // 1. Remove from all other classes
        for (const cls of classes) {
          if (cls.id !== targetClassId && cls.studentIds?.includes(stu.id)) {
            const updatedCls: Classroom = {
              ...cls,
              studentIds: cls.studentIds.filter((id) => id !== stu.id),
              updatedAt: new Date().toISOString(),
            };
            await saveClassToFirestore(updatedCls).catch(console.error);
            if (onUpdateClass) onUpdateClass(updatedCls);
          }
        }

        // 2. Add to target class
        const currentStudents = targetClass.studentIds || [];
        const newStudents = Array.from(new Set([...currentStudents, stu.id]));
        const updatedCls: Classroom = { ...targetClass, studentIds: newStudents, updatedAt: new Date().toISOString() };
        await saveClassToFirestore(updatedCls);
        if (onUpdateClass) onUpdateClass(updatedCls);

        // 3. Update student (only 1 class)
        const updatedStu: User = { ...stu, classIds: [targetClass.id], updatedAt: new Date().toISOString() };
        await saveUserToFirestore(updatedStu);
        if (onUpdateUser) onUpdateUser(updatedStu);

        setUserSuccessMsg(`Assigned "${stu.name}" to class "${targetClass.name}".`);
      }
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to assign student to class.');
    } finally {
      setIsSyncingRoster(false);
    }
  };

  // Batch assign multiple students to a designated classroom
  // Strictly enforcing "One Student, One Class"
  const handleBatchAssignStudents = async (targetClassId: string, customStudentIds?: string[]) => {
    const targetClass = classes.find((c) => c.id === targetClassId);
    if (!targetClass) return;

    const idsToAssign =
      customStudentIds && customStudentIds.length > 0
        ? customStudentIds
        : selectedStudentIds.length > 0
        ? selectedStudentIds
        : candidateMembers.map((s) => s.id);

    if (idsToAssign.length === 0) {
      setUserErrorMsg('No candidate students found to assign.');
      return;
    }

    try {
      setIsSyncingRoster(true);
      setUserErrorMsg(null);

      const idsSet = new Set(idsToAssign);

      // 1. Remove assigned students from all OTHER classes
      for (const otherClass of classes) {
        if (otherClass.id !== targetClassId && otherClass.studentIds?.some((id) => idsSet.has(id))) {
          const updatedOther: Classroom = {
            ...otherClass,
            studentIds: otherClass.studentIds.filter((id) => !idsSet.has(id)),
            updatedAt: new Date().toISOString(),
          };
          await saveClassToFirestore(updatedOther).catch(console.error);
          if (onUpdateClass) onUpdateClass(updatedOther);
        }
      }

      // 2. Add to target class
      const currentStudents = targetClass.studentIds || [];
      const mergedStudents = Array.from(new Set([...currentStudents, ...idsToAssign]));
      const updatedTargetClass: Classroom = {
        ...targetClass,
        studentIds: mergedStudents,
        updatedAt: new Date().toISOString(),
      };
      await saveClassToFirestore(updatedTargetClass);
      if (onUpdateClass) onUpdateClass(updatedTargetClass);

      // 3. Update each student to point ONLY to target class
      for (const stuId of idsToAssign) {
        const stu = users.find((u) => u.id === stuId);
        if (stu) {
          const updated: User = {
            ...stu,
            classIds: [targetClass.id],
            updatedAt: new Date().toISOString(),
          };
          await saveUserToFirestore(updated);
          if (onUpdateUser) onUpdateUser(updated);
        }
      }

      setSelectedStudentIds([]);
      setSelectedBulkClassId('');
      setUserSuccessMsg(
        `Successfully assigned ${idsToAssign.length} student(s) to "${targetClass.name}" (one class per student enforced)!`
      );
      setTimeout(() => setUserSuccessMsg(null), 5000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to batch assign students.');
    } finally {
      setIsSyncingRoster(false);
    }
  };

  // Auto-sync all candidate students across all classrooms by department & class
  const handleAutoSyncAllStudentsBySection = async () => {
    if (classes.length === 0) {
      setUserErrorMsg('No classrooms available to synchronize.');
      return;
    }

    try {
      setIsSyncingRoster(true);
      setUserErrorMsg(null);
      let syncCount = 0;

      // Group students exclusively to their best matching class
      const classAssignments: Record<string, string[]> = {};
      classes.forEach((c) => {
        classAssignments[c.id] = [];
      });

      for (const stu of candidateMembers) {
        // Find best matching class
        const matchedClass = classes.find((cls) => isStudentAssignedToClass(cls, stu));
        if (matchedClass) {
          classAssignments[matchedClass.id].push(stu.id);
          const updatedStu: User = {
            ...stu,
            classIds: [matchedClass.id],
            updatedAt: new Date().toISOString(),
          };
          await saveUserToFirestore(updatedStu);
          if (onUpdateUser) onUpdateUser(updatedStu);
          syncCount++;
        }
      }

      // Save updated classrooms
      for (const cls of classes) {
        const newStudentIds = Array.from(new Set(classAssignments[cls.id] || []));
        const updatedClass: Classroom = {
          ...cls,
          studentIds: newStudentIds,
          updatedAt: new Date().toISOString(),
        };
        await saveClassToFirestore(updatedClass);
        if (onUpdateClass) onUpdateClass(updatedClass);
      }

      setUserSuccessMsg(`Auto-sync completed: ${syncCount} students matched & synced exclusively to their respective classes.`);
      setTimeout(() => setUserSuccessMsg(null), 5000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to auto-sync student rosters.');
    } finally {
      setIsSyncingRoster(false);
    }
  };

  // Automated background roster synchronization when candidates or classes change
  const adminAutoSyncRef = useRef<string>('');
  useEffect(() => {
    if (classes.length === 0 || candidateMembers.length === 0) return;
    const currentKey = `${classes.length}_${candidateMembers.length}_${classes.map((c) => c.studentIds?.length || 0).join('-')}`;
    if (adminAutoSyncRef.current === currentKey) return;

    let isMounted = true;
    const autoSyncRosters = async () => {
      try {
        const classAssignments: Record<string, string[]> = {};
        classes.forEach((c) => {
          classAssignments[c.id] = [];
        });

        for (const stu of candidateMembers) {
          const matchedClass = classes.find((cls) => isStudentAssignedToClass(cls, stu));
          if (matchedClass) {
            classAssignments[matchedClass.id].push(stu.id);
            if (!stu.classIds?.includes(matchedClass.id)) {
              const updatedStu: User = {
                ...stu,
                classIds: [matchedClass.id],
                updatedAt: new Date().toISOString(),
              };
              await saveUserToFirestore(updatedStu);
              if (onUpdateUser && isMounted) onUpdateUser(updatedStu);
            }
          }
        }

        for (const cls of classes) {
          const newStudentIds = Array.from(new Set(classAssignments[cls.id] || []));
          if (newStudentIds.length !== (cls.studentIds || []).length) {
            const updatedClass: Classroom = {
              ...cls,
              studentIds: newStudentIds,
              updatedAt: new Date().toISOString(),
            };
            await saveClassToFirestore(updatedClass);
            if (onUpdateClass && isMounted) onUpdateClass(updatedClass);
          }
        }

        if (isMounted) {
          adminAutoSyncRef.current = currentKey;
        }
      } catch (e) {
        console.warn('[AdminDashboard] Auto-sync roster background error:', e);
      }
    };

    autoSyncRosters();

    return () => {
      isMounted = false;
    };
  }, [classes, candidateMembers, onUpdateUser, onUpdateClass]);

  // Roster modal helpers
  const handleEnrollAllInClassModal = async (targetClass: Classroom) => {
    const allCandidateIds = candidateMembers.map((s) => s.id);
    await handleBatchAssignStudents(targetClass.id, allCandidateIds);
  };

  const handleAutoEnrollMatchingInClassModal = async (targetClass: Classroom) => {
    const matching = candidateMembers.filter((s) => isStudentAssignedToClass(targetClass, s)).map((s) => s.id);
    if (matching.length === 0) {
      setUserErrorMsg(`No candidates matched criteria for "${targetClass.name}".`);
      return;
    }
    await handleBatchAssignStudents(targetClass.id, matching);
  };

  const handleUnenrollAllInClassModal = async (targetClass: Classroom) => {
    try {
      setIsSyncingRoster(true);
      const updatedClass: Classroom = {
        ...targetClass,
        studentIds: [],
        updatedAt: new Date().toISOString(),
      };
      await saveClassToFirestore(updatedClass);
      if (onUpdateClass) onUpdateClass(updatedClass);

      for (const stu of candidateMembers) {
        if (stu.classIds?.includes(targetClass.id)) {
          const updatedStu: User = {
            ...stu,
            classIds: stu.classIds.filter((cid) => cid !== targetClass.id),
            updatedAt: new Date().toISOString(),
          };
          await saveUserToFirestore(updatedStu);
          if (onUpdateUser) onUpdateUser(updatedStu);
        }
      }
      setUserSuccessMsg(`Unenrolled all candidates from "${targetClass.name}".`);
      setTimeout(() => setUserSuccessMsg(null), 4000);
    } catch (err: any) {
      setUserErrorMsg(err?.message || 'Failed to unenroll candidates.');
    } finally {
      setIsSyncingRoster(false);
    }
  };

  // 1. SYSTEM SETTINGS VIEW
  if (activeSubNav === 'admin_settings') {
    return (
      <SystemSettingsView
        systemSettings={systemSettings || localSettings}
        facultySettings={facultySettings}
        studentSettings={studentSettings}
        onUpdateSystemSettings={onUpdateSystemSettings || handleSaveSettings}
        onUpdateFacultySettings={onUpdateFacultySettings}
        onUpdateStudentSettings={onUpdateStudentSettings}
        userRole="ADMIN"
        currentUser={currentUser}
        onUpdateAvatar={onUpdateAvatar}
        onUpdatePassword={onUpdatePassword}
      />
    );
  }

  // 3. FACULTY MANAGEMENT & FACULTY-CLASS ASSIGNMENTS
  if (activeSubNav === 'admin_faculty') {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Faculty & Staff Directory
            </h2>
            <p className="text-xs text-slate-400">
              Register educators and manage faculty-class assignments.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setUserErrorMsg(null);
                setShowBulkImportFaculty(true);
              }}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-bold transition border border-slate-700/80 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Bulk Import Faculty</span>
            </button>
            <button
              onClick={() => {
                setUserErrorMsg(null);
                setShowAddFaculty(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Register Faculty</span>
            </button>
          </div>
        </div>

        {userSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{userSuccessMsg}</span>
          </div>
        )}

        {userErrorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{userErrorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facultyMembers.map((fac) => {
            const facClasses = classes.filter((c) => isFacultyAssignedToClass(c, fac));
            return (
              <div
                key={fac.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3.5">
                    <UserAvatar
                      name={fac.name}
                      avatarUrl={fac.avatar || (fac as any).profilePicUrl || (fac as any).photoUrl}
                      sizeClassName="w-10 h-10"
                      textClassName="text-sm"
                    />
                    <div>
                      <h3 className="text-sm font-bold text-white">{fac.name}</h3>
                      <p className="text-xs text-slate-400">{fac.email}</p>
                      {fac.department && (
                        <span className="text-[10px] text-indigo-400 font-medium block mt-0.5">{fac.department}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditFaculty(fac)}
                      className="text-slate-500 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition cursor-pointer"
                      title="Edit Faculty Details"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetPasswordClick(fac)}
                      className="text-slate-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition cursor-pointer"
                      title="Reset Password to default Faculty@123"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {onDeleteUser && (
                      <button
                        type="button"
                        onClick={() => handleDeleteUserClick(fac)}
                        disabled={deletingUserId === fac.id}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition cursor-pointer disabled:opacity-50"
                        title="Remove Faculty Member"
                      >
                        {deletingUserId === fac.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex flex-col space-y-1.5 text-xs text-slate-400">
                    <span className="font-medium">Assigned Classes ({facClasses.length})</span>
                    {facClasses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {facClasses.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] italic text-slate-500">None assigned</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Faculty Modal */}
        {showAddFaculty && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleCreateFaculty}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-base font-bold text-white">Register Faculty Member</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Dr. Alan Turing"
                    value={newFacName}
                    onChange={(e) => setNewFacName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g., alan.turing@codeguard.edu"
                    value={newFacEmail}
                    onChange={(e) => setNewFacEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Department / Program</label>
                  <input
                    type="text"
                    placeholder="e.g., Computer Science & Engineering"
                    value={newFacDept}
                    onChange={(e) => setNewFacDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {classes.length > 0 && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">
                      Assign to Classrooms (Optional)
                    </label>
                    <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      {classes.map((cls) => (
                        <label key={cls.id} className="flex items-center space-x-2 text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-900 text-xs">
                          <input
                            type="checkbox"
                            checked={newFacClassIds.includes(cls.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewFacClassIds([...newFacClassIds, cls.id]);
                              } else {
                                setNewFacClassIds(newFacClassIds.filter((id) => id !== cls.id));
                              }
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span>{cls.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddFaculty(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingUser ? 'Registering...' : 'Register Faculty'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Faculty Modal */}
        {editingFacultyUser && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveEditFaculty}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  <span>Edit Faculty Profile</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingFacultyUser(null)}
                  className="text-slate-400 hover:text-white text-sm font-bold"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editFacName}
                    onChange={(e) => setEditFacName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editFacEmail}
                    onChange={(e) => setEditFacEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Employee / Faculty ID</label>
                    <input
                      type="text"
                      placeholder="e.g., FAC2026"
                      value={editFacEmpId}
                      onChange={(e) => setEditFacEmpId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Status</label>
                    <select
                      value={editFacIsActive ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => setEditFacIsActive(e.target.value === 'ACTIVE')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Department / Program</label>
                  <input
                    type="text"
                    placeholder="e.g., Computer Science & Engineering"
                    value={editFacDept}
                    onChange={(e) => setEditFacDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {classes.length > 0 && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Assigned Classrooms</label>
                    <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-800">
                      {classes.map((cls) => (
                        <label
                          key={cls.id}
                          className="flex items-center space-x-2 text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-900 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={editFacClassIds.includes(cls.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditFacClassIds([...editFacClassIds, cls.id]);
                              } else {
                                setEditFacClassIds(editFacClassIds.filter((id) => id !== cls.id));
                              }
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span>{cls.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFacultyUser(null)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingUser ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bulk Import Faculty Modal */}
        <BulkImportModal
          isOpen={showBulkImportFaculty}
          onClose={() => setShowBulkImportFaculty(false)}
          type="FACULTY"
          existingUsers={users}
          classes={classes}
          onAddUser={onAddUser}
          onSuccess={(count) => {
            setUserSuccessMsg(`Successfully imported and registered ${count} faculty member(s)!`);
            setTimeout(() => setUserSuccessMsg(null), 5000);
          }}
        />
      </div>
    );
  }

  // 4. STUDENTS DIRECTORY
  if (activeSubNav === 'admin_students') {
    const filteredStudents = candidateMembers.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.registerNumber && String(s.registerNumber).toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-400" />
              Enrolled Students Directory
            </h2>
            <p className="text-xs text-slate-400">
              Active candidates with registration numbers and class associations.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => {
                setUserErrorMsg(null);
                setShowBulkImportStudent(true);
              }}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-bold transition border border-slate-700/80 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Bulk Import Students</span>
            </button>
            <button
              onClick={() => {
                setUserErrorMsg(null);
                setShowAddStudent(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Enroll Student</span>
            </button>
          </div>
        </div>

        {userSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{userSuccessMsg}</span>
          </div>
        )}

        {userErrorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{userErrorMsg}</span>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Student Name</th>
                <th className="p-3.5">Register No</th>
                <th className="p-3.5">Email</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Assigned Class</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredStudents.map((stu) => {
                const stuClasses = classes.filter((c) => isStudentAssignedToClass(c, stu));
                return (
                  <tr key={stu.id} className="hover:bg-slate-800/40">
                    <td className="p-3.5 font-medium text-white flex items-center gap-2">
                      <UserAvatar
                        name={stu.name}
                        avatarUrl={stu.avatar || (stu as any).profilePicUrl || (stu as any).photoUrl}
                        sizeClassName="w-7 h-7"
                        textClassName="text-xs"
                      />
                      {stu.name}
                    </td>
                    <td className="p-3.5 font-mono text-indigo-400 font-semibold">
                      {stu.registerNumber || stu.registerNo || 'N/A'}
                    </td>
                    <td className="p-3.5 text-slate-400">{stu.email}</td>
                    <td className="p-3.5 text-slate-300">{stu.department || 'General'}</td>
                    <td className="p-3.5">
                      {stuClasses.length > 0 ? (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
                          {stuClasses[0].name}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {stu.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditStudent(stu)}
                          className="text-slate-500 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Student Profile & Class"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPasswordClick(stu)}
                          className="text-slate-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                          title="Reset Password to default Student@123"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteUser && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUserClick(stu)}
                            disabled={deletingUserId === stu.id}
                            className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                            title="Remove Student"
                          >
                            {deletingUserId === stu.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
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

        {/* Enroll Student Modal */}
        {showAddStudent && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleCreateStudent}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-base font-bold text-white">Enroll New Student</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Student Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Alex Johnson"
                    value={newStuName}
                    onChange={(e) => setNewStuName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g., alex.johnson@codeguard.edu"
                    value={newStuEmail}
                    onChange={(e) => setNewStuEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Register Number</label>
                  <input
                    type="text"
                    placeholder="e.g., REG2026101"
                    value={newStuRegNo}
                    onChange={(e) => setNewStuRegNo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Department / Discipline</label>
                  <input
                    type="text"
                    placeholder="e.g., Computer Science & Engineering"
                    value={newStuDept}
                    onChange={(e) => setNewStuDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {classes.length > 0 && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">
                      Assigned Classroom (1 class per student)
                    </label>
                    <select
                      value={newStuClassIds[0] || ''}
                      onChange={(e) => setNewStuClassIds(e.target.value ? [e.target.value] : [])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    >
                      <option value="">-- No Classroom (Unassigned) --</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingUser ? 'Enrolling...' : 'Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Student Modal */}
        {editingStudentUser && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveEditStudent}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  <span>Edit Student Profile</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingStudentUser(null)}
                  className="text-slate-400 hover:text-white text-sm font-bold"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Student Name</label>
                  <input
                    type="text"
                    required
                    value={editStuName}
                    onChange={(e) => setEditStuName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editStuEmail}
                    onChange={(e) => setEditStuEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Register Number / USN</label>
                  <input
                    type="text"
                    placeholder="e.g., REG2026101"
                    value={editStuRegNo}
                    onChange={(e) => setEditStuRegNo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Department</label>
                    <input
                      type="text"
                      placeholder="e.g., Computer Science & Engineering"
                      value={editStuDept}
                      onChange={(e) => setEditStuDept(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Status</label>
                    <select
                      value={editStuIsActive ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(e) => setEditStuIsActive(e.target.value === 'ACTIVE')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ACTIVE font-medium">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>

                {classes.length > 0 && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">
                      Assigned Classroom (1 class per student)
                    </label>
                    <select
                      value={editStuClassIds[0] || ''}
                      onChange={(e) => setEditStuClassIds(e.target.value ? [e.target.value] : [])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    >
                      <option value="">-- No Classroom (Unassigned) --</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStudentUser(null)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingUser ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bulk Import Student Modal */}
        <BulkImportModal
          isOpen={showBulkImportStudent}
          onClose={() => setShowBulkImportStudent(false)}
          type="STUDENT"
          existingUsers={users}
          classes={classes}
          onAddUser={onAddUser}
          onSuccess={(count) => {
            setUserSuccessMsg(`Successfully imported and enrolled ${count} student(s)!`);
            setTimeout(() => setUserSuccessMsg(null), 5000);
          }}
        />
      </div>
    );
  }

  // 5. CLASSES & ASSIGNMENTS MANAGEMENT
  if (activeSubNav === 'admin_classes') {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Classrooms & Roster Assignments
            </h2>
            <p className="text-xs text-slate-400">
              Manage faculty-class and student-class assignments with instant synchronization.
            </p>
          </div>
          <button
            onClick={() => setShowAddClass(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Create Class</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {classes.map((cls) => {
            const assignedStaff = users.filter((u) => u.role === 'FACULTY' && isFacultyAssignedToClass(cls, u));
            const assignedStudents = users.filter((u) => isStudentUser(u) && isStudentAssignedToClass(cls, u));

            return (
              <div
                key={cls.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 hover:border-indigo-500/30 transition shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{cls.name}</h3>
                    <p className="text-xs text-slate-500">
                      Created {new Date(cls.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] bg-slate-800 font-bold text-indigo-400 px-2.5 py-1 rounded-full border border-slate-700">
                      {assignedStudents.length} Students
                    </span>
                    {onDeleteClass && (
                      <button
                        type="button"
                        onClick={() => handleDeleteClassClick(cls)}
                        disabled={deletingClassId === cls.id}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                        title="Delete Classroom"
                      >
                        {deletingClassId === cls.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Faculty Assignments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Assigned Faculty ({assignedStaff.length}):
                    </span>
                    <button
                      onClick={() => setAssignStaffModalClassId(cls.id)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      + Assign / Change
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {assignedStaff.map((staff) => (
                      <span
                        key={staff.id}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5"
                      >
                        {staff.name}
                        {onUpdateClass && (
                          <button
                            onClick={() => toggleFacultyInClass(cls, staff.id)}
                            className="hover:text-rose-400 text-slate-400 font-bold ml-1"
                            title="Unassign faculty"
                          >
                            &times;
                          </button>
                        )}
                      </span>
                    ))}
                    {assignedStaff.length === 0 && (
                      <span className="text-xs text-slate-500 italic">No faculty assigned</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Create Class Modal */}
        {showAddClass && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleCreateClass}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-base font-bold text-white">Create New Classroom</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Class Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., CS-401 Algorithms & Data Structures"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    Assign Faculty Instructors
                  </label>
                  <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    {facultyMembers.map((f) => (
                      <label key={f.id} className="flex items-center space-x-2 text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-900">
                        <input
                          type="checkbox"
                          checked={newClassStaffIds.includes(f.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewClassStaffIds([...newClassStaffIds, f.id]);
                            } else {
                              setNewClassStaffIds(newClassStaffIds.filter((id) => id !== f.id));
                            }
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span>{f.name}</span>
                        <span className="text-slate-500 text-[10px]">({f.email})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClass(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Assign Faculty to Class Modal */}
        {assignStaffModalClassId && (() => {
          const targetClass = classes.find((c) => c.id === assignStaffModalClassId);
          if (!targetClass) return null;

          return (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
                <h3 className="text-base font-bold text-white">
                  Assign Faculty to {targetClass.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Select faculty members who have permission to conduct and review assessments for this classroom.
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {facultyMembers.map((fac) => {
                    const isAssigned = isFacultyAssignedToClass(targetClass, fac);
                    return (
                      <div
                        key={fac.id}
                        className={`p-3 rounded-xl border flex items-center justify-between transition ${
                          isAssigned
                            ? 'bg-indigo-600/10 border-indigo-500/40'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-white">{fac.name}</div>
                          <div className="text-[11px] text-slate-400">{fac.email}</div>
                        </div>
                        <button
                          onClick={() => toggleFacultyInClass(targetClass, fac.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                            isAssigned
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                              : 'bg-indigo-600 text-white hover:bg-indigo-500'
                          }`}
                        >
                          {isAssigned ? 'Remove' : 'Assign'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setAssignStaffModalClassId(null)}
                    className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // 6. FACULTY AUDIT LOGS & HISTORY
  if (activeSubNav === 'admin_audit_logs') {
    return (
      <FacultyAuditLogView
        auditLogs={auditLogs}
        users={users}
        onAddLogEntry={async (entry) => {
          await logAuditEntry(entry);
        }}
      />
    );
  }

  // DEFAULT ADMIN DASHBOARD (Overview)
  return (
    <div className="p-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Institutional Governance & System Telemetry</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Admin Overview
          </h1>
          <p className="text-zinc-400 text-sm">
            Real-time proctoring telemetry, institutional metrics, and global assessment monitoring.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded border border-emerald-500/20 self-start md:self-auto">
          <CheckCircle className="w-4 h-4" />
          <span>System Active</span>
        </div>
      </div>

      {analyticsClearedMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{analyticsClearedMsg}</span>
        </div>
      )}

      {/* KPI Cards: Single horizontal row on desktop (lg:grid-cols-6), 3 per row on tablet (md:grid-cols-3), 2 on mobile (sm:grid-cols-2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 w-full">
        <div
          onClick={() => onNavigate?.('admin_classes')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to view Classes' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Classes</span>
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{classes.length}</div>
          <div className="text-[10px] text-indigo-400 flex items-center gap-0.5 mt-1 truncate">
            <TrendingUp className="w-3 h-3 shrink-0" /> <span className="truncate">Active Classrooms</span>
          </div>
        </div>

        <div
          onClick={() => onNavigate?.('admin_faculty')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-cyan-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to manage Faculty' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Faculty</span>
            <Users className="w-4 h-4 text-cyan-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{facultyMembers.length}</div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">Active instructors</div>
        </div>

        <div
          onClick={() => onNavigate?.('admin_students')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-violet-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-violet-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to manage Students' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Students</span>
            <GraduationCap className="w-4 h-4 text-violet-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{candidateMembers.length}</div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">Enrolled candidates</div>
        </div>

        <div
          onClick={() => onNavigate?.('admin_history')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to view Active Tests' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Active Tests</span>
            <FileCode2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">{realSessionStatusStats.activeCount}</div>
          <div className="text-[10px] text-emerald-400 mt-1 truncate">
            {realSessionStatusStats.activeCount === 1 ? '1 active candidate' : `${realSessionStatusStats.activeCount} in progress`}
          </div>
        </div>

        <div
          onClick={() => onNavigate?.('admin_history')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-blue-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to view Submitted Assessments' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Submitted</span>
            <BarChart3 className="w-4 h-4 text-blue-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{realSessionStatusStats.submittedCount}</div>
          <div className="text-[10px] text-slate-400 mt-1 truncate">Submitted sessions</div>
        </div>

        <div
          onClick={() => onNavigate?.('admin_audit_logs')}
          className={`p-4 rounded-xl bg-slate-900 border border-slate-800 transition-all duration-200 min-w-0 flex flex-col justify-between ${
            onNavigate ? 'cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-amber-500/5 active:scale-[0.99]' : ''
          }`}
          title={onNavigate ? 'Click to view Faculty Audit Logs' : undefined}
        >
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium truncate pr-1">Faculty Logs</span>
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight">{auditLogs.length}</div>
          <div className="text-[10px] text-amber-400 mt-1 truncate">
            {auditLogs.length === 1 ? '1 log entry' : `${auditLogs.length} history logs`}
          </div>
        </div>
      </div>

      {/* ORIGINAL/REAL DATA ANALYSIS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real Session Telemetry & Proctoring Status Breakdown */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Real Assessment Telemetry & Status
            </h3>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 font-mono">
                {realSessionStatusStats.totalSessions} Total Sessions
              </span>
              <button
                type="button"
                onClick={() => setShowClearAnalyticsModal(true)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition cursor-pointer"
                title="Clear all session telemetry and analytics"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Analytics</span>
              </button>
            </div>
          </div>

          {/* Real Metrics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Completion Rate</div>
              <div className="text-base font-bold text-emerald-400 font-mono">{realSessionStatusStats.avgCompletionRate}%</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Avg Score</div>
              <div className="text-base font-bold text-indigo-400 font-mono">
                {realSessionStatusStats.scoredCount > 0 ? `${realSessionStatusStats.avgScorePct}%` : 'N/A'}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-slate-400">Evaluated</div>
              <div className="text-base font-bold text-white font-mono">{realSessionStatusStats.scoredCount} tests</div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Submitted
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {realSessionStatusStats.submittedCount} ({realSessionStatusStats.submittedPct}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${realSessionStatusStats.submittedPct}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                  Live Active Test Sessions
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {realSessionStatusStats.activeCount} ({realSessionStatusStats.activePct}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${realSessionStatusStats.activePct}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Flagged Risk / Malpractice Alert
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {realSessionStatusStats.flaggedCount} ({realSessionStatusStats.flaggedPct}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${realSessionStatusStats.flaggedPct}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Terminated Sessions
                </span>
                <span className="font-mono text-slate-300 font-bold">
                  {realSessionStatusStats.terminatedCount} ({realSessionStatusStats.terminatedPct}%)
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${realSessionStatusStats.terminatedPct}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Real Programming Language Selection Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-cyan-400" />
              Real Programming Languages Usage
            </h3>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 font-mono">
                {submissions.length} Total Submissions
              </span>
              <button
                type="button"
                onClick={() => setShowClearAnalyticsModal(true)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition cursor-pointer"
                title="Clear programming language usage and submission telemetry"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {realLanguageDistribution.map((lang) => (
              <div key={lang.name} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-300">
                  <span>{lang.name}</span>
                  <span className="font-mono text-slate-400">
                    {lang.count > 0 ? `${lang.count} sub (${lang.pct}%)` : '0 sub (0%)'}
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full ${lang.color} rounded-full transition-all duration-500`}
                    style={{ width: `${lang.pct}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STUDENT RANKING LEADERBOARD SECTION (Class-wise & Overall) */}
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

      {/* Classroom Status Overview */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-400" />
            Classroom Roster Overview & Quick Stats
          </h3>
          <span className="text-xs text-slate-400 font-mono">Live Sync Active</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {classes.slice(0, 6).map((c) => {
            const stuCount = users.filter((u) => isStudentUser(u) && isStudentAssignedToClass(c, u)).length;
            const staffCount = users.filter((u) => u.role === 'FACULTY' && isFacultyAssignedToClass(c, u)).length;
            return (
              <div key={c.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-bold text-white">{c.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Students: <strong className="text-indigo-400">{stuCount}</strong></span>
                  <span>Faculty: <strong className="text-cyan-400">{staffCount}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CLEAR ANALYTICS CONFIRMATION MODAL */}
      {showClearAnalyticsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Clear Assessment Analytics?</h3>
                <p className="text-xs text-slate-400">This will reset session telemetry & history metrics.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will permanently delete all completed and active test session records, candidate submissions, proctoring alerts, and telemetry logs from the database. Assessment templates and student profiles will remain intact.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isClearingAnalytics}
                onClick={() => setShowClearAnalyticsModal(false)}
                className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingAnalytics}
                onClick={handleExecuteClearAnalytics}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold transition shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {isClearingAnalytics && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Yes, Clear Analytics</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
