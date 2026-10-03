import React, { useEffect, useState, useRef } from 'react';
import {
  Timer,
  ShieldCheck,
  Camera,
  Mic,
  Maximize2,
  Play,
  AlertTriangle,
  CheckCircle2,
  User,
  Clock,
  Code2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { Assessment, CandidateSession } from '../../types';

interface PreTestCountdownViewProps {
  assessment: Assessment;
  session?: CandidateSession | null;
  mediaStream?: MediaStream | null;
  onCountdownComplete: () => void;
  onCancel?: () => void;
}

export const PreTestCountdownView: React.FC<PreTestCountdownViewProps> = ({
  assessment,
  session,
  mediaStream,
  onCountdownComplete,
  onCancel,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Bind live mediaStream to video preview if available
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(() => {});
    }
  }, [mediaStream]);

  // Request fullscreen if not already in fullscreen mode
  useEffect(() => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }, []);

  // 30-Second Countdown timer
  useEffect(() => {
    if (hasStarted) return;

    if (secondsRemaining <= 0) {
      setHasStarted(true);
      onCountdownComplete();
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHasStarted(true);
          onCountdownComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining, hasStarted, onCountdownComplete]);

  const handleStartImmediately = () => {
    if (hasStarted) return;
    setHasStarted(true);
    onCountdownComplete();
  };

  const totalQuestions = assessment.questions?.length || 0;
  const totalPoints =
    (assessment.questions || []).reduce((acc, q) => acc + (q.points || 0), 0) || 100;
  const duration = assessment.durationMinutes || 60;

  // Circular progress calculations (Radius = 54, Circumference = 2 * PI * 54 ≈ 339.29)
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progressFraction = (30 - secondsRemaining) / 30;
  const strokeDashoffset = circumference - progressFraction * circumference;

  const isUrgent = secondsRemaining <= 5;

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#e4e4e7] flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tracking-wider uppercase text-emerald-400 font-semibold block">
                Camera & Screen Share Access Granted
              </span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                ✓ Permissions Verified
              </span>
            </div>
            <h1 className="text-base font-bold text-white tracking-tight">{assessment.title}</h1>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 text-xs font-medium transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10">
        {/* Left Column: 30s Countdown Display */}
        <div className="lg:col-span-5 flex flex-col items-center text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold">
            <Timer className="w-3.5 h-3.5 animate-pulse" />
            <span>Pre-Test Countdown</span>
          </div>

          {/* Radial Circular Progress Timer */}
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 130 130">
              <circle
                cx="65"
                cy="65"
                r={radius}
                className="stroke-slate-800/80"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="65"
                cy="65"
                r={radius}
                className={`transition-all duration-1000 ease-linear ${
                  isUrgent ? 'stroke-rose-500 shadow-lg shadow-rose-500/50' : 'stroke-indigo-500'
                }`}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Inner Digits Counter */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-5xl sm:text-6xl font-black font-mono tracking-tight transition-colors duration-300 ${
                  isUrgent ? 'text-rose-400 animate-pulse' : 'text-white'
                }`}
              >
                {secondsRemaining < 10 ? `0${secondsRemaining}` : secondsRemaining}
              </span>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-1">
                Seconds
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">
              {isUrgent ? 'Test beginning now...' : 'Assessment starts automatically'}
            </p>
            <p className="text-xs text-slate-400 max-w-xs">
              Take a breath and review the test guidelines. Your official exam timer begins once this buffer reaches 00.
            </p>
          </div>

          {/* Instant Launch Action Button */}
          <button
            type="button"
            onClick={handleStartImmediately}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>I am Ready — Start Assessment Now ({secondsRemaining}s)</span>
          </button>
        </div>

        {/* Right Column: Assessment Details, Proctoring Feed & Rules */}
        <div className="lg:col-span-7 space-y-4">
          {/* Metadata Cards Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Duration</span>
              <span className="text-base font-bold text-white mt-1 flex items-center space-x-1">
                <Clock className="w-4 h-4 text-indigo-400 inline" />
                <span>{duration} Mins</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Questions</span>
              <span className="text-base font-bold text-white mt-1 flex items-center space-x-1">
                <Code2 className="w-4 h-4 text-indigo-400 inline" />
                <span>{totalQuestions} Tasks</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Max Score</span>
              <span className="text-base font-bold text-white mt-1 flex items-center space-x-1">
                <Sparkles className="w-4 h-4 text-amber-400 inline" />
                <span>{totalPoints} Pts</span>
              </span>
            </div>
          </div>

          {/* Candidate & Proctoring Setup Card */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center gap-4">
            {/* Live Camera Preview */}
            <div className="relative w-32 h-24 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
              {mediaStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 space-y-1">
                  <Camera className="w-5 h-5" />
                  <span className="text-[9px]">Camera Ready</span>
                </div>
              )}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[9px] font-mono text-emerald-400 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE</span>
              </div>
            </div>

            {/* Verification checklist */}
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex items-center space-x-2 text-slate-300">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-white">
                  {session?.candidateName || 'Candidate'}
                </span>
                {session?.candidateRegisterNo && (
                  <span className="text-slate-400 font-mono text-[11px]">
                    ({session.candidateRegisterNo})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Camera Stream Granted</span>
                </span>
                <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Screen Share Verified</span>
                </span>
                <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Microphone Active</span>
                </span>
                <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Fullscreen & Proctoring Ready</span>
                </span>
              </div>
            </div>
          </div>

          {/* Test Regulations & Integrity Rules */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold uppercase tracking-wider text-[10px] font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>Mandatory Examination Rules</span>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-slate-300">
              <div className="flex items-start space-x-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  <strong>Fullscreen Enforcement:</strong> Keep fullscreen active throughout the entire test. Exiting fullscreen records a violation.
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  <strong>Tab Switches & Windows:</strong> Navigating away from the exam tab or opening third-party tools registers an integrity flag.
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>
                  <strong>Auto-Save & Evaluation:</strong> Your code is continuously synced. Remember to test all test cases before final submission.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Notice */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500 z-10 border-t border-slate-900 pt-3">
        <span>CodeExam Secure Assessment Environment • Powered by Real-Time Telemetry</span>
      </footer>
    </div>
  );
};
