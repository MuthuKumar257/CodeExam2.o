import React, { useState, useEffect, useRef } from 'react';
import { compressAvatarImage } from '../../utils/imageCompressor';
import {
  Sliders,
  ShieldCheck,
  Video,
  Clock,
  Code2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  Lock,
  CheckCircle,
  AlertTriangle,
  User as UserIcon,
  Upload,
  Sparkles,
  Monitor,
  Trash2,
  Database,
  Laptop,
  Moon,
  Sun,
  Palette,
  Volume2,
  VolumeX,
  Layout,
  FileText,
  Bell,
  Check,
  Settings2,
  SlidersHorizontal,
  BookOpen,
  Layers,
  ShieldAlert,
  Cpu,
  HardDrive,
  Terminal,
  CheckSquare,
  HelpCircle,
  RotateCcw,
  Radio,
  ArrowRightLeft,
  Globe,
  Server,
  Activity,
  Pause,
} from 'lucide-react';
import {
  SystemSettings,
  FacultySettings,
  StudentSettings,
  UserRole,
  User,
} from '../../types';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_FACULTY_SETTINGS,
  DEFAULT_STUDENT_SETTINGS,
  reconcileAllData,
  isSupabaseConfigured,
  validateCoreRlsPolicies,
  fetchAndSyncAllData,
  clearAllAssessmentsAndHistory,
  updateUserPassword,
} from '../../services/firebase';
import {
  purgeExpiredVideos,
  deleteSessionVideo,
  deleteAllStoredVideos,
  getAllStoredVideosMeta,
  getStorageUsageStats,
  StoredVideoMeta,
  StorageUsageStats,
} from '../../services/videoStorage';

