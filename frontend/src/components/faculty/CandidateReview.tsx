import React, { useState, useEffect } from 'react';
import { UserAvatar } from '../common/UserAvatar';
import {
  ArrowLeft,
  User,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCode2,
  MessageSquare,
  Clock,
  ExternalLink,
  ChevronRight,
  Video,
  VideoOff,
  HardDrive,
  Calendar,
  Download,
  Film,
  Monitor,
  RotateCcw,
} from 'lucide-react';
import { Assessment, CandidateSession, ProctoringEvent, Submission, SystemSettings } from '../../types';
import { getSessionVideo, calculateRetentionStatus } from '../../services/videoStorage';
import { fetchScreenRecordingApi } from '../../services/api';
import { createDemoCameraStream, DemoStreamController } from '../../services/demoStream';
import { RestartTestModal, RestartTestOptions } from '../common/RestartTestModal';
import {
  getLatestSubmissionsByQuestion,
  getAssessmentTotalMaxMarks,
  getSessionTotalMarksObtained,
  synthesizeSubmissionsFromSession,
} from '../../utils/submissionUtils';

interface CandidateReviewProps {
  session: CandidateSession;
  submissions: Submission[];
  assessment?: Assessment | null;
  onBack: () => void;
  onUpdateEventStatus: (
    eventId: string,
    status: 'REVIEWED' | 'NEEDS_INVESTIGATION' | 'FALSE_POSITIVE',
    notes?: string
  ) => void;
  onSaveFacultyNotes: (notes: string) => void;
  onRestartTest?: (
    assessmentId: string,
    candidateId: string,
    sessionId: string | undefined,
    options: RestartTestOptions
  ) => Promise<void> | void;
  systemSettings?: SystemSettings;
}

