import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Unlock,
  Shield,
  HelpCircle,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  Calendar,
  Clock,
  Shuffle,
  Hash,
  Calculator,
  Award,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Assessment, Question, SecuritySettings, SystemSettings, FacultySettings, Classroom } from '../../types';

interface CreateAssessmentProps {
  questionBank: Question[];
  onCreateAssessment: (assessmentData: Partial<Assessment>) => void;
  onCancel: () => void;
  systemSettings?: SystemSettings;
  facultySettings?: FacultySettings;
  classes?: Classroom[];
  defaultClassId?: string;
  editingAssessment?: Assessment | null;
}

export const CreateAssessment: React.FC<CreateAssessmentProps> = ({
  questionBank,
  onCreateAssessment,
  onCancel,
  systemSettings,
  facultySettings,
  classes = [],
  defaultClassId = '',
  editingAssessment,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const defaultResultVisibility =
    editingAssessment?.showResultsToStudents ??
    facultySettings?.defaultShowResultsToStudents ??
    systemSettings?.showResultsToStudents ??
    true;

  // ASSESSMENT LIFECYCLE STATUS
  const [assessmentStatus, setAssessmentStatus] = useState<
    'ACTIVE' | 'CLOSED' | 'PAUSED' | 'UPCOMING' | 'COMPLETED' | 'DRAFT'
  >((editingAssessment?.status as any) || 'ACTIVE');

  // STEP 1 FIELDS
  const [selectedClassId, setSelectedClassId] = useState<string>(
    editingAssessment?.classId || defaultClassId || classes[0]?.id || ''
  );
  const [title, setTitle] = useState(editingAssessment?.title || '');
  const [description, setDescription] = useState(editingAssessment?.description || '');
  const [instructions, setInstructions] = useState(
    editingAssessment?.instructions || ''
  );
  const [durationMinutes, setDurationMinutes] = useState(
    editingAssessment?.durationMinutes ?? facultySettings?.defaultDurationMinutes ?? systemSettings?.assessmentDuration ?? 90
  );
  const [startTime, setStartTime] = useState(
    editingAssessment?.startTime
      ? new Date(editingAssessment.startTime).toISOString().slice(0, 16)
      : ''
  );
  const [endTime, setEndTime] = useState(
    editingAssessment?.endTime
      ? new Date(editingAssessment.endTime).toISOString().slice(0, 16)
      : ''
  );
  const [maxAttempts, setMaxAttempts] = useState(editingAssessment?.maxAttempts ?? 1);
  const [allowRetake, setAllowRetake] = useState<boolean>(editingAssessment?.allowRetake ?? false);
  const [passingScore, setPassingScore] = useState(
    editingAssessment?.passingScore ?? facultySettings?.defaultPassingScore ?? 60
  );

  // ASSESSMENT PASSWORD PROTECTION
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(
    editingAssessment ? !!editingAssessment.isPasswordProtected : false
  );
  const [password, setPassword] = useState<string>(editingAssessment?.password || '');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789#@!';
    let res = 'Test2026#';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(res);
  };

  // STEP 2 QUESTIONS & MARKS SETTINGS
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>(
    editingAssessment?.questions?.length
      ? editingAssessment.questions
      : []
  );
  const [questionsPerCandidate, setQuestionsPerCandidate] = useState<number>(
    editingAssessment?.questionsPerCandidate ?? 2
  );
  const [randomizeQuestions, setRandomizeQuestions] = useState<boolean>(
    editingAssessment?.randomizeQuestions ?? systemSettings?.randomizeQuestions ?? true
  );
  const [isEqualMarks, setIsEqualMarks] = useState<boolean>(
    editingAssessment?.isEqualMarks ?? true
  );
  const [marksPerQuestion, setMarksPerQuestion] = useState<number>(
    editingAssessment?.marksPerQuestion ?? 20
  );

  // Apply equal marks whenever marksPerQuestion or isEqualMarks is toggled
  const applyEqualMarksToQuestions = (pts: number, activeEqual: boolean = isEqualMarks) => {
    setMarksPerQuestion(pts);
    if (activeEqual) {
      setSelectedQuestions((prev) => prev.map((q) => ({ ...q, points: pts })));
    }
  };

  const handleToggleEqualMarks = () => {
    const nextVal = !isEqualMarks;
    setIsEqualMarks(nextVal);
    if (nextVal) {
      setSelectedQuestions((prev) => prev.map((q) => ({ ...q, points: marksPerQuestion })));
    }
  };

  // STEP 3 LANGUAGES
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(
    editingAssessment?.allowedLanguages?.length
      ? editingAssessment.allowedLanguages
      : systemSettings?.allowedLanguages?.length
      ? systemSettings.allowedLanguages
      : ['python', 'javascript', 'cpp', 'java']
  );

  // STEP 4 SECURITY SETTINGS
  const [showResultsToStudents, setShowResultsToStudents] = useState<boolean>(
    defaultResultVisibility
  );

  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    enableCamera: facultySettings?.defaultEnableCamera ?? systemSettings?.cameraRequired ?? true,
    enableMicrophone: facultySettings?.defaultEnableMicrophone ?? systemSettings?.microphoneRequired ?? true,
    requireFullscreen: systemSettings?.requireFullscreen ?? true,
    detectTabSwitch: systemSettings?.detectTabSwitch ?? true,
    detectWindowBlur: systemSettings?.detectWindowBlur ?? true,
    detectCopy: true,
    detectPaste: true,
    detectCut: true,
    detectRightClick: true,
    detectMultipleFaces: systemSettings?.detectMultiplePersons ?? true,
    detectNoFace: systemSettings?.detectNoPerson ?? true,
    detectCameraDisabled: systemSettings?.cameraRequired ?? true,
    detectMicrophoneDisabled: systemSettings?.microphoneRequired ?? true,
    detectCameraObstruction: systemSettings?.detectCameraObstruction ?? true,
    detectVideoFreeze: systemSettings?.detectVideoFreeze ?? true,
    liveFacultyMonitoring: systemSettings?.liveFacultyMonitoring ?? true,
    showCameraPreviewToStudent: systemSettings?.showCameraPreviewToStudent ?? true,
    showResultsToStudents: systemSettings?.showResultsToStudents ?? true,
    recordProctoringVideo: true,
    recordScreenshots: true,
    maxWarnings: systemSettings?.maxWarnings ?? 5,
    autoSubmitOnWarningThreshold: systemSettings?.autoSubmitOnWarningLimit ?? true,
    fullscreenTimeoutSec: 30,
    detectMultipleFacesAsWarning: true,
    allowPause: facultySettings?.defaultAllowPauseAssessment ?? systemSettings?.allowPauseAssessment ?? true,
    maxPauseDurationMinutes: facultySettings?.defaultMaxPauseDurationMinutes ?? systemSettings?.maxPauseDurationMinutes ?? 15,
    ...(editingAssessment?.securitySettings || {}),
  });

  // Track if user explicitly edited languages/security so async systemSettings sync won't clobber manual edits
  const [hasUserEditedLanguages, setHasUserEditedLanguages] = useState(false);
  const [hasUserEditedSecurity, setHasUserEditedSecurity] = useState(false);

  // Synchronize when editingAssessment changes
  useEffect(() => {
    if (editingAssessment) {
      setSelectedClassId(editingAssessment.classId || defaultClassId || classes[0]?.id || '');
      setTitle(editingAssessment.title || '');
      setDescription(editingAssessment.description || '');
      setInstructions(editingAssessment.instructions || '');
      setDurationMinutes(editingAssessment.durationMinutes ?? 90);
      setStartTime(
        editingAssessment.startTime
          ? new Date(editingAssessment.startTime).toISOString().slice(0, 16)
          : ''
      );
      setEndTime(
        editingAssessment.endTime
          ? new Date(editingAssessment.endTime).toISOString().slice(0, 16)
          : ''
      );
      setMaxAttempts(editingAssessment.maxAttempts ?? 1);
      setAllowRetake(editingAssessment.allowRetake ?? false);
      setPassingScore(editingAssessment.passingScore ?? 60);
      setIsPasswordProtected(!!editingAssessment.isPasswordProtected);
      setPassword(editingAssessment.password || '');
      setSelectedQuestions(editingAssessment.questions?.length ? editingAssessment.questions : []);
      setQuestionsPerCandidate(
        editingAssessment.questionsPerCandidate ?? (editingAssessment.questions?.length || 2)
      );
      setRandomizeQuestions(editingAssessment.randomizeQuestions ?? true);
      setIsEqualMarks(editingAssessment.isEqualMarks ?? true);
      setMarksPerQuestion(editingAssessment.marksPerQuestion ?? 20);
      setAllowedLanguages(
        editingAssessment.allowedLanguages?.length
          ? editingAssessment.allowedLanguages
          : ['python', 'javascript', 'cpp', 'java']
      );
      const resVis =
        editingAssessment.showResultsToStudents ??
        editingAssessment.securitySettings?.showResultsToStudents ??
        true;
      setShowResultsToStudents(resVis);
      setSecuritySettings((prev) => ({
        ...prev,
        ...(editingAssessment.securitySettings || {}),
        showResultsToStudents: resVis,
      }));
    }
  }, [editingAssessment, defaultClassId, classes]);

  React.useEffect(() => {
    if (systemSettings && !editingAssessment) {
      if (!hasUserEditedLanguages && systemSettings.allowedLanguages?.length) {
        setAllowedLanguages(systemSettings.allowedLanguages);
      }
      if (!hasUserEditedSecurity) {
        setSecuritySettings({
          enableCamera: facultySettings?.defaultEnableCamera ?? systemSettings.cameraRequired ?? true,
          enableMicrophone: facultySettings?.defaultEnableMicrophone ?? systemSettings.microphoneRequired ?? true,
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
          showResultsToStudents: systemSettings.showResultsToStudents ?? defaultResultVisibility,
          recordProctoringVideo: true,
          recordScreenshots: true,
          maxWarnings: systemSettings.maxWarnings ?? 5,
          autoSubmitOnWarningThreshold: systemSettings.autoSubmitOnWarningLimit ?? true,
          fullscreenTimeoutSec: 30,
          detectMultipleFacesAsWarning: true,
          allowPause: facultySettings?.defaultAllowPauseAssessment ?? systemSettings.allowPauseAssessment ?? true,
          maxPauseDurationMinutes: facultySettings?.defaultMaxPauseDurationMinutes ?? systemSettings.maxPauseDurationMinutes ?? 15,
        });
      }
      if (systemSettings.assessmentDuration) {
        setDurationMinutes(systemSettings.assessmentDuration);
      }
      if (!hasUserEditedSecurity) {
        setShowResultsToStudents(systemSettings.showResultsToStudents ?? defaultResultVisibility);
      }
      if (systemSettings.randomizeQuestions !== undefined) {
        setRandomizeQuestions(systemSettings.randomizeQuestions);
      }
    }
  }, [systemSettings, editingAssessment]);

  const availableLanguages = [
    { id: 'c', label: 'C Language' },
    { id: 'cpp', label: 'C++' },
    { id: 'java', label: 'Java' },
    { id: 'python', label: 'Python 3' },
    { id: 'javascript', label: 'JavaScript (Node.js)' },
    { id: 'go', label: 'Go (Golang)' },
    { id: 'rust', label: 'Rust' },
  ];

  const handleToggleLang = (langId: string) => {
    setHasUserEditedLanguages(true);
    if (allowedLanguages.includes(langId)) {
      setAllowedLanguages(allowedLanguages.filter((l) => l !== langId));
    } else {
      setAllowedLanguages([...allowedLanguages, langId]);
    }
  };

  const handleToggleSecurity = (key: keyof SecuritySettings) => {
    setHasUserEditedSecurity(true);
    setSecuritySettings((prev) => {
      const isCurrentlyEnabled = prev[key] !== false;
      const newVal = !isCurrentlyEnabled;

      const updated: SecuritySettings = {
        ...prev,
        [key]: typeof prev[key] === 'boolean' || prev[key] === undefined ? newVal : prev[key],
      };

      if (key === 'enableCamera') {
        if (!newVal) {
          // AUTOMATICALLY DISABLE ALL OPTIONS THAT NEED CAMERA ACCESS
          updated.detectCameraDisabled = false;
          updated.detectMultipleFaces = false;
          updated.detectMultipleFacesAsWarning = false;
          updated.detectNoFace = false;
          updated.detectCameraObstruction = false;
          updated.detectVideoFreeze = false;
          updated.recordProctoringVideo = false;
          updated.showCameraPreviewToStudent = false;
          updated.liveFacultyMonitoring = false;
        } else {
          // RESTORE CAMERA DEFAULTS
          updated.detectCameraDisabled = true;
          updated.detectMultipleFaces = true;
          updated.detectMultipleFacesAsWarning = true;
          updated.detectNoFace = true;
          updated.detectCameraObstruction = true;
          updated.detectVideoFreeze = true;
          updated.recordProctoringVideo = true;
          updated.showCameraPreviewToStudent = true;
          updated.liveFacultyMonitoring = true;
        }
      }

      if (key === 'enableMicrophone') {
        if (!newVal) {
          // AUTOMATICALLY DISABLE ALL OPTIONS THAT NEED MICROPHONE ACCESS
          updated.detectMicrophoneDisabled = false;
        } else {
          // RESTORE MICROPHONE DEFAULTS
          updated.detectMicrophoneDisabled = true;
        }
      }

      return updated;
    });
  };

  const handleAddQuestionToTest = (q: Question) => {
    if (!selectedQuestions.find((item) => item.id === q.id)) {
      const updatedQ = isEqualMarks ? { ...q, points: marksPerQuestion } : q;
      const nextList = [...selectedQuestions, updatedQ];
      setSelectedQuestions(nextList);
      if (questionsPerCandidate >= selectedQuestions.length) {
        setQuestionsPerCandidate(nextList.length);
      }
    }
  };

  const handleRemoveQuestion = (qId: string) => {
    const nextList = selectedQuestions.filter((q) => q.id !== qId);
    setSelectedQuestions(nextList);
    if (questionsPerCandidate > nextList.length) {
      setQuestionsPerCandidate(Math.max(1, nextList.length));
    }
  };

  const handleSubmitFinal = () => {
    const finalQuestions = isEqualMarks
      ? selectedQuestions.map((q) => ({ ...q, points: marksPerQuestion }))
      : selectedQuestions;

    onCreateAssessment({
      ...(editingAssessment || {}),
      ...(editingAssessment ? { id: editingAssessment.id } : {}),
      title: title.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      classId: selectedClassId,
      status: assessmentStatus,
      durationMinutes,
      startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
      endTime: endTime ? new Date(endTime).toISOString() : new Date(Date.now() + 86400000).toISOString(),
      maxAttempts: allowRetake ? 2 : 1,
      allowRetake,
      passingScore,
      isPasswordProtected,
      password: isPasswordProtected ? password : '',
      questions: finalQuestions,
      questionsPerCandidate: Math.min(questionsPerCandidate || finalQuestions.length, finalQuestions.length),
      randomizeQuestions,
      isEqualMarks,
      marksPerQuestion,
      allowedLanguages,
      showResultsToStudents,
      securitySettings: {
        ...securitySettings,
        showResultsToStudents,
      },
      riskWeights: editingAssessment?.riskWeights || {
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
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title Header matching Assessment Analytics */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Assessment Authoring & Security Policies</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            {editingAssessment ? 'Edit Assessment' : 'Create Assessment'}
          </h1>
          <p className="text-zinc-400 text-sm">
            {editingAssessment
              ? `Directly modify and update existing assessment (${editingAssessment.title}) in-place without creating duplicates.`
              : 'Configure test details, question sets, candidate limits, and proctoring policy parameters.'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded text-xs font-semibold bg-[#141417] text-zinc-300 hover:text-white border border-white/10 hover:bg-white/5 transition cursor-pointer self-start md:self-auto"
        >
          Cancel & Return
        </button>
      </div>

      {/* Wizard Steps Navigation */}
      <div className="grid grid-cols-4 gap-2 bg-slate-900 p-2 rounded-2xl border border-slate-800">
        {[
          { num: 1, title: '1. Basic Info' },
          { num: 2, title: '2. Questions' },
          { num: 3, title: '3. Languages' },
          { num: 4, title: '4. Security Settings' },
        ].map((s) => (
          <div
            key={s.num}
            onClick={() => setStep(s.num as any)}
            className={`p-3 rounded-xl text-xs font-semibold cursor-pointer transition flex items-center space-x-2 ${
              step === s.num
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : step > s.num
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {step > s.num ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">
                {s.num}
              </span>
            )}
            <span className="truncate">{s.title}</span>
          </div>
        ))}
      </div>

      {/* STEP 1: BASIC INFORMATION */}
      {step === 1 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span>Step 1: Basic Information & Schedule</span>
            <span className="text-xs font-normal text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
              Class-Specific Assessment
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 md:col-span-2 bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-xl">
              <label className="text-indigo-300 font-bold block mb-1">Target Classroom *</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
              >
                {classes.length > 0 ? (
                  classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.studentIds.length} enrolled candidates)
                    </option>
                  ))
                ) : (
                  <option value="">No Classrooms Assigned</option>
                )}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                ℹ️ Assessments are bound strictly to the selected classroom. Questions are pulled from the common Question Bank.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Assessment Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. End Semester Algorithms & Data Structures Assessment"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Duration (Minutes) *</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-slate-400 font-medium">Description</label>
              <input
                type="text"
                placeholder="Short description of test goals"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-slate-400 font-medium">Candidate Instructions</label>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Start Date / Time with Interactive Calendar & Clock */}
            <div className="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span>Start Date & Time</span>
                </label>
                <div className="flex items-center gap-1 text-[10px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>
                    {startTime ? new Date(startTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Select Date'}
                  </span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Quick Calendar & Clock Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-medium">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setStartTime(iso);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700 transition cursor-pointer"
                >
                  ⚡ Start Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setHours(9, 0, 0, 0);
                    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setStartTime(iso);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700 transition cursor-pointer"
                >
                  📅 Today 9:00 AM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(9, 0, 0, 0);
                    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setStartTime(iso);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700 transition cursor-pointer"
                >
                  📅 Tomorrow 9:00 AM
                </button>
              </div>
            </div>

            {/* End Date / Time with Interactive Calendar & Clock */}
            <div className="space-y-2 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>End Date & Time</span>
                </label>
                <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>
                    {endTime ? new Date(endTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Select Date'}
                  </span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Quick Duration Offset Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-medium">Quick Duration:</span>
                {[
                  { label: '+1 Hr', hrs: 1 },
                  { label: '+2 Hrs', hrs: 2 },
                  { label: '+24 Hrs', hrs: 24 },
                  { label: '+7 Days', hrs: 168 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      const base = startTime ? new Date(startTime) : new Date();
                      const end = new Date(base.getTime() + item.hrs * 3600 * 1000);
                      const iso = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setEndTime(iso);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-emerald-600/30 text-slate-300 hover:text-emerald-300 border border-slate-700 transition cursor-pointer"
                  >
                    ⏰ {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Passing Score (%)</label>
              <input
                type="number"
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-medium">Number of Attempts Allowed</label>
              <input
                type="number"
                min="1"
                max="2"
                value={allowRetake ? 2 : 1}
                readOnly
                disabled
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-500">
                {allowRetake
                  ? '2 attempts total (1 initial test + exactly 1 retake allowed).'
                  : '1 attempt total (Retake test disabled).'}
              </p>
            </div>

            <div className="md:col-span-2 flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
              <div>
                <p className="text-xs font-semibold text-slate-200">Allow Retake Test (Single Retake Allowed)</p>
                <p className="text-[11px] text-slate-400">
                  Allow candidates to retake this test once if needed (strictly limited to 1 retake, 2 attempts maximum).
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
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(2)}
              disabled={!title}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer"
            >
              <span>Continue to Questions</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: QUESTIONS */}
      {step === 2 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Step 2: Questions Count, Randomization & Equal Marks</h3>
            <span className="text-xs text-slate-400 font-mono">{selectedQuestions.length} Selected in Pool</span>
          </div>

          {/* QUESTIONS COUNT & CANDIDATE RANDOMIZATION SETTINGS CARD */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
                  <Hash className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Questions Count & Candidate Randomization</h4>
                  <p className="text-[11px] text-slate-400">Specify number of questions and randomize questions per candidate</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Number of Questions Field */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold flex items-center justify-between">
                  <span>Number of Questions Served *</span>
                  <span className="text-[10px] text-indigo-400 font-mono font-bold">Pool size: {selectedQuestions.length} Qs</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={selectedQuestions.length || 1}
                    value={questionsPerCandidate}
                    onChange={(e) => setQuestionsPerCandidate(Math.max(1, Math.min(selectedQuestions.length, Number(e.target.value))))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuestionsPerCandidate((prev) => Math.min(selectedQuestions.length, prev + 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuestionsPerCandidate((prev) => Math.max(1, prev - 1))}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 cursor-pointer"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>

              {/* Randomize Questions Toggle */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                    <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Randomize Questions Option</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Gives different randomized questions to different candidates</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRandomizeQuestions(!randomizeQuestions)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    randomizeQuestions ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      randomizeQuestions ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* EQUAL MARKS SETTINGS CARD */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">Equal Marks per Question</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      isEqualMarks ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isEqualMarks ? 'EQUAL MARKS ENABLED' : 'CUSTOM MARKS'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ensure all questions carry equal marks weightage</p>
                </div>
              </div>

              {/* Toggle button */}
              <button
                type="button"
                onClick={handleToggleEqualMarks}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isEqualMarks ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isEqualMarks ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isEqualMarks && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold text-xs">Equal Marks per Question *</label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    Total Test Weight: {questionsPerCandidate * marksPerQuestion} Marks ({questionsPerCandidate} Qs × {marksPerQuestion} pts each)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={marksPerQuestion}
                    onChange={(e) => applyEqualMarksToQuestions(Math.max(1, Number(e.target.value)), true)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[10, 20, 25, 50].map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => applyEqualMarksToQuestions(pts, true)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          marksPerQuestion === pts
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {pts} pts
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isEqualMarks && (
              <div className="pt-2 border-t border-slate-800/80 p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-300 text-xs flex items-center space-x-2">
                <Info className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  <strong>Hidden Test Case Scoring Mode:</strong> Marks are calculated dynamically based on the number of hidden test cases passed (e.g. Points = Passed Hidden Test Cases × Points per Hidden Case).
                </span>
              </div>
            )}
          </div>

          {/* Selected questions list */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Selected Question Pool ({selectedQuestions.length})</span>
              {isEqualMarks && (
                <span className="text-[10px] text-emerald-400 font-mono font-normal">
                  All questions set to equal {marksPerQuestion} marks
                </span>
              )}
            </h4>
            {selectedQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center font-mono">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-white">{q?.title || 'Untitled Question'}</div>
                    <div className="text-[11px] text-slate-400">
                      {q?.difficulty || 'EASY'} • <span className="font-bold text-emerald-400">{isEqualMarks ? marksPerQuestion : q?.points || 0} Marks</span> • {(q?.tags || []).join(', ')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveQuestion(q.id)}
                  className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Available Universal Question Bank picker */}
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300">Select from Universal Question Bank (All Classes):</h4>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">
                Universal Bank
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {questionBank.map((q) => {
                const isAdded = selectedQuestions.some((sq) => sq.id === q.id);
                return (
                  <div
                    key={q.id}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      isAdded
                        ? 'bg-slate-950 border-emerald-500/30 opacity-60'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{q?.title || 'Untitled Question'}</div>
                      <div className="text-[10px] text-slate-400">{q?.difficulty || 'EASY'} • {q?.points || 0} Points</div>
                    </div>
                    {!isAdded && (
                      <button
                        onClick={() => handleAddQuestionToTest(q)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setStep(1)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedQuestions.length === 0}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              <span>Continue to Languages</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: LANGUAGES */}
      {step === 3 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Step 3: Enable Allowed Programming Languages</h3>
              <p className="text-xs text-slate-400">Candidates can write and execute code in any enabled language below</p>
            </div>
            <div className="text-xs text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 self-start md:self-auto">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>Synced with System Defaults • Isolated to this Assessment</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {availableLanguages.map((lang) => {
              const isChecked = allowedLanguages.includes(lang.id);
              return (
                <div
                  key={lang.id}
                  onClick={() => handleToggleLang(lang.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    isChecked
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs">{lang.label}</span>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isChecked ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700'
                    }`}
                  >
                    {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              onClick={() => setStep(2)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={allowedLanguages.length === 0}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              <span>Continue to Security Rules</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SECURITY & PROCTORING SETTINGS */}
      {step === 4 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                Step 4: Configurable Security & Proctoring Controls
              </h3>
              <p className="text-xs text-slate-400">Configure assessment passcode security and browser/AI vision proctoring policies</p>
            </div>
            <div className="text-xs text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Assessment Specific Policies</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-semibold">Max Warnings Limit:</span>
              <input
                type="number"
                min="1"
                max="20"
                value={securitySettings.maxWarnings}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 1);
                  setSecuritySettings((prev) => ({ ...prev, maxWarnings: val }));
                }}
                className="w-16 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-semibold">Fullscreen Timeout (sec):</span>
              <input
                type="number"
                min="5"
                max="300"
                value={securitySettings.fullscreenTimeoutSec || 30}
                onChange={(e) => {
                  const val = Math.max(5, parseInt(e.target.value) || 30);
                  setSecuritySettings((prev) => ({ ...prev, fullscreenTimeoutSec: val }));
                }}
                className="w-16 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* ASSESSMENT PASSWORD PROTECTION SECTION */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${
                  isPasswordProtected 
                    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' 
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">Assessment Password Protection</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      isPasswordProtected 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                    }`}>
                      {isPasswordProtected ? 'PROTECTED' : 'OPEN ACCESS'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Require candidates to enter an authorized passcode before launching the assessment
                  </p>
                </div>
              </div>

              {/* Interactive Enable/Disable Toggle Button */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-400">
                  {isPasswordProtected ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsPasswordProtected(!isPasswordProtected)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isPasswordProtected ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isPasswordProtected ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {isPasswordProtected ? (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium text-xs">Set Assessment Password / Access Key *</label>
                  <span className="text-[10px] text-indigo-400 font-medium">Candidates need this passcode to enter test</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. AlgoPass2026#"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 pr-10 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                      title={showPassword ? 'Hide Password' : 'Show Password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Generate Password</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Password protection is <strong>Disabled</strong>. Any enrolled student can start the test directly without entering a passcode.
                </span>
              </div>
            )}
          </div>

          {/* CANDIDATE RESULT VISIBILITY SECTION */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${
                  showResultsToStudents 
                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                    : 'bg-amber-600/20 text-amber-400 border-amber-500/30'
                }`}>
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">Student Result & Marks Visibility</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                      showResultsToStudents 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {showResultsToStudents ? 'PUBLISHED IMMEDIATELY' : 'PENDING FACULTY REVIEW'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {showResultsToStudents
                      ? 'Candidates will see their scores, pass/fail status, and test case feedback immediately upon submission'
                      : 'Results are hidden from students after submission until released by faculty'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-400">
                  {showResultsToStudents ? 'Visible' : 'Hidden'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowResultsToStudents(!showResultsToStudents)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showResultsToStudents ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      showResultsToStudents ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* MASTER PROCTORING SENSORS (CAMERA & MICROPHONE)                           */}
          {/* ========================================================================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Master Proctoring Sensors (Camera & Microphone)
              </h4>
              <span className="text-[11px] text-slate-400">
                Disabling master switches automatically turns off & locks child sub-options
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Master Camera Toggle */}
              <div
                onClick={() => handleToggleSecurity('enableCamera')}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between gap-4 shadow-sm ${
                  securitySettings.enableCamera !== false
                    ? 'bg-indigo-950/40 border-indigo-500/60 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      📷 Camera Proctoring Feed
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        securitySettings.enableCamera !== false
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {securitySettings.enableCamera !== false ? 'MASTER: ENABLED' : 'MASTER: DISABLED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Master webcam switch. When disabled, turns off and locks face departure, multiple faces, video recording & live monitoring.
                  </p>
                </div>
                <div className="shrink-0">
                  <div
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                      securitySettings.enableCamera !== false ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        securitySettings.enableCamera !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Master Microphone Toggle */}
              <div
                onClick={() => handleToggleSecurity('enableMicrophone')}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between gap-4 shadow-sm ${
                  securitySettings.enableMicrophone !== false
                    ? 'bg-indigo-950/40 border-indigo-500/60 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      🎙️ Microphone Audio Monitoring
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        securitySettings.enableMicrophone !== false
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {securitySettings.enableMicrophone !== false ? 'MASTER: ENABLED' : 'MASTER: DISABLED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Master audio switch. When disabled, turns off and locks all candidate acoustic thresholds and speech detection.
                  </p>
                </div>
                <div className="shrink-0">
                  <div
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                      securitySettings.enableMicrophone !== false ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        securitySettings.enableMicrophone !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CAMERA-DEPENDENT SUB-OPTIONS                                              */}
          {/* ========================================================================= */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>AI Vision & Video Verification Rules</span>
                {securitySettings.enableCamera === false && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    🔒 Locked (Requires Camera Master Switch Enabled)
                  </span>
                )}
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              {[
                { key: 'detectCameraDisabled', label: 'Detect Camera Permission Revocation / Disconnect' },
                { key: 'detectMultipleFaces', label: 'Detect Multiple Faces in Video Feed' },
                { key: 'detectMultipleFacesAsWarning', label: 'Treat Multiple Faces detection as Warning Strike' },
                { key: 'detectNoFace', label: 'Detect Face Departure / Absence from Frame' },
                { key: 'detectCameraObstruction', label: 'Detect Camera Obstruction & Dark Lens' },
                { key: 'detectVideoFreeze', label: 'Detect Video Feed Freeze / Loop Spoofing' },
                { key: 'liveFacultyMonitoring', label: 'Enable Real-time Faculty Live Camera Stream' },
                { key: 'showCameraPreviewToStudent', label: 'Show Live Camera Preview Tile to Candidate' },
                { key: 'recordProctoringVideo', label: 'Record WebRTC Proctoring Video Session' },
              ].map((setting) => {
                const isCameraOn = securitySettings.enableCamera !== false;
                const val = isCameraOn ? (securitySettings[setting.key as keyof SecuritySettings] as boolean) : false;
                return (
                  <div
                    key={setting.key}
                    onClick={() => isCameraOn && handleToggleSecurity(setting.key as keyof SecuritySettings)}
                    className={`p-3 rounded-xl border transition flex items-center justify-between ${
                      !isCameraOn
                        ? 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-40 cursor-not-allowed'
                        : val
                        ? 'bg-slate-950 border-indigo-500/40 text-slate-200 cursor-pointer hover:border-indigo-500/60'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 cursor-pointer hover:border-slate-700'
                    }`}
                  >
                    <div className="pr-3">
                      <span className="font-medium block">{setting.label}</span>
                      {!isCameraOn && (
                        <span className="text-[10px] text-amber-400/80 block mt-0.5">Disabled — Camera turned off</span>
                      )}
                    </div>
                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                        val ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          val ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* MICROPHONE-DEPENDENT SUB-OPTIONS                                          */}
          {/* ========================================================================= */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>Audio & Acoustic Verification Rules</span>
                {securitySettings.enableMicrophone === false && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    🔒 Locked (Requires Microphone Master Switch Enabled)
                  </span>
                )}
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              {[
                { key: 'detectMicrophoneDisabled', label: 'Detect Microphone Mute or Permission Revocation' },
              ].map((setting) => {
                const isMicOn = securitySettings.enableMicrophone !== false;
                const val = isMicOn ? (securitySettings[setting.key as keyof SecuritySettings] as boolean) : false;
                return (
                  <div
                    key={setting.key}
                    onClick={() => isMicOn && handleToggleSecurity(setting.key as keyof SecuritySettings)}
                    className={`p-3 rounded-xl border transition flex items-center justify-between ${
                      !isMicOn
                        ? 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-40 cursor-not-allowed'
                        : val
                        ? 'bg-slate-950 border-indigo-500/40 text-slate-200 cursor-pointer hover:border-indigo-500/60'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 cursor-pointer hover:border-slate-700'
                    }`}
                  >
                    <div className="pr-3">
                      <span className="font-medium block">{setting.label}</span>
                      {!isMicOn && (
                        <span className="text-[10px] text-amber-400/80 block mt-0.5">Disabled — Microphone turned off</span>
                      )}
                    </div>
                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                        val ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          val ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BROWSER & ENVIRONMENT LOCKDOWN                                            */}
          {/* ========================================================================= */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-300">Browser Lockdown & Integrity Rules</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              {[
                { key: 'requireFullscreen', label: 'Require Fullscreen Mode' },
                { key: 'detectTabSwitch', label: 'Detect Tab Switching & Alt+Tab' },
                { key: 'detectWindowBlur', label: 'Detect Browser Window Blur' },
                { key: 'recordScreenRecording', label: 'Candidate Desktop Screen Recording & Storage' },
                { key: 'recordScreenshots', label: 'Periodic Incident Screenshots' },
                { key: 'detectCopy', label: 'Detect Copy Action' },
                { key: 'detectPaste', label: 'Detect Paste Action' },
                { key: 'detectCut', label: 'Detect Cut Action' },
                { key: 'detectRightClick', label: 'Detect Right-Click Context Menu' },
                { key: 'autoSubmitOnWarningThreshold', label: 'Auto-Submit Assessment on Max Warnings' },
                { key: 'allowPause', label: 'Allow Assessment Pause (Enables Pause/Resume during test with sensor suspension)' },
              ].map((setting) => {
                const val = securitySettings[setting.key as keyof SecuritySettings] as boolean;
                return (
                  <div
                    key={setting.key}
                    onClick={() => handleToggleSecurity(setting.key as keyof SecuritySettings)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      val
                        ? 'bg-slate-950 border-indigo-500/40 text-slate-200'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
                    }`}
                  >
                    <span className="font-medium pr-3">{setting.label}</span>
                    <div
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                        val ? 'bg-indigo-600' : 'bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          val ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => setStep(3)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleSubmitFinal}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{editingAssessment ? 'Save & Update Assessment' : 'Publish & Deploy Assessment'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