interface SystemSettingsViewProps {
  systemSettings: SystemSettings;
  facultySettings?: FacultySettings;
  studentSettings?: StudentSettings;
  onUpdateSystemSettings: (settings: SystemSettings) => void;
  onUpdateFacultySettings?: (settings: FacultySettings) => void;
  onUpdateStudentSettings?: (settings: StudentSettings) => void;
  userRole: UserRole;
  currentUser?: User;
  onUpdatePassword?: (newPassword: string) => Promise<void>;
  onUpdateAvatar?: (avatarUrl: string) => Promise<void>;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
];

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  systemSettings,
  facultySettings = DEFAULT_FACULTY_SETTINGS,
  studentSettings = DEFAULT_STUDENT_SETTINGS,
  onUpdateSystemSettings,
  onUpdateFacultySettings,
  onUpdateStudentSettings,
  userRole,
  currentUser,
  onUpdatePassword,
  onUpdateAvatar,
}) => {
  // Navigation tabs depending on role
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (userRole === 'ADMIN') return 'system_proctoring';
    if (userRole === 'FACULTY') return 'faculty_authoring';
    return 'student_editor';
  });

  // Local drafts for real-time editing
  const [localSystem, setLocalSystem] = useState<SystemSettings>({
    ...DEFAULT_SYSTEM_SETTINGS,
    ...systemSettings,
  });

  const [localFaculty, setLocalFaculty] = useState<FacultySettings>({
    ...DEFAULT_FACULTY_SETTINGS,
    ...facultySettings,
  });

  const [localStudent, setLocalStudent] = useState<StudentSettings>({
    ...DEFAULT_STUDENT_SETTINGS,
    ...studentSettings,
  });

  // Sync state when props change from Firestore
  useEffect(() => {
    if (systemSettings) {
      setLocalSystem((prev) => ({ ...prev, ...systemSettings }));
    }
  }, [systemSettings]);

  useEffect(() => {
    if (facultySettings) {
      setLocalFaculty((prev) => ({ ...prev, ...facultySettings }));
    }
  }, [facultySettings]);

  useEffect(() => {
    if (studentSettings) {
      setLocalStudent((prev) => ({ ...prev, ...studentSettings }));
    }
  }, [studentSettings]);

  // UI Feedback States
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Profile & Password States
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  // Avatar Management States
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentUser?.avatar || PRESET_AVATARS[0]);
  const [isSavingAvatar, setIsSavingAvatar] = useState<boolean>(false);
  const [avatarSuccessMsg, setAvatarSuccessMsg] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Video purge & deletion state (for Admin)
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [storedVideos, setStoredVideos] = useState<StoredVideoMeta[]>([]);
  const [videoStats, setVideoStats] = useState<StorageUsageStats | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [isDeletingAllVideos, setIsDeletingAllVideos] = useState<boolean>(false);

  // Database Sync & Multi-Instance Reconciliation States
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [syncStatusData, setSyncStatusData] = useState<any>(null);
  const [reconcileResult, setReconcileResult] = useState<{ success: boolean; message: string } | null>(null);
  const [rlsValidationResults, setRlsValidationResults] = useState<any>(null);
  const [isValidatingRls, setIsValidatingRls] = useState<boolean>(false);

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) {
        const json = await res.json();
        setSyncStatusData(json);
      }
    } catch (e) {
      console.warn('Could not load sync status:', e);
    }
  };

  const handleReconcileNow = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const res = await reconcileAllData();
      setReconcileResult(res);
      await loadSyncStatus();
      if (res.success) {
        showSyncNotification('Bi-directional reconciliation completed successfully!');
      }
    } catch (err: any) {
      setReconcileResult({ success: false, message: err?.message || 'Reconciliation failed' });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleValidateRls = async () => {
    setIsValidatingRls(true);
    try {
      const results = await validateCoreRlsPolicies();
      setRlsValidationResults(results);
    } catch (err: any) {
      console.warn('RLS validation error:', err);
    } finally {
      setIsValidatingRls(false);
    }
  };

  useEffect(() => {
    if (userRole === 'ADMIN' && activeTab === 'system_database_sync') {
      loadSyncStatus();
    }
  }, [userRole, activeTab]);

  const loadStoredVideosData = async () => {
    try {
      const metas = await getAllStoredVideosMeta(localSystem.videoRetentionDays);
      setStoredVideos(metas);
      const stats = await getStorageUsageStats(localSystem.videoRetentionDays);
      setVideoStats(stats);
    } catch (err) {
      console.warn('Error loading video metadata:', err);
    }
  };

  useEffect(() => {
    if (userRole === 'ADMIN' && activeTab === 'system_retention') {
      loadStoredVideosData();
    }
  }, [userRole, activeTab, localSystem.videoRetentionDays]);

  const showSyncNotification = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 4000);
  };

  // Save Handlers
  const handleSaveSystemSettings = async () => {
    setIsSaving(true);
    try {
      await onUpdateSystemSettings(localSystem);
      showSyncNotification('Institutional & Proctoring Settings successfully synchronized!');
    } catch (err: any) {
      console.error('Failed to sync system settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFacultySettings = async () => {
    setIsSaving(true);
    try {
      if (onUpdateFacultySettings) {
        await onUpdateFacultySettings(localFaculty);
      }
      showSyncNotification('Faculty Authoring & Evaluation Preferences synchronized!');
    } catch (err: any) {
      console.error('Failed to sync faculty settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStudentSettings = async () => {
    setIsSaving(true);
    try {
      if (onUpdateStudentSettings) {
        await onUpdateStudentSettings(localStudent);
      }
      showSyncNotification('Code Workspace & Accessibility Settings synchronized!');
    } catch (err: any) {
      console.error('Failed to sync student settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = (type: 'system' | 'faculty' | 'student') => {
    if (type === 'system') {
      setLocalSystem(DEFAULT_SYSTEM_SETTINGS);
      onUpdateSystemSettings(DEFAULT_SYSTEM_SETTINGS);
      showSyncNotification('Reset Institutional Settings to standard defaults.');
    } else if (type === 'faculty') {
      setLocalFaculty(DEFAULT_FACULTY_SETTINGS);
      if (onUpdateFacultySettings) onUpdateFacultySettings(DEFAULT_FACULTY_SETTINGS);
      showSyncNotification('Reset Faculty Preferences to standard defaults.');
    } else if (type === 'student') {
      setLocalStudent(DEFAULT_STUDENT_SETTINGS);
      if (onUpdateStudentSettings) onUpdateStudentSettings(DEFAULT_STUDENT_SETTINGS);
      showSyncNotification('Reset Student Code Editor to standard defaults.');
    }
  };

  const handlePurgeNow = async () => {
    setIsPurging(true);
    setPurgeResult(null);
    try {
      const purged = await purgeExpiredVideos(localSystem.videoRetentionDays || 15);
      setPurgeResult(`Purge complete! ${purged.purgedCount} expired recording sessions (${(purged.freedBytes / (1024 * 1024)).toFixed(2)} MB) removed from storage.`);
      await loadStoredVideosData();
    } catch (err: any) {
      setPurgeResult('Purge error: ' + (err?.message || 'Failed to purge recordings'));
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeleteSingleVideo = async (sessionId: string) => {
    if (!window.confirm(`Are you sure you want to delete the recorded proctoring video for session ${sessionId}?`)) return;
    setDeletingVideoId(sessionId);
    try {
      await deleteSessionVideo(sessionId);
      setPurgeResult(`Successfully deleted video for session ${sessionId}.`);
      await loadStoredVideosData();
    } catch (err: any) {
      setPurgeResult('Failed to delete video: ' + (err?.message || 'Unknown error'));
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleDeleteAllStoredVideos = async () => {
    if (!window.confirm('Are you sure you want to delete ALL recorded proctoring videos? This action cannot be undone.')) return;
    setIsDeletingAllVideos(true);
    try {
      const count = await deleteAllStoredVideos();
      setPurgeResult(`Successfully deleted all ${count} recorded proctoring videos.`);
      await loadStoredVideosData();
    } catch (err: any) {
      setPurgeResult('Failed to delete videos: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDeletingAllVideos(false);
    }
  };

  // Assessment & Assessment History Wipe Handler
  const [isClearingAssessments, setIsClearingAssessments] = useState<boolean>(false);
  const [clearAssessmentsResult, setClearAssessmentsResult] = useState<string | null>(null);

  const handleClearAllAssessments = async () => {
    if (!window.confirm('DANGER: Are you sure you want to permanently delete ALL assessments, candidate exam sessions, test attempts, submissions, and proctoring logs? This cannot be undone.')) return;
    setIsClearingAssessments(true);
    setClearAssessmentsResult(null);
    try {
      await clearAllAssessmentsAndHistory();
      setClearAssessmentsResult('All assessments, candidate sessions, and submission histories have been permanently deleted.');
      await loadSyncStatus();
    } catch (err: any) {
      setClearAssessmentsResult('Failed to clear assessments: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsClearingAssessments(false);
    }
  };

  // Avatar Upload Handlers
  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image file size must be less than 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const compressed = await compressAvatarImage(base64, 250, 250, 0.75);
        setSelectedAvatar(compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    if (!onUpdateAvatar || !selectedAvatar) return;
    setIsSavingAvatar(true);
    setAvatarSuccessMsg(null);
    try {
      const compressedAvatar = await compressAvatarImage(selectedAvatar, 250, 250, 0.75);
      await onUpdateAvatar(compressedAvatar);
      setAvatarSuccessMsg('Profile picture updated successfully!');
      setTimeout(() => setAvatarSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Error saving avatar:', err);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Password Update
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (newPass.length < 6) {
      setPassError('Password must be at least 6 characters long.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsUpdatingPass(true);
    try {
      if (onUpdatePassword) {
        await onUpdatePassword(newPass);
      } else if (currentUser?.id) {
        await updateUserPassword(currentUser.id, newPass);
      }
      setPassSuccess('Account password updated and securely synced!');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPassSuccess(null), 4000);
    } catch (err: any) {
      setPassError(err.message || 'Failed to update password.');
    } finally {
      setIsUpdatingPass(false);
    }
  };

  const languageOptions = [
    { id: 'python', name: 'Python 3.10', icon: '🐍' },
    { id: 'java', name: 'Java OpenJDK 17', icon: '☕' },
    { id: 'cpp', name: 'C++ (GCC 11)', icon: '⚡' },
    { id: 'javascript', name: 'JavaScript (Node.js)', icon: '🟨' },
    { id: 'c', name: 'C (GCC 11)', icon: '⚙️' },
    { id: 'go', name: 'Go 1.20', icon: '🐹' },
    { id: 'rust', name: 'Rust 1.70', icon: '🦀' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in text-slate-100">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Configuration & Preferences ({userRole})</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            System Settings
          </h1>
          <p className="text-zinc-400 text-sm">
            {userRole === 'ADMIN'
              ? 'Configure institution-wide AI proctoring, storage retention policies, and role presets.'
              : userRole === 'FACULTY'
              ? 'Customize assessment authoring defaults and live monitoring alert settings.'
              : 'Customize your coding workspace, typography, theme, and editor preferences.'}
          </p>
        </div>
      </div>

      {/* SUCCESS NOTICE */}
      {savedNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 font-medium shadow-lg animate-fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-white">Settings Synchronized!</p>
            <p className="text-emerald-300/80 text-[11px]">{savedNotice}</p>
          </div>
        </div>
      )}

      {/* ROLE-AWARE TAB SELECTOR */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
        {userRole === 'ADMIN' && (
          <>
            <button
              onClick={() => setActiveTab('system_proctoring')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'system_proctoring'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-indigo-300" />
              <span>Institutional AI Proctoring</span>
            </button>

            <button
              onClick={() => setActiveTab('system_retention')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'system_retention'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <HardDrive className="w-4 h-4 text-indigo-300" />
              <span>Storage & Video Retention</span>
            </button>

            <button
              onClick={() => setActiveTab('system_database_sync')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'system_database_sync'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 text-indigo-300" />
              <span>Database & Cloud Sync</span>
            </button>
          </>
        )}

        {userRole === 'FACULTY' && (
          <>
            <button
              onClick={() => setActiveTab('faculty_authoring')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'faculty_authoring'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-300" />
              <span>Assessment Authoring Defaults</span>
            </button>

            <button
              onClick={() => setActiveTab('faculty_monitoring')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'faculty_monitoring'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Video className="w-4 h-4 text-indigo-300" />
              <span>Live Proctoring & Feed Alerts</span>
            </button>
          </>
        )}

        {userRole === 'CANDIDATE' && (
          <>
            <button
              onClick={() => setActiveTab('student_editor')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'student_editor'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Code2 className="w-4 h-4 text-indigo-300" />
              <span>Code Editor & Themes</span>
            </button>
          </>
        )}

        {/* Profile & Security Tab is shared across all roles */}
        <button
          onClick={() => setActiveTab('profile_security')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ml-auto ${
            activeTab === 'profile_security'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <UserIcon className="w-4 h-4 text-indigo-300" />
          <span>My Profile & Security</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. ADMIN TAB: SYSTEM & INSTITUTIONAL AI PROCTORING                         */}
      {/* ========================================================================= */}
      {userRole === 'ADMIN' && activeTab === 'system_proctoring' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Vision & Sensor Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">AI Vision & Biometric Proctoring</h3>
                    <p className="text-[11px] text-slate-400">Continuous webcam verification algorithms</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  Global Policy
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Camera Access Master Switch */}
                <label className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                  localSystem.cameraRequired
                    ? 'bg-indigo-950/30 border-indigo-500/50 shadow-sm'
                    : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white block">Camera Access Required</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        localSystem.cameraRequired ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {localSystem.cameraRequired ? 'MASTER: ENABLED' : 'MASTER: DISABLED'}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Webcam stream required for exam. If disabled, all camera biometric algorithms are turned off.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSystem.cameraRequired}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setLocalSystem({
                        ...localSystem,
                        cameraRequired: isChecked,
                        ...(isChecked
                          ? {
                              detectMultiplePersons: true,
                              detectNoPerson: true,
                              detectCameraObstruction: true,
                              detectVideoFreeze: true,
                              showCameraPreviewToStudent: true,
                            }
                          : {
                              detectMultiplePersons: false,
                              detectNoPerson: false,
                              detectCameraObstruction: false,
                              detectVideoFreeze: false,
                              showCameraPreviewToStudent: false,
                            }),
                      });
                    }}
                    className="rounded text-indigo-600 w-5 h-5 cursor-pointer accent-indigo-600"
                  />
                </label>

                {/* Microphone Monitoring Master Switch */}
                <label className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                  localSystem.microphoneRequired
                    ? 'bg-indigo-950/30 border-indigo-500/50 shadow-sm'
                    : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white block">Microphone Audio Monitoring</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        localSystem.microphoneRequired ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {localSystem.microphoneRequired ? 'MASTER: ENABLED' : 'MASTER: DISABLED'}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Captures acoustic thresholds and flags speech or whispers during examination
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSystem.microphoneRequired}
                    onChange={(e) => setLocalSystem({ ...localSystem, microphoneRequired: e.target.checked })}
                    className="rounded text-indigo-600 w-5 h-5 cursor-pointer accent-indigo-600"
                  />
                </label>

                {/* Dependent Camera Option 1: Multiple Persons */}
                <label className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  !localSystem.cameraRequired
                    ? 'bg-slate-950/40 border-slate-900 opacity-40 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-800/80 cursor-pointer hover:border-slate-700'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white block">Detect Multiple Persons</span>
                      {!localSystem.cameraRequired && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Camera Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      Flags violation when &gt;1 human face is detected in camera feed
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!localSystem.cameraRequired}
                    checked={localSystem.detectMultiplePersons}
                    onChange={(e) => setLocalSystem({ ...localSystem, detectMultiplePersons: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </label>

                {/* Dependent Camera Option 2: Face Absence */}
                <label className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  !localSystem.cameraRequired
                    ? 'bg-slate-950/40 border-slate-900 opacity-40 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-800/80 cursor-pointer hover:border-slate-700'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white block">Detect Face Departure / Absence</span>
                      {!localSystem.cameraRequired && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Camera Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      Alerts when candidate steps away from camera feed
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!localSystem.cameraRequired}
                    checked={localSystem.detectNoPerson}
                    onChange={(e) => setLocalSystem({ ...localSystem, detectNoPerson: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </label>

                {/* Dependent Camera Option 3: Camera Obstruction */}
                <label className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  !localSystem.cameraRequired
                    ? 'bg-slate-950/40 border-slate-900 opacity-40 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-800/80 cursor-pointer hover:border-slate-700'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white block">Detect Camera Obstruction</span>
                      {!localSystem.cameraRequired && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Camera Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      Flags covered lenses or blacked out video feeds
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!localSystem.cameraRequired}
                    checked={localSystem.detectCameraObstruction}
                    onChange={(e) => setLocalSystem({ ...localSystem, detectCameraObstruction: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </label>

                {/* Dependent Camera Option 4: Video Freeze */}
                <label className={`flex items-center justify-between p-3 rounded-xl border transition ${
                  !localSystem.cameraRequired
                    ? 'bg-slate-950/40 border-slate-900 opacity-40 cursor-not-allowed'
                    : 'bg-slate-950 border-slate-800/80 cursor-pointer hover:border-slate-700'
                }`}>
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white block">Detect Video Stream Freeze</span>
                      {!localSystem.cameraRequired && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Camera Disabled
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      Identifies virtual camera loop spoofs and frozen frames
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!localSystem.cameraRequired}
                    checked={localSystem.detectVideoFreeze}
                    onChange={(e) => setLocalSystem({ ...localSystem, detectVideoFreeze: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600 disabled:opacity-40"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                  <div className="pr-4">
                    <span className="font-semibold text-white block">Candidate Screen Recording & Storage</span>
                    <span className="text-slate-400 text-[11px]">
                      Captures full desktop/screen recording during proctored assessment sessions and persists video logs
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSystem.recordScreenRecording ?? true}
                    onChange={(e) => setLocalSystem({ ...localSystem, recordScreenRecording: e.target.checked })}
                    className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                  />
                </label>
              </div>
            </div>

            {/* Browser Lockdown & Strike Enforcement */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Browser Lockdown & Malpractice Thresholds</h3>
                      <p className="text-[11px] text-slate-400">Focus preservation and strike limit rules</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    Enforcement
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Maximum Warning Strikes */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <label className="block text-slate-200 font-semibold mb-0.5">
                        Maximum Warning Strike Limit
                      </label>
                      <span className="text-slate-400 text-[11px]">
                        Exam is flagged or auto-submitted when strikes reach this limit
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={localSystem.maxWarnings}
                        onChange={(e) =>
                          setLocalSystem({
                            ...localSystem,
                            maxWarnings: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-white font-mono font-bold text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-slate-400 text-xs font-semibold">strikes</span>
                    </div>
                  </div>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Auto-Submit on Strike Limit</span>
                      <span className="text-slate-400 text-[11px]">
                        Instantly locks and forces exam finalization when strike limit is reached
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.autoSubmitOnWarningLimit}
                      onChange={(e) => setLocalSystem({ ...localSystem, autoSubmitOnWarningLimit: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Enforce Fullscreen Lockdown</span>
                      <span className="text-slate-400 text-[11px]">
                        Exiting fullscreen immediately issues a malpractice warning strike
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.requireFullscreen}
                      onChange={(e) => setLocalSystem({ ...localSystem, requireFullscreen: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Detect Tab Switching (Alt+Tab)</span>
                      <span className="text-slate-400 text-[11px]">
                        Logs background tab navigation and application switching
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.detectTabSwitch}
                      onChange={(e) => setLocalSystem({ ...localSystem, detectTabSwitch: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Detect Window Focus Blur</span>
                      <span className="text-slate-400 text-[11px]">
                        Detects secondary display cursor movement or OS notifications
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.detectWindowBlur}
                      onChange={(e) => setLocalSystem({ ...localSystem, detectWindowBlur: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Watermark Student ID on Screen</span>
                      <span className="text-slate-400 text-[11px]">
                        Displays semi-transparent security watermark to deter screen photography
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.watermarkStudentId ?? true}
                      onChange={(e) => setLocalSystem({ ...localSystem, watermarkStudentId: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition">
                    <div className="pr-4">
                      <span className="font-semibold text-white block">Show Results to Students</span>
                      <span className="text-slate-400 text-[11px]">
                        Allow candidates to view their scores, evaluation breakdown, and marks immediately after submission
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSystem.showResultsToStudents ?? true}
                      onChange={(e) => setLocalSystem({ ...localSystem, showResultsToStudents: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  {/* Master Assessment Pause Option */}
                  <div className={`p-3.5 rounded-xl border transition ${
                    (localSystem.allowPauseAssessment ?? true)
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-xs'
                      : 'bg-slate-950 border-slate-800/80'
                  }`}>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="pr-4">
                        <div className="flex items-center gap-2">
                          <Pause className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-semibold text-white block">Allow Assessment Pause (Enable / Disable)</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            (localSystem.allowPauseAssessment ?? true)
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {(localSystem.allowPauseAssessment ?? true) ? 'PAUSE: ENABLED' : 'PAUSE: DISABLED'}
                          </span>
                        </div>
                        <span className="text-slate-400 text-[11px] block mt-0.5">
                          Controls whether test pause is permitted. When enabled, candidates can pause exams, freezing the countdown timer and suspending proctoring sensors until resumed.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={localSystem.allowPauseAssessment ?? true}
                        onChange={(e) => setLocalSystem({ ...localSystem, allowPauseAssessment: e.target.checked })}
                        className="rounded text-amber-500 w-5 h-5 cursor-pointer accent-amber-500"
                      />
                    </label>

                    {(localSystem.allowPauseAssessment ?? true) && (
                      <div className="mt-3 pt-3 border-t border-amber-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-medium text-[11px] block">
                            Max Pause Duration
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={localSystem.maxPauseDurationMinutes ?? 15}
                              onChange={(e) => setLocalSystem({
                                ...localSystem,
                                maxPauseDurationMinutes: Math.max(1, parseInt(e.target.value) || 15),
                              })}
                              className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-center text-white font-mono font-bold text-xs focus:outline-none focus:border-amber-500"
                            />
                            <span className="text-slate-400 text-[11px]">minutes per pause</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-300 font-medium text-[11px] block">
                            Max Pauses per Candidate
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={localSystem.maxPausesAllowedPerCandidate ?? 3}
                              onChange={(e) => setLocalSystem({
                                ...localSystem,
                                maxPausesAllowedPerCandidate: Math.max(1, parseInt(e.target.value) || 3),
                              })}
                              className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-center text-white font-mono font-bold text-xs focus:outline-none focus:border-amber-500"
                            />
                            <span className="text-slate-400 text-[11px]">times allowed</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Permitted Languages Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Institutional Compilers & Execution Environments</h3>
                  <p className="text-[11px] text-slate-400">Available execution runtimes across all assessments</p>
                </div>
              </div>
              <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                {localSystem.allowedLanguages?.length || 0} Enabled
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {languageOptions.map((lang) => {
                const isChecked = (localSystem.allowedLanguages || []).includes(lang.id);
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => {
                      const current = localSystem.allowedLanguages || [];
                      const next = isChecked
                        ? current.filter((l) => l !== lang.id)
                        : [...current, lang.id];
                      setLocalSystem({ ...localSystem, allowedLanguages: next });
                    }}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                      isChecked
                        ? 'bg-indigo-950/40 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                        : 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl">{lang.icon}</span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isChecked
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-200 truncate">{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => handleResetToDefaults('system')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Institutional Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleSaveSystemSettings}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Institutional Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ADMIN TAB: STORAGE & VIDEO RETENTION & AUDIT HUB                         */}
      {/* ========================================================================= */}
      {userRole === 'ADMIN' && activeTab === 'system_retention' && (
        <div className="space-y-6">
          {/* Video Retention Period & Auto-Purge Policy */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Video Retention & Auto-Purge Policy</h3>
                  <p className="text-xs text-slate-400">
                    Compliance lifecycle management for candidate webcam and screen recordings
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                Automated Pruning Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Retention Duration Slider */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200">Video Retention Period</label>
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    {localSystem.videoRetentionDays} Days
                  </span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={90}
                  step={1}
                  value={localSystem.videoRetentionDays}
                  onChange={(e) =>
                    setLocalSystem({
                      ...localSystem,
                      videoRetentionDays: parseInt(e.target.value) || 15,
                    })
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>3 Days (Min)</span>
                  <span>15 Days (Recommended)</span>
                  <span>90 Days (Compliance)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Recordings older than {localSystem.videoRetentionDays} days will be automatically deleted from storage to preserve institutional quotas.
                </p>
              </div>

              {/* Auto Purge Toggle & Instant Purge */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                <div>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-semibold text-white">Enable Auto-Purge On Startup</span>
                    <input
                      type="checkbox"
                      checked={localSystem.autoPurgeExpiredVideos ?? true}
                      onChange={(e) =>
                        setLocalSystem({
                          ...localSystem,
                          autoPurgeExpiredVideos: e.target.checked,
                        })
                      }
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Runs background maintenance check whenever faculty or administrator navigates to the dashboard.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400">Manual storage maintenance:</span>
                  <button
                    type="button"
                    onClick={handlePurgeNow}
                    disabled={isPurging}
                    className="px-3 py-1.5 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isPurging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Purge Expired Now</span>
                  </button>
                </div>
              </div>
            </div>

            {purgeResult && (
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
                {purgeResult}
              </div>
            )}
          </div>

          {/* Recorded Videos List & Audit Verification Manager */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Recorded Proctoring Video & Audit Records</h3>
                  <p className="text-xs text-slate-400">
                    Audited candidate webcam and desktop screen recordings ({storedVideos.length} total, {videoStats?.totalMegabytes || '0.00'} MB)
                  </p>
                </div>
              </div>

              {storedVideos.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllStoredVideos}
                  disabled={isDeletingAllVideos}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
                >
                  {isDeletingAllVideos ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Delete All Recorded Videos</span>
                </button>
              )}
            </div>

            {storedVideos.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800/80">
                <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-400">No recorded proctoring videos found in storage</p>
                <p className="text-[11px] text-slate-500 mt-1">Candidate webcam and desktop recordings will appear here upon exam completion.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-3">Session ID / Candidate</th>
                      <th className="p-3">Assessment</th>
                      <th className="p-3">Recorded At</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Drive Verification</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {storedVideos.map((v) => (
                      <tr key={v.sessionId} className="hover:bg-slate-800/40 transition">
                        <td className="p-3">
                          <div className="font-bold text-white font-sans">{v.candidateName || 'Candidate'}</div>
                          <div className="text-[10px] text-slate-400">{v.sessionId}</div>
                        </td>
                        <td className="p-3 font-sans text-slate-300">
                          {v.assessmentTitle || 'Proctored Assessment'}
                        </td>
                        <td className="p-3 text-slate-400">
                          {new Date(v.recordedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3 text-indigo-400 font-bold">
                          {(v.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                            <Check className="w-3 h-3" />
                            <span>Drive Verified</span>
                          </span>
                        </td>
                        <td className="p-3">
                          {v.isExpired ? (
                            <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded">Expired</span>
                          ) : (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                              Active ({v.daysRemaining}d left)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteSingleVideo(v.sessionId)}
                            disabled={deletingVideoId === v.sessionId}
                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="Delete Video"
                          >
                            {deletingVideoId === v.sessionId ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex justify-end p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={handleSaveSystemSettings}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Storage Retention Policy</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2B. ADMIN TAB: DATABASE & MULTI-INSTANCE SYNCHRONIZATION                    */}
      {/* ========================================================================= */}
      {userRole === 'ADMIN' && activeTab === 'system_database_sync' && (
        <div className="space-y-6">
          {/* Cloud Sync & Architecture Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cross-Environment & Cloud Database Synchronization</h3>
                  <p className="text-xs text-slate-400">
                    Real-time state replication across Development, Production preview instances, and Supabase
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono px-3 py-1 rounded-lg border flex items-center gap-1.5 ${
                  isSupabaseConfigured
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full animate-pulse ${isSupabaseConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>{isSupabaseConfigured ? 'Supabase Connected' : 'Local Fallback Mode'}</span>
                </span>
                <button
                  type="button"
                  onClick={loadSyncStatus}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                  title="Refresh Sync Status"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sync Architecture Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    Real-time Sync
                  </span>
                  <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded">Active</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Sockets & polling keep browser tabs and container instances updated automatically every 10 seconds.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    Conflict Resolution
                  </span>
                  <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">Timestamped</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Latest timestamp wins across dev and production instances with non-destructive array merging.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    Offline Resilience
                  </span>
                  <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded">Enabled</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Local storage persistence safeguards tests and submissions even during temporary network interruptions.
                </p>
              </div>
            </div>

            {/* Sync Status Breakdown */}
            {syncStatusData && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Synchronized Collections State
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Last Checked: {new Date(syncStatusData.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.users ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Users</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.assessments ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Assessments</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.questions ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Questions</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.classes ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Classes</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.departments ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Departments</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.sessions ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Exam Sessions</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.submissions ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Submissions</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                    <div className="text-lg font-bold text-indigo-400 font-mono">{syncStatusData.counts?.auditLogs ?? 0}</div>
                    <div className="text-[11px] text-slate-400">Audit Logs</div>
                  </div>
                </div>
              </div>
            )}

            {/* Reconciliation Trigger Card */}
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-indigo-200 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  Manual Cross-Environment Force Reconciliation
                </h4>
                <p className="text-[11px] text-indigo-300/80">
                  Merges client state, dev instance memory, prod instance memory, and Supabase cloud tables without data loss.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReconcileNow}
                  disabled={isReconciling}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50 whitespace-nowrap"
                >
                  {isReconciling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                  <span>{isReconciling ? 'Reconciling...' : 'Reconcile Dev & Prod Now'}</span>
                </button>
              </div>
            </div>

            {reconcileResult && (
              <div className={`p-3.5 rounded-xl text-xs font-mono border flex items-center gap-2 ${
                reconcileResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {reconcileResult.success ? <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
                <span>{reconcileResult.message}</span>
              </div>
            )}

            {/* Row-Level Security Policy Diagnostics */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    Row-Level Security (RLS) & Table Permissions Diagnostic
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Verify that Supabase policies allow authorized read/write operations without 401/403 authorization failures.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleValidateRls}
                  disabled={isValidatingRls}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isValidatingRls ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Run RLS Diagnostic</span>
                </button>
              </div>

              {rlsValidationResults && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {Object.entries(rlsValidationResults).map(([tbl, res]: [string, any]) => (
                    <div key={tbl} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${res.accessible ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="font-mono font-bold text-slate-200">{tbl}</span>
                      </div>
                      <span className={`text-[11px] font-mono ${res.accessible ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {res.accessible ? 'Policy OK (200)' : res.message || 'Restricted'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assessment & History Purge / Reset Section */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-200 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    Danger Zone: Remove All Assessments & History
                  </h4>
                  <p className="text-[11px] text-rose-300/80">
                    Permanently delete all assessments, test sessions, candidate attempt submissions, and proctoring audit logs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAllAssessments}
                    disabled={isClearingAssessments}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isClearingAssessments ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>{isClearingAssessments ? 'Purging...' : 'Remove All Assessments & History'}</span>
                  </button>
                </div>
              </div>

              {clearAssessmentsResult && (
                <div className="p-3.5 rounded-xl text-xs font-mono border bg-rose-500/10 border-rose-500/30 text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{clearAssessmentsResult}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. FACULTY TAB 1: ASSESSMENT AUTHORING DEFAULTS                            */}
      {/* ========================================================================= */}
      {userRole === 'FACULTY' && activeTab === 'faculty_authoring' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Assessment Creation & Grading Defaults</h3>
                  <p className="text-xs text-slate-400">
                    Configure your personalized default values when creating new programming exams
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                Instructor Preferences
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Duration */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-semibold">Preferred Test Duration</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={localFaculty.defaultDurationMinutes}
                    onChange={(e) =>
                      setLocalFaculty({
                        ...localFaculty,
                        defaultDurationMinutes: Math.max(15, parseInt(e.target.value) || 60),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-slate-400 text-xs font-semibold">minutes</span>
                </div>
                <p className="text-[11px] text-slate-400">Default time allotted when launching a new exam draft</p>
              </div>

              {/* Passing Score */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-semibold">Default Passing Score (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={20}
                    max={100}
                    value={localFaculty.defaultPassingScore}
                    onChange={(e) =>
                      setLocalFaculty({
                        ...localFaculty,
                        defaultPassingScore: Math.min(100, Math.max(20, parseInt(e.target.value) || 50)),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-slate-400 text-xs font-semibold">%</span>
                </div>
                <p className="text-[11px] text-slate-400">Benchmark score required for passing certificates</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Enable Camera Proctoring by Default</span>
                  <span className="text-slate-400 text-[11px]">
                    Pre-checks webcam proctoring for newly created assessments
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultEnableCamera ?? true}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultEnableCamera: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Enable Microphone Audio Monitoring by Default</span>
                  <span className="text-slate-400 text-[11px]">
                    Pre-checks microphone audio capture for newly created assessments
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultEnableMicrophone ?? true}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultEnableMicrophone: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Shuffle Questions for Each Student</span>
                  <span className="text-slate-400 text-[11px]">
                    Randomizes problem order automatically during exam delivery
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultRandomizeQuestions}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultRandomizeQuestions: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Allow Free Back-and-Forth Navigation</span>
                  <span className="text-slate-400 text-[11px]">
                    When unchecked, enforces strictly sequential question progression
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultQuestionNavigation ?? true}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultQuestionNavigation: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Award Partial Marks for Test Cases</span>
                  <span className="text-slate-400 text-[11px]">
                    Calculates fractional score based on ratio of passed test cases
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.allowPartialMarking ?? true}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, allowPartialMarking: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Show Solutions & Explanations Immediately</span>
                  <span className="text-slate-400 text-[11px]">
                    Reveals sample solution and complexity analysis right after submission from faculty settings
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultShowSolutionsImmediately ?? false}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultShowSolutionsImmediately: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <div className="pr-4">
                  <span className="font-semibold text-white block">Show Results & Marks to Students</span>
                  <span className="text-slate-400 text-[11px]">
                    Display scores, percentage, and passing status on candidate portal upon test completion
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localFaculty.defaultShowResultsToStudents ?? true}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, defaultShowResultsToStudents: e.target.checked })
                  }
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                />
              </label>

              {/* Faculty Default Allow Assessment Pause */}
              <div className={`p-3.5 rounded-xl border transition ${
                (localFaculty.defaultAllowPauseAssessment ?? true)
                  ? 'bg-amber-950/20 border-amber-500/40 shadow-xs'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-semibold text-white block">Default Allow Assessment Pause</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        (localFaculty.defaultAllowPauseAssessment ?? true)
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {(localFaculty.defaultAllowPauseAssessment ?? true) ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] block mt-0.5">
                      Pre-enables assessment pause capability by default for newly drafted examinations
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={localFaculty.defaultAllowPauseAssessment ?? true}
                    onChange={(e) =>
                      setLocalFaculty({ ...localFaculty, defaultAllowPauseAssessment: e.target.checked })
                    }
                    className="rounded text-amber-500 w-5 h-5 cursor-pointer accent-amber-500"
                  />
                </label>

                {(localFaculty.defaultAllowPauseAssessment ?? true) && (
                  <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Default Max Pause Duration</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={localFaculty.defaultMaxPauseDurationMinutes ?? 15}
                        onChange={(e) =>
                          setLocalFaculty({
                            ...localFaculty,
                            defaultMaxPauseDurationMinutes: Math.max(1, parseInt(e.target.value) || 15),
                          })
                        }
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg p-1 text-center text-white font-mono font-bold text-xs focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-slate-400 text-[11px]">minutes</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => handleResetToDefaults('faculty')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleSaveFacultySettings}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Faculty Preferences</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. FACULTY TAB 2: LIVE MONITORING & ALERT PREFERENCES                     */}
      {/* ========================================================================= */}
      {userRole === 'FACULTY' && activeTab === 'faculty_monitoring' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Live Proctoring Camera Grid & Alert Center</h3>
                  <p className="text-xs text-slate-400">
                    Customize layout density and automated audio/visual alarms during live monitoring
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                Live Proctoring UI
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Grid Density */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-semibold">Video Grid Density</label>
                <select
                  value={localFaculty.liveGridDensity}
                  onChange={(e: any) =>
                    setLocalFaculty({ ...localFaculty, liveGridDensity: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="compact">Compact (6 tiles / row)</option>
                  <option value="comfortable">Comfortable (4 tiles / row)</option>
                  <option value="expanded">Expanded (2 tiles / row - HD)</option>
                </select>
                <p className="text-[11px] text-slate-400">Number of simultaneous student video feeds</p>
              </div>

              {/* Feed Refresh Rate */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-semibold">Feed Telemetry Refresh</label>
                <select
                  value={localFaculty.liveFeedRefreshRateSec}
                  onChange={(e) =>
                    setLocalFaculty({ ...localFaculty, liveFeedRefreshRateSec: parseInt(e.target.value) || 5 })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer font-mono font-bold"
                >
                  <option value={3}>Fast (Every 3 seconds)</option>
                  <option value={5}>Standard (Every 5 seconds)</option>
                  <option value={10}>Relaxed (Every 10 seconds)</option>
                </select>
                <p className="text-[11px] text-slate-400">Polling rate for real-time keystrokes and webcam status</p>
              </div>

              {/* Suspicion Threshold */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-semibold">High Suspicion Alert Level</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={localFaculty.highRiskThresholdScore}
                    onChange={(e) =>
                      setLocalFaculty({
                        ...localFaculty,
                        highRiskThresholdScore: Math.max(5, parseInt(e.target.value) || 20),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-slate-400 text-xs font-semibold">points</span>
                </div>
                <p className="text-[11px] text-slate-400">Triggers prominent red pulse border on candidate tile</p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex justify-end p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={handleSaveFacultySettings}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Live Monitoring Settings</span>
            </button>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* 8. STUDENT TAB 1: CODE EDITOR & THEMES                                    */}
      {/* ========================================================================= */}
      {userRole === 'CANDIDATE' && activeTab === 'student_editor' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor Configuration */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Monaco Code Editor Configuration</h3>
                    <p className="text-xs text-slate-400">Personalize your live coding environment and typography</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                {/* Theme Selector */}
                <div>
                  <label className="block text-slate-200 font-semibold mb-1.5">Editor Visual Theme</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'vs-dark', name: 'VS Dark', desc: 'Standard Dark' },
                      { id: 'light', name: 'Light Mode', desc: 'High Luminance' },
                      { id: 'monokai', name: 'Monokai', desc: 'Warm Contrast' },
                      { id: 'dracula', name: 'Dracula', desc: 'Vibrant Purple' },
                    ].map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setLocalStudent({ ...localStudent, editorTheme: th.id as any })}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          localStudent.editorTheme === th.id
                            ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <span className="block text-xs text-white font-semibold">{th.name}</span>
                        <span className="text-[10px] text-slate-400">{th.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Font Size */}
                  <div>
                    <label className="block text-slate-200 font-semibold mb-1.5">Font Size</label>
                    <select
                      value={localStudent.fontSize}
                      onChange={(e) =>
                        setLocalStudent({ ...localStudent, fontSize: parseInt(e.target.value) || 14 })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono font-bold cursor-pointer"
                    >
                      <option value={12}>12px (Compact)</option>
                      <option value={14}>14px (Standard)</option>
                      <option value={16}>16px (Comfortable)</option>
                      <option value={18}>18px (Large)</option>
                      <option value={20}>20px (Extra Large)</option>
                    </select>
                  </div>

                  {/* Tab Size */}
                  <div>
                    <label className="block text-slate-200 font-semibold mb-1.5">Tab Indentation</label>
                    <select
                      value={localStudent.tabSize}
                      onChange={(e) =>
                        setLocalStudent({ ...localStudent, tabSize: parseInt(e.target.value) || 4 })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono font-bold cursor-pointer"
                    >
                      <option value={2}>2 Spaces (JS / React)</option>
                      <option value={4}>4 Spaces (Python / Java / C++)</option>
                    </select>
                  </div>
                </div>

                {/* Keybindings */}
                <div>
                  <label className="block text-slate-200 font-semibold mb-1.5">Keybinding Mode</label>
                  <select
                    value={localStudent.keybindings}
                    onChange={(e: any) => setLocalStudent({ ...localStudent, keybindings: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="standard">Standard VS Code Keybindings</option>
                    <option value="vim">Vim Emulation Mode</option>
                    <option value="emacs">Emacs Mode</option>
                  </select>
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                    <span className="font-semibold text-white">Enable IntelliSense Autocomplete</span>
                    <input
                      type="checkbox"
                      checked={localStudent.enableAutocomplete}
                      onChange={(e) =>
                        setLocalStudent({ ...localStudent, enableAutocomplete: e.target.checked })
                      }
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                    <span className="font-semibold text-white">Show Line Numbers in Gutter</span>
                    <input
                      type="checkbox"
                      checked={localStudent.showLineNumbers}
                      onChange={(e) =>
                        setLocalStudent({ ...localStudent, showLineNumbers: e.target.checked })
                      }
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                    <span className="font-semibold text-white">Wrap Long Lines (Soft Word Wrap)</span>
                    <input
                      type="checkbox"
                      checked={localStudent.wordWrap}
                      onChange={(e) => setLocalStudent({ ...localStudent, wordWrap: e.target.checked })}
                      className="rounded text-indigo-600 w-4 h-4 cursor-pointer accent-indigo-600"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Interactive Live Editor Preview */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold text-white">Live Editor Appearance Preview</h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Font: {localStudent.fontSize}px | Theme: {localStudent.editorTheme}
                  </span>
                </div>

                <div
                  className={`rounded-xl border p-4 font-mono transition shadow-inner ${
                    localStudent.editorTheme === 'light'
                      ? 'bg-slate-100 border-slate-300 text-slate-900'
                      : localStudent.editorTheme === 'monokai'
                      ? 'bg-[#272822] border-[#3e3d32] text-[#f8f8f2]'
                      : localStudent.editorTheme === 'dracula'
                      ? 'bg-[#282a36] border-[#44475a] text-[#f8f8f2]'
                      : 'bg-[#1e1e1e] border-slate-800 text-slate-200'
                  }`}
                  style={{ fontSize: `${localStudent.fontSize}px`, minHeight: '260px' }}
                >
                  <div className="opacity-50 text-[11px] mb-2 pb-1 border-b border-current/20">
                    // Solution.py (Live Preview)
                  </div>
                  <p>
                    <span className="text-purple-400 font-bold">def</span>{' '}
                    <span className="text-blue-400 font-bold">two_sum</span>(nums: list[int], target: int) -&gt; list[int]:
                  </p>
                  <p className="pl-4 text-slate-400">// Store seen indices</p>
                  <p className="pl-4">
                    lookup = {'{}'}
                  </p>
                  <p className="pl-4">
                    <span className="text-purple-400 font-bold">for</span> i, n in enumerate(nums):
                  </p>
                  <p className="pl-8">
                    diff = target - n
                  </p>
                  <p className="pl-8">
                    <span className="text-purple-400 font-bold">if</span> diff in lookup:
                  </p>
                  <p className="pl-12">
                    <span className="text-purple-400 font-bold">return</span> [lookup[diff], i]
                  </p>
                  <p className="pl-8">
                    lookup[n] = i
                  </p>
                  <p className="pl-4">
                    <span className="text-purple-400 font-bold">return</span> []
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-4">
                These code editor styling preferences will be loaded automatically during all timed assessments.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => handleResetToDefaults('student')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleSaveStudentSettings}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Editor Settings</span>
            </button>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* 10. PROFILE & PASSWORD SECURITY (SHARED FOR ALL ROLES)                     */}
      {/* ========================================================================= */}
      {activeTab === 'profile_security' && (
        <div className="space-y-6">
          {/* Avatar Picture Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Profile Photo & Identity</h3>
                  <p className="text-xs text-slate-400">
                    Upload an avatar image, choose a curated preset, or paste a direct image URL
                  </p>
                </div>
              </div>
            </div>

            {avatarSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{avatarSuccessMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Preview Avatar */}
              <div className="relative group shrink-0">
                <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-indigo-500/40 bg-slate-950 shadow-lg flex items-center justify-center">
                  {selectedAvatar ? (
                    <img
                      src={selectedAvatar}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon className="w-10 h-10 text-slate-600" />
                  )}
                </div>
              </div>

              {/* Upload & Preset Options */}
              <div className="flex-1 space-y-4 w-full">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="file"
                    ref={avatarFileInputRef}
                    accept="image/*"
                    onChange={handleAvatarFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <Upload className="w-4 h-4 text-indigo-400" />
                    <span>Choose Image File...</span>
                  </button>

                  <input
                    type="url"
                    placeholder="Or paste direct image URL (https://...)"
                    value={selectedAvatar}
                    onChange={(e) => setSelectedAvatar(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Preset Avatars */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    Or select from preset avatars:
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {PRESET_AVATARS.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedAvatar(url)}
                        className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition cursor-pointer ${
                          selectedAvatar === url
                            ? 'border-indigo-500 scale-110 shadow-md shadow-indigo-500/20'
                            : 'border-slate-800 hover:border-slate-600 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Preset ${idx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAvatar}
                    disabled={isSavingAvatar}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingAvatar ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save Profile Photo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Password Change Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Change Password</h3>
                  <p className="text-xs text-slate-400">
                    Update your account login password for Firebase Authentication & Firestore
                  </p>
                </div>
              </div>
              {currentUser && (
                <div className="text-right hidden sm:block">
                  <span className="text-xs font-bold text-slate-200 block">{currentUser.name}</span>
                  <span className="text-[11px] text-slate-400 font-mono block">{currentUser.email}</span>
                </div>
              )}
            </div>

            {passSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            {passError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      placeholder="At least 6 characters"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New Password</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-indigo-400" />
                  Secured with Firebase Auth & Firestore password encryption
                </p>
                <button
                  type="submit"
                  disabled={isUpdatingPass}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20 cursor-pointer flex items-center gap-2"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{isUpdatingPass ? 'Updating Password...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
