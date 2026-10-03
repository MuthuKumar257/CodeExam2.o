import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Send,
  Copy,
  RefreshCw,
  GraduationCap,
  Users,
  Clock,
  Calendar,
  Key,
  Unlock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRightLeft,
  Check,
  Search,
  BookOpen,
  Info,
  ShieldCheck,
  FileCheck2,
  Sliders,
  FileText,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Eye,
  AlertTriangle,
  Monitor,
  Lock,
  ExternalLink,
  Edit3,
  Trash2,
  Settings2,
} from 'lucide-react';
import { Assessment, Classroom, User, AssessmentStatus, SecuritySettings, Question } from '../../types';

interface ReassignAssessmentModalProps {
  assessment: Assessment | null;
  classes: Classroom[];
  users: User[];
  isOpen: boolean;
  onClose: () => void;
  onReassign: (updatedAsm: Assessment, isNewCopy?: boolean) => Promise<void> | void;
  onOpenFullEditor?: (asm: Assessment) => void;
  questionBank?: Question[];
}

export const ReassignAssessmentModal: React.FC<ReassignAssessmentModalProps> = ({
  assessment,
  classes = [],
  users = [],
  isOpen,
  onClose,
  onReassign,
  onOpenFullEditor,
}) => {
  // Candidate users
  const candidateUsers = useMemo(() => users.filter((u) => u.role === 'CANDIDATE'), [users]);

  // Active sub-tab in edit modal: 'general' | 'schedule' | 'security' | 'questions'
  const [activeTab, setActiveTab] = useState<'general' | 'schedule' | 'security' | 'questions'>('general');

  // Mode: 'UPDATE_EXISTING' (NO duplicate created) vs 'CLONE_NEW' (Creates duplicate copy)
  const [reassignMode, setReassignMode] = useState<'UPDATE_EXISTING' | 'CLONE_NEW'>('UPDATE_EXISTING');

  // Editable Assessment Data Fields
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [targetClassId, setTargetClassId] = useState<string>('UNIVERSAL');
  const [status, setStatus] = useState<AssessmentStatus>('ACTIVE');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [allowRetake, setAllowRetake] = useState<boolean>(assessment?.allowRetake ?? false);
  const [passingScore, setPassingScore] = useState<number>(60);
  const [randomizeQuestions, setRandomizeQuestions] = useState<boolean>(true);
  const [questionsPerCandidate, setQuestionsPerCandidate] = useState<number>(assessment?.questionsPerCandidate ?? (assessment?.questions?.length || 2));
  const [isEqualMarks, setIsEqualMarks] = useState<boolean>(true);
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(20);
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(true);
  const [passcode, setPasscode] = useState<string>('');
  const [startOption, setStartOption] = useState<'IMMEDIATE' | 'CUSTOM' | 'KEEP'>('IMMEDIATE');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [showStudentList, setShowStudentList] = useState<boolean>(false);
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);

  // Full Security Settings State
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    enableCamera: true,
    enableMicrophone: true,
    requireFullscreen: true,
    detectTabSwitch: true,
    detectWindowBlur: true,
    detectCopy: true,
    detectPaste: true,
    detectCut: true,
    detectRightClick: true,
    detectDevTools: true,
    detectMultipleFaces: true,
    detectNoFace: true,
    detectCameraDisabled: true,
    detectMicrophoneDisabled: true,
    detectCameraObstruction: true,
    detectVideoFreeze: true,
    liveFacultyMonitoring: true,
    showCameraPreviewToStudent: true,
    recordProctoringVideo: true,
    recordScreenRecording: true,
    recordScreenshots: true,
    maxWarnings: 5,
    autoSubmitOnWarningThreshold: true,
    fullscreenTimeoutSec: 30,
    detectMultipleFacesAsWarning: true,
    allowPause: true,
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generate random 6-character alphanumeric passcode
  const generateNewPasscode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPasscode(code);
  };

  // Find current and target class objects
  const currentClassObj = useMemo(() => {
    if (!assessment?.classId || assessment.classId === 'UNIVERSAL') return null;
    return classes.find((c) => c.id === assessment.classId) || null;
  }, [assessment?.classId, classes]);

  const targetClassObj = useMemo(() => {
    if (targetClassId === 'UNIVERSAL') return null;
    return classes.find((c) => c.id === targetClassId) || null;
  }, [targetClassId, classes]);

  // Determine eligible candidates for the selected target class
  const eligibleCandidates = useMemo(() => {
    if (targetClassId === 'UNIVERSAL') {
      return candidateUsers;
    }
    const cls = classes.find((c) => c.id === targetClassId);
    if (!cls) return candidateUsers;

    return candidateUsers.filter((u) => {
      const inClsStudentIds = cls.studentIds && cls.studentIds.includes(u.id);
      const inUserClassIds = u.classIds && u.classIds.includes(targetClassId);
      return inClsStudentIds || inUserClassIds;
    });
  }, [targetClassId, classes, candidateUsers]);

  // Handle Security Toggle with Master Camera & Mic Cascading Logic
  const handleToggleSecurity = (key: keyof SecuritySettings) => {
    setSecuritySettings((prev) => {
      const nextValue = !prev[key];
      const updated = { ...prev, [key]: nextValue };

      // Master Camera Toggle: cascade to disable/enable vision dependent sub-rules
      if (key === 'enableCamera') {
        if (!nextValue) {
          updated.detectCameraDisabled = false;
          updated.detectNoFace = false;
          updated.detectMultipleFaces = false;
          updated.detectCameraObstruction = false;
          updated.detectVideoFreeze = false;
          updated.liveFacultyMonitoring = false;
          updated.showCameraPreviewToStudent = false;
          updated.recordProctoringVideo = false;
        } else {
          updated.detectCameraDisabled = true;
          updated.detectNoFace = true;
          updated.detectMultipleFaces = true;
          updated.detectCameraObstruction = true;
          updated.detectVideoFreeze = true;
          updated.liveFacultyMonitoring = true;
          updated.showCameraPreviewToStudent = true;
          updated.recordProctoringVideo = true;
        }
      }

      // Master Microphone Toggle: cascade to disable/enable audio sub-rules
      if (key === 'enableMicrophone') {
        if (!nextValue) {
          updated.detectMicrophoneDisabled = false;
        } else {
          updated.detectMicrophoneDisabled = true;
        }
      }

      return updated;
    });
  };

  // Reset and populate form whenever modal opens or assessment changes
  useEffect(() => {
    if (assessment) {
      const initialClassId = assessment.classId || 'UNIVERSAL';
      setTargetClassId(initialClassId);
      setTitle(assessment.title || '');
      setDescription(assessment.description || '');
      setInstructions(assessment.instructions || '');
      setDurationMinutes(assessment.durationMinutes || 60);
      setMaxAttempts(assessment.maxAttempts || 1);
      setAllowRetake(assessment.allowRetake ?? false);
      setPassingScore(assessment.passingScore ?? 60);
      setRandomizeQuestions(assessment.randomizeQuestions ?? true);
      setQuestionsPerCandidate(assessment.questionsPerCandidate ?? (assessment.questions?.length || 2));
      setIsEqualMarks(assessment.isEqualMarks ?? true);
      setMarksPerQuestion(assessment.marksPerQuestion ?? 20);
      setIsPasswordProtected(assessment.isPasswordProtected ?? (assessment.password ? true : false));
      setPasscode(assessment.password || '');
      setStatus(assessment.status || 'ACTIVE');
      setStartOption('IMMEDIATE');
      setReassignMode('UPDATE_EXISTING'); // Default to updating existing without duplicates
      setCurrentQuestions(assessment.questions ? [...assessment.questions] : []);
      setSuccessMessage(null);
      setIsSubmitting(false);

      // Default start/end window
      const now = new Date();
      setStartTime(now.toISOString().slice(0, 16));
      const end = new Date(now.getTime() + (assessment.durationMinutes || 60) * 60 * 1000 * 48);
      setEndTime(end.toISOString().slice(0, 16));

      // Inherit security settings
      if (assessment.securitySettings) {
        setSecuritySettings({
          ...securitySettings,
          ...assessment.securitySettings,
          enableCamera: assessment.securitySettings.enableCamera ?? true,
          enableMicrophone: assessment.securitySettings.enableMicrophone ?? true,
        });
      }
    }
  }, [assessment, isOpen]);

  // Update candidate selection when target class changes
  useEffect(() => {
    if (assessment) {
      setSelectedStudentIds(eligibleCandidates.map((c) => c.id));
    }
  }, [targetClassId, eligibleCandidates]);

  // Filter candidates in roster checklist
  const filteredCandidates = useMemo(() => {
    if (!studentSearch.trim()) return eligibleCandidates;
    const q = studentSearch.toLowerCase();
    return eligibleCandidates.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q)
    );
  }, [eligibleCandidates, studentSearch]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === eligibleCandidates.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(eligibleCandidates.map((c) => c.id));
    }
  };

  const handleRemoveQuestion = (qId: string) => {
    setCurrentQuestions((prev) => prev.filter((q) => q.id !== qId));
  };

  const handleConfirmPublish = async () => {
    if (!assessment) return;

    setIsSubmitting(true);
    try {
      let resolvedStartTime = assessment.startTime;
      let resolvedEndTime = assessment.endTime;

      if (startOption === 'IMMEDIATE') {
        const now = new Date();
        resolvedStartTime = now.toISOString();
        const durationMs = (durationMinutes || 60) * 60 * 1000;
        resolvedEndTime = new Date(now.getTime() + durationMs * 48).toISOString();
      } else if (startOption === 'CUSTOM') {
        if (startTime) resolvedStartTime = new Date(startTime).toISOString();
        if (endTime) resolvedEndTime = new Date(endTime).toISOString();
      }

      const finalQuestions = isEqualMarks
        ? currentQuestions.map((q) => ({ ...q, points: marksPerQuestion }))
        : currentQuestions;

      const isNewCopy = reassignMode === 'CLONE_NEW';
      const targetId = isNewCopy
        ? `asm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
        : assessment.id;

      const updatedAssessmentData: Assessment = {
        ...assessment,
        id: targetId,
        title: title.trim() || assessment.title,
        description: description.trim(),
        instructions: instructions.trim(),
        classId: targetClassId === 'UNIVERSAL' ? undefined : targetClassId,
        candidateIds: selectedStudentIds.length > 0 ? selectedStudentIds : eligibleCandidates.map((c) => c.id),
        status: status,
        durationMinutes: Number(durationMinutes) || 60,
        maxAttempts: allowRetake ? 2 : 1,
        allowRetake,
        passingScore: Number(passingScore) || 60,
        randomizeQuestions,
        questionsPerCandidate: Math.min(questionsPerCandidate || finalQuestions.length, finalQuestions.length),
        isEqualMarks,
        marksPerQuestion,
        startTime: resolvedStartTime,
        endTime: resolvedEndTime,
        isPasswordProtected: isPasswordProtected,
        password: isPasswordProtected ? (passcode || 'EXAM100') : undefined,
        questions: finalQuestions,
        securitySettings: {
          ...securitySettings,
        },
        updatedAt: new Date().toISOString(),
        createdAt: isNewCopy ? new Date().toISOString() : assessment.createdAt,
      };

      await onReassign(updatedAssessmentData, isNewCopy);

      setSuccessMessage(
        isNewCopy
          ? 'New cloned assessment published successfully!'
          : 'Assessment details updated & published without duplicate copies!'
      );

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to publish reassigned assessment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !assessment) return null;

  const isSameClass = (assessment.classId || 'UNIVERSAL') === targetClassId;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Reassign & Edit Assessment Before Publish
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {reassignMode === 'UPDATE_EXISTING' ? 'No Duplicate (In-Place Update)' : 'Clone Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Modify title, cohort assignment, timings, proctoring security rules, or scoring before deploying.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenFullEditor && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullEditor(assessment);
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                title="Open in full multi-step creator wizard"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Full Wizard</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Selector Banner (Prevents Unwanted Duplications) */}
        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <span className="text-slate-400">Publish Action:</span>
            <div className="inline-flex bg-slate-900 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setReassignMode('UPDATE_EXISTING')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  reassignMode === 'UPDATE_EXISTING'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Update Original (No Duplicate)</span>
              </button>
              <button
                type="button"
                onClick={() => setReassignMode('CLONE_NEW')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  reassignMode === 'CLONE_NEW'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone as New Copy</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400">
            {reassignMode === 'UPDATE_EXISTING' ? (
              <span className="text-emerald-300 font-medium">
                ✓ Overwrites and publishes changes to current test without creating extra duplicate records.
              </span>
            ) : (
              <span className="text-indigo-300 font-medium">
                ✓ Creates a brand-new independent test copy with a unique ID while preserving original history.
              </span>
            )}
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-6 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'general'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>1. General & Cohort</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>2. Schedule & Scoring</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'security'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>3. Security & Proctoring</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'questions'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>4. Questions ({currentQuestions.length})</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs text-slate-300">
          {/* TAB 1: GENERAL & COHORT */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              {/* Assessment Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  <span>Assessment Title</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Data Structures Midterm Examination"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {/* Description & Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white">Description</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description or syllabus coverage..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white">Instructions to Candidates</label>
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Rules, disallowed aids, environment requirements..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Target Classroom Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-indigo-400" />
                  <span>Select Target Cohort / Classroom</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    onClick={() => setTargetClassId('UNIVERSAL')}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      targetClassId === 'UNIVERSAL'
                        ? 'bg-indigo-600/15 border-indigo-500 text-white font-semibold shadow-sm'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold">Universal (All Candidates)</div>
                      <div className="text-[10px] text-slate-400">{candidateUsers.length} total registered candidates</div>
                    </div>
                    {targetClassId === 'UNIVERSAL' && <Check className="w-4 h-4 text-indigo-400" />}
                  </div>

                  {classes.map((cls) => {
                    const studentCount =
                      cls.studentIds?.length ||
                      candidateUsers.filter((u) => u.classIds?.includes(cls.id)).length ||
                      0;
                    const isCurrent = cls.id === assessment.classId;

                    return (
                      <div
                        key={cls.id}
                        onClick={() => setTargetClassId(cls.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                          targetClassId === cls.id
                            ? 'bg-indigo-600/15 border-indigo-500 text-white font-semibold shadow-sm'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            <span>{cls.name}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {cls.department ? `${cls.department} • ` : ''}
                            {studentCount} enrolled candidates
                          </div>
                        </div>
                        {targetClassId === cls.id && <Check className="w-4 h-4 text-indigo-400" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Roster Enrollment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Enrolled Candidates ({selectedStudentIds.length}/{eligibleCandidates.length} Selected)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowStudentList(!showStudentList)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    {showStudentList ? 'Hide Candidate Checklist' : 'Customize Candidate Checklist'}
                  </button>
                </div>

                {showStudentList && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search candidate name or email..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition cursor-pointer"
                      >
                        {selectedStudentIds.length === eligibleCandidates.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-900">
                      {filteredCandidates.map((c) => {
                        const isSelected = selectedStudentIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleStudent(c.id)}
                            className={`p-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                              isSelected ? 'bg-indigo-950/40 text-white' : 'text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                              />
                              <span className="font-medium text-xs text-slate-200">{c.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">({c.email})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULE & SCORING */}
          {activeTab === 'schedule' && (
            <div className="space-y-5">
              {/* Timing & Status Grid */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Timing, Attempts & Status</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AssessmentStatus)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                    >
                      <option value="ACTIVE">ACTIVE (Live Now)</option>
                      <option value="PAUSED">PAUSED (Suspended)</option>
                      <option value="UPCOMING">UPCOMING (Scheduled)</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="COMPLETED">COMPLETED</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Duration (Mins)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="360"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Max Attempts
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="2"
                      value={allowRetake ? 2 : 1}
                      readOnly
                      disabled
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 cursor-not-allowed font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Passing Score (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={passingScore}
                      onChange={(e) => setPassingScore(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/60">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Allow Retake Test (Single Retake Allowed)</p>
                    <p className="text-[10px] text-slate-400">
                      Permit candidates to retake this test once (strictly limited to 1 retake, 2 attempts maximum).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowRetake}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAllowRetake(checked);
                      setMaxAttempts(checked ? 2 : 1);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700 cursor-pointer"
                  />
                </div>

                {/* Schedule Mode */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-400 block">
                    Schedule Window
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setStartOption('IMMEDIATE')}
                      className={`px-3 py-1.5 rounded-lg font-medium text-xs transition cursor-pointer ${
                        startOption === 'IMMEDIATE'
                          ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Start Immediately (Live Now)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartOption('CUSTOM')}
                      className={`px-3 py-1.5 rounded-lg font-medium text-xs transition cursor-pointer ${
                        startOption === 'CUSTOM'
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Custom Start & End Time
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartOption('KEEP')}
                      className={`px-3 py-1.5 rounded-lg font-medium text-xs transition cursor-pointer ${
                        startOption === 'KEEP'
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-bold'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Keep Source Schedule
                    </button>
                  </div>

                  {startOption === 'CUSTOM' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Start Time</label>
                        <input
                          type="datetime-local"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">End Time</label>
                        <input
                          type="datetime-local"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Passcode Protection */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Key className="w-4 h-4 text-indigo-400" />
                    <div>
                      <span className="font-bold text-white text-xs block">Passcode Protection</span>
                      <span className="text-[10px] text-slate-400">Candidates must supply this code to launch the test</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPasswordProtected}
                      onChange={(e) => setIsPasswordProtected(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {isPasswordProtected && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                        placeholder="Enter examination passcode..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold tracking-wider uppercase focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={generateNewPasscode}
                      className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Generate</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & PROCTORING */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Master Sensors Section */}
              <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Master Proctoring Sensor Toggles
                  </h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Switching off a sensor automatically disables and locks all dependent AI vision/audio sub-rules.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Master Camera Toggle */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    securitySettings.enableCamera
                      ? 'bg-indigo-600/10 border-indigo-500/50'
                      : 'bg-slate-900 border-slate-800 opacity-80'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${securitySettings.enableCamera ? 'bg-indigo-600/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                        {securitySettings.enableCamera ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Master Camera Feed</div>
                        <div className="text-[10px] text-slate-400">
                          {securitySettings.enableCamera ? 'Active (All Vision Rules Enabled)' : 'Disabled (All Vision Rules Locked Off)'}
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securitySettings.enableCamera}
                        onChange={() => handleToggleSecurity('enableCamera')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Master Microphone Toggle */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    securitySettings.enableMicrophone
                      ? 'bg-indigo-600/10 border-indigo-500/50'
                      : 'bg-slate-900 border-slate-800 opacity-80'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${securitySettings.enableMicrophone ? 'bg-indigo-600/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                        {securitySettings.enableMicrophone ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Master Microphone Feed</div>
                        <div className="text-[10px] text-slate-400">
                          {securitySettings.enableMicrophone ? 'Active (Audio Rules Enabled)' : 'Disabled (Audio Rules Locked Off)'}
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={securitySettings.enableMicrophone}
                        onChange={() => handleToggleSecurity('enableMicrophone')}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Dependent AI Vision Rules */}
              <div className={`p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 transition ${
                !securitySettings.enableCamera ? 'opacity-50 pointer-events-none' : ''
              }`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <span>AI Vision & Video Verification Rules</span>
                  </h4>
                  {!securitySettings.enableCamera && (
                    <span className="text-[10px] text-amber-400 font-semibold">(Disabled — Camera is Off)</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Detect Face Departure (No Person)</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.detectNoFace && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('detectNoFace')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Detect Multiple Persons</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.detectMultipleFaces && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('detectMultipleFaces')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Detect Camera Obstruction & Dark Lens</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.detectCameraObstruction && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('detectCameraObstruction')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Detect Video Freeze / Loop</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.detectVideoFreeze && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('detectVideoFreeze')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Live Faculty Streaming Preview</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.liveFacultyMonitoring && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('liveFacultyMonitoring')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Show PIP Preview to Student</span>
                    <input
                      type="checkbox"
                      disabled={!securitySettings.enableCamera}
                      checked={securitySettings.showCameraPreviewToStudent && securitySettings.enableCamera}
                      onChange={() => handleToggleSecurity('showCameraPreviewToStudent')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                </div>
              </div>

              {/* Browser & Environment Lockdown */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-emerald-400" />
                  <span>Browser & Environment Lockdown</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Require Fullscreen Mode</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.requireFullscreen}
                      onChange={() => handleToggleSecurity('requireFullscreen')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Detect Tab Switching & Alt+Tab</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.detectTabSwitch}
                      onChange={() => handleToggleSecurity('detectTabSwitch')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Record Desktop Screen Stream</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.recordScreenRecording}
                      onChange={() => handleToggleSecurity('recordScreenRecording')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Prevent Copy, Paste & Cut</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.detectPaste}
                      onChange={() => handleToggleSecurity('detectPaste')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Auto-Submit on Warning Threshold</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.autoSubmitOnWarningThreshold}
                      onChange={() => handleToggleSecurity('autoSubmitOnWarningThreshold')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">Allow Assessment Pause (Enables Pause/Resume)</span>
                    <input
                      type="checkbox"
                      checked={securitySettings.allowPause}
                      onChange={() => handleToggleSecurity('allowPause')}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </label>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-200">Max Warning Strikes</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={securitySettings.maxWarnings || 5}
                      onChange={(e) =>
                        setSecuritySettings((prev) => ({ ...prev, maxWarnings: Number(e.target.value) }))
                      }
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: QUESTIONS */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span>Attached Questions ({currentQuestions.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Review and customize questions assigned to this test cohort before publishing.
                  </p>
                </div>
                {onOpenFullEditor && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFullEditor(assessment);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs font-semibold hover:bg-indigo-600/30 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Manage in Full Editor</span>
                  </button>
                )}
              </div>

              {/* Questions List */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {currentQuestions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white line-clamp-1">{q.title}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span className="uppercase font-mono text-indigo-400">{q.type || 'CODING'}</span>
                          <span>•</span>
                          <span className="text-amber-400 font-mono">{q.points || marksPerQuestion || 20} pts</span>
                          {q.difficulty && (
                            <>
                              <span>•</span>
                              <span className="text-slate-500 capitalize">{q.difficulty}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(q.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Remove question from assessment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {currentQuestions.length === 0 && (
                  <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                    <div className="text-xs font-bold text-white">No Questions Attached</div>
                    <p className="text-[11px] text-slate-500">
                      Click 'Manage in Full Editor' to pick questions from the question bank.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 font-medium animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="font-bold text-slate-300">Target Cohort:</span>
            <span className="text-indigo-400 font-semibold">{targetClassObj?.name || 'Universal (All Students)'}</span>
            <span>•</span>
            <span>{selectedStudentIds.length} Candidates</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmPublish}
              disabled={isSubmitting || selectedStudentIds.length === 0}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing Changes...</span>
                </>
              ) : (
                <>
                  {reassignMode === 'UPDATE_EXISTING' ? (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Update & Publish Changes</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Publish as Cloned Copy</span>
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