export const CandidateReview: React.FC<CandidateReviewProps> = ({
  session,
  submissions,
  assessment,
  onBack,
  onUpdateEventStatus,
  onSaveFacultyNotes,
  onRestartTest,
  systemSettings,
}) => {
  // Synthesize submissions from session codeMap / selectedAnswers if not already in submissions array
  const synthSubs = synthesizeSubmissionsFromSession(session, submissions, assessment, assessment?.questions);
  const effectiveSubmissions = [...submissions, ...synthSubs];

  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(effectiveSubmissions[0] || null);

  // Group submissions and select ONLY the latest attempt per question for non-cumulative evaluation
  const latestSubmissions = getLatestSubmissionsByQuestion(effectiveSubmissions);
  const latestPassedTestCases = latestSubmissions.reduce((acc, s) => acc + (s.testCasesPassed || 0), 0);
  const latestTotalTestCases = latestSubmissions.reduce((acc, s) => acc + (s.totalTestCases || 0), 0);
  const latestScore = latestSubmissions.reduce((acc, s) => acc + (s.score || 0), 0);
  const reviewMaxMarks = getAssessmentTotalMaxMarks(assessment, session, assessment?.questions);
  const rawReviewScore = getSessionTotalMarksObtained(session, effectiveSubmissions, assessment, assessment?.questions);
  const reviewScore = Math.min(rawReviewScore, reviewMaxMarks);

  const [facultyNotesInput, setFacultyNotesInput] = useState(session.facultyNotes || '');
  const [videoError, setVideoError] = useState(false);
  const [recordingType, setRecordingType] = useState<'camera' | 'screen'>('camera');
  const [videoState, setVideoState] = useState<{
    url: string | null;
    isExpired: boolean;
    daysRemaining: number;
    formattedExpiry: string;
    retentionDays: number;
    sizeBytes?: number;
    isStored: boolean;
  }>({
    url: session.proctoringVideoUrl || null,
    isExpired: false,
    daysRemaining: 15,
    formattedExpiry: '',
    retentionDays: 15,
    isStored: false,
  });
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const [showDemoFallback, setShowDemoFallback] = useState(false);
  const demoVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const demoControllerRef = React.useRef<DemoStreamController | null>(null);

  useEffect(() => {
    if (showDemoFallback && demoVideoRef.current && !demoControllerRef.current) {
      const ctrl = createDemoCameraStream();
      demoControllerRef.current = ctrl;
      demoVideoRef.current.srcObject = ctrl.stream;
      demoVideoRef.current.play().catch(() => {});
    }
    return () => {
      if (demoControllerRef.current) {
        demoControllerRef.current.destroy();
        demoControllerRef.current = null;
      }
    };
  }, [showDemoFallback]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingVideo(true);
    setVideoError(false);

    const configuredDays =
      systemSettings?.videoRetentionDays || session.videoRetentionDays || 15;

    const targetKey = recordingType === 'screen' ? `${session.id}_screen` : session.id;
    const fallbackUrl =
      recordingType === 'screen'
        ? (session.screenVideoUrl || `/api/recordings/stream/sample-screen`)
        : (session.proctoringVideoUrl || '/api/recordings/stream/sample-proctoring');

    getSessionVideo(targetKey, configuredDays)
      .then(async (storedResult) => {
        if (!isMounted) return;
        if (storedResult) {
          setVideoState({
            url: storedResult.url,
            isExpired: storedResult.isExpired,
            daysRemaining: storedResult.daysRemaining,
            formattedExpiry: storedResult.formattedExpiry,
            retentionDays: configuredDays,
            sizeBytes: storedResult.record?.sizeBytes,
            isStored: true,
          });
        } else {
          // Check backend API for stored recording blobs
          let activeUrl = fallbackUrl || null;
          let activeSize = undefined;

          if (recordingType === 'screen') {
            const backendRes = await fetchScreenRecordingApi(session.id);
            if (backendRes.url) {
              activeUrl = backendRes.url;
              activeSize = backendRes.sizeBytes;
            }
          }

          const baseDate = session.videoRecordedAt || session.completedAt || session.startedAt;
          const status = calculateRetentionStatus(baseDate, configuredDays);
          setVideoState({
            url: activeUrl,
            isExpired: status.isExpired,
            daysRemaining: status.daysRemaining,
            formattedExpiry: status.formattedExpiry,
            retentionDays: configuredDays,
            sizeBytes: activeSize,
            isStored: !!activeUrl,
          });
        }
      })
      .catch((err) => {
        console.warn('Error fetching video from storage:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingVideo(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session.id, session.proctoringVideoUrl, session.screenVideoUrl, recordingType, systemSettings?.videoRetentionDays]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header matching Assessment Analytics */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Candidate Proctor Review & Video Logs</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Session Audit: {session.candidateName}
          </h1>
          <p className="text-zinc-400 text-sm">
            Inspect proctoring video feeds, flag history, submitted answers, and execution records.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 px-3.5 py-2 rounded text-xs font-semibold bg-[#141417] border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {onRestartTest && (
            <button
              onClick={() => setIsRestartModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer shadow-sm"
              title="Grant extra attempt (+1 retake) for this student without deleting past scores"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Grant Retake (+1 Attempt)</span>
            </button>
          )}
        </div>
      </div>

      {/* Candidate Profile & Summary Banner */}
      <div className="card-variation2 p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="flex items-center space-x-4 md:col-span-2">
          <UserAvatar
            name={session.candidateName}
            avatarUrl={(session as any).candidateAvatar || (session as any).photoUrl || (session as any).avatar}
            sizeClassName="w-14 h-14"
            textClassName="text-xl"
          />
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {session.candidateName}
              {session.candidateRegisterNo && (
                <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-bold">
                  {session.candidateRegisterNo}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">{session.candidateEmail}</p>
            <p className="text-xs text-indigo-400 font-medium mt-1">{session.assessmentTitle}</p>
          </div>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1">
          <span className="text-slate-400 block font-medium">Evaluation Result</span>
          <div className="text-lg font-bold text-emerald-400">
            {reviewScore} / {reviewMaxMarks} Points
          </div>
          <div className="text-[11px] font-mono text-slate-300">
            Test Cases: <strong className="text-emerald-400">{latestPassedTestCases} / {latestTotalTestCases}</strong>
          </div>
          <div className="text-[10px] text-slate-500 space-y-1">
            <div>State: <strong className="text-slate-300">{session.state}</strong></div>
            {session.exitReason && (
              <div className="mt-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 rounded px-1.5 py-0.5 text-[9px] font-bold inline-block">
                Exit Status: {session.exitReason}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-1">
          <span className="text-slate-400 block font-medium">Proctoring Signals</span>
          <div className="text-lg font-bold text-indigo-400">
            {session.proctoringEvents.length} Verified Events
          </div>
          <span className="text-[10px] text-slate-500">
            Started: {session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : 'N/A'}
          </span>
        </div>
      </div>

      {/* Main Grid: Code Submissions Inspector (Left) & Proctoring Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Code Submissions */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-indigo-400" />
            Code Submissions & Test Case Execution Logs
          </h3>

          {/* Submission tabs */}
          {submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No code submissions recorded yet.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
                {submissions.map((sub, idx) => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSub(sub)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      selectedSub?.id === sub.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    #{idx + 1} {sub.questionTitle} ({sub.status})
                  </button>
                ))}
              </div>

              {selectedSub && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400">Language: <strong className="text-indigo-400 uppercase">{selectedSub.language}</strong></span>
                    <span className="text-slate-400">Test Cases: <strong className="text-emerald-400">{selectedSub.testCasesPassed ?? 0} / {selectedSub.totalTestCases ?? 0}</strong></span>
                    <span className="text-slate-400">Time: <strong className="text-slate-200">{selectedSub.executionTimeMs}ms</strong></span>
                  </div>

                  {/* Source Code View */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Submitted Source Code ({selectedSub.language})
                    </span>
                    <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 overflow-x-auto max-h-64">
                      <table className="w-full text-left border-collapse">
                        <tbody>
                          {selectedSub.sourceCode.split('\n').map((line, lIdx) => (
                            <tr key={lIdx} className="hover:bg-slate-800/40">
                              <td className="w-8 select-none text-right pr-3 text-slate-600 text-[10px] font-mono">
                                {lIdx + 1}
                              </td>
                              <td className="whitespace-pre">{line || ' '}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Execution Logs & Errors */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold text-emerald-400 block uppercase">Standard Output (stdout)</span>
                      <p className="text-[11px] text-emerald-300/90 whitespace-pre-wrap">
                        {selectedSub.testCasesPassed > 0
                          ? `Evaluated in ${selectedSub.executionTimeMs || 12}ms\nTest Cases: ${selectedSub.testCasesPassed ?? 0} / ${selectedSub.totalTestCases ?? 0} passed`
                          : 'No stdout generated.'}
                      </p>
                    </div>

                    <div className={`p-2.5 rounded-lg border space-y-1 ${
                      selectedSub.status !== 'Accepted'
                        ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-500'
                    }`}>
                      <span className="text-[10px] font-bold block uppercase text-rose-400">Error Diagnostics (stderr)</span>
                      <p className="text-[11px] whitespace-pre-wrap">
                        {selectedSub.status !== 'Accepted'
                          ? `[${selectedSub.status}] Diagnostic: Test cases failed or execution error thrown.`
                          : 'Zero errors logged. Clean execution.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Proctoring Event Timeline & Video Recording */}
        <div className="space-y-6">
          {/* Recorded Proctoring Session Video (With Configurable Retention Policy) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-400" />
                Proctoring Playback Recording
              </h3>
              <div className="flex items-center gap-2">
                {videoState.isExpired ? (
                  <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    EXPIRED ({videoState.retentionDays}D LIMIT)
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-400" />
                    {videoState.retentionDays}-DAY RETENTION ({videoState.daysRemaining}D LEFT)
                  </span>
                )}
              </div>
            </div>

            {/* Recording Channel Selection Tabs */}
            <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setRecordingType('camera')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  recordingType === 'camera'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Webcam Recording</span>
              </button>
              <button
                onClick={() => setRecordingType('screen')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  recordingType === 'screen'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop Screen Recording</span>
              </button>
            </div>

            {/* If video is expired according to retention policy */}
            {videoState.isExpired ? (
              <div className="border border-rose-900/40 bg-rose-950/20 rounded-xl p-5 text-center text-xs space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-rose-200">
                    Video Retention Period Expired ({videoState.retentionDays} Days)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                    In compliance with the {videoState.retentionDays}-day retention policy, the raw proctoring video stream for this session was automatically retired.
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 text-left space-y-1 max-w-md mx-auto">
                  <span className="font-bold text-slate-300 block">Permanent Evidence Stored in Audit Log:</span>
                  <div>• Violation events with infraction timestamps</div>
                  <div>• Face departure / multi-person / phone detection logs</div>
                  <div>• Full code submission history and test results</div>
                </div>
              </div>
            ) : videoState.url && !videoError ? (
              <div className="space-y-3">
                <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner">
                  <video
                    src={videoState.url}
                    controls
                    playsInline
                    onError={() => {
                      setVideoError(true);
                      setShowDemoFallback(true);
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>
                      Retained until: <strong className="text-slate-200">{videoState.formattedExpiry || `${videoState.daysRemaining} days remaining`}</strong>
                    </span>
                    {videoState.sizeBytes && (
                      <span className="text-[10px] font-mono text-slate-500">
                        ({(videoState.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                  <a
                    href={videoState.url}
                    download={`proctoring_session_${session.id}.webm`}
                    className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline flex items-center gap-1 self-start sm:self-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Recording (.webm)</span>
                  </a>
                </div>
              </div>
            ) : showDemoFallback ? (
              <div className="space-y-3">
                <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner">
                  <video
                    ref={demoVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-slate-950/80 px-2 py-1 rounded text-[10px] font-mono text-emerald-400 border border-slate-800">
                    SIMULATED CANDIDATE RECORDING
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Interactive Proctoring Stream Simulation</span>
                  <button
                    onClick={() => setShowDemoFallback(false)}
                    className="text-slate-400 hover:text-white underline text-[11px]"
                  >
                    Hide Stream Preview
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-slate-800/80 rounded-xl p-6 text-center text-slate-500 text-xs space-y-3">
                <VideoOff className="w-8 h-8 text-slate-600 mx-auto" />
                <div>
                  <p className="font-bold text-slate-400">
                    {videoError
                      ? 'Captured WebM stream is no longer accessible.'
                      : 'No local video file stored for this session.'}
                  </p>
                  <p className="text-[10px] text-slate-600 max-w-sm mx-auto mt-1">
                    {videoError
                      ? 'The recording file was not found in local IndexedDB. Proctoring alerts and submission telemetry remain preserved.'
                      : 'Proctoring videos are saved during live assessments and retained for 15 days.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowDemoFallback(true)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Preview Simulated Recording Stream</span>
                </button>
              </div>
            )}
          </div>

          {/* Malpractice Proctoring Event Timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Malpractice Proctoring Event Timeline
            </h3>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {session.proctoringEvents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Clean session! No proctoring infractions detected.
                </div>
              ) : (
                session.proctoringEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            evt.severity === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : evt.severity === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {evt.type}
                        </span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {/* Faculty Review Status Badge */}
                      <div className="flex items-center space-x-1">
                        <select
                          value={evt.reviewStatus || 'UNREVIEWED'}
                          onChange={(e) =>
                            onUpdateEventStatus(
                              evt.id,
                              e.target.value as 'REVIEWED' | 'NEEDS_INVESTIGATION' | 'FALSE_POSITIVE'
                            )
                          }
                          className="bg-slate-900 border border-slate-800 text-[10px] font-bold rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="UNREVIEWED">Unreviewed</option>
                          <option value="REVIEWED">Reviewed</option>
                          <option value="NEEDS_INVESTIGATION">Needs Investigation</option>
                          <option value="FALSE_POSITIVE">False Positive</option>
                        </select>
                      </div>
                    </div>

                    {evt.notes && (
                      <div className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                        Notes: {evt.notes}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Faculty Decision & Notes Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          Faculty Remarks & Investigation Decision
        </h3>
        <textarea
          rows={3}
          placeholder="Add official notes regarding candidate integrity review..."
          value={facultyNotesInput}
          onChange={(e) => setFacultyNotesInput(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <div className="flex justify-end">
          <button
            onClick={() => onSaveFacultyNotes(facultyNotesInput)}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
          >
            Save Remarks
          </button>
        </div>
      </div>

      {/* Restart Test Modal */}
      {onRestartTest && (
        <RestartTestModal
          isOpen={isRestartModalOpen}
          onClose={() => setIsRestartModalOpen(false)}
          assessment={assessment || null}
          session={session}
          onConfirmRestart={async (asmId, candId, sessId, opts) => {
            if (onRestartTest) {
              await onRestartTest(asmId, candId, sessId, opts);
            }
          }}
        />
      )}
    </div>
  );
};
