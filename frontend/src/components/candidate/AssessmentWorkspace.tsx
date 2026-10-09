import React, { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Clock,
  Play,
  Pause,
  Send,
  AlertTriangle,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Code2,
  Terminal,
  CheckCircle2,
  XCircle,
  Wifi,
  Video,
  LogOut,
  Check,
  CheckCircle,
  HelpCircle,
  FileCode2,
  CameraOff,
  RefreshCw,
  Smartphone,
  Users,
  ExternalLink,
  Loader2,
  AlertCircle,
  Monitor,
  X,
  ShieldAlert,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { executeCodeInSandbox, executeCustomInput, SingleExecutionResult } from '../../services/codeRunner';
import { Assessment, CandidateSession, CodeExecutionResult, Question, Submission, StudentSettings } from '../../types';

const SUPPORTED_LANGUAGES = ['c', 'cpp', 'java', 'python', 'javascript'] as const;
import { Socket } from 'socket.io-client';
import { createResilientSocket, getOrCreateSessionSocket, closeSessionSocket } from '../../services/socketClient';
import { CandidateWebRTCPublisher } from '../../services/webrtcProctor';
import { FrameTelemetry, LocalProctorDetector } from '../../services/proctorDetector';
import { ProctorCamera } from './ProctorCamera';
import { storeSessionVideo } from '../../services/videoStorage';
import { saveAttemptToFirestore } from '../../services/firebase';
import { getCandidateAssignedQuestions, calculateQuestionScore } from '../../utils/submissionUtils';
import { setAssessmentActiveState } from '../../services/supabaseDatabase';
import {
  uploadRecordingApi,
  startScreenRecordingApi,
  uploadScreenChunkApi,
  finalizeScreenRecordingApi,
  updateMonitoringStatusApi,
} from '../../services/api';
import { RecordingTimelineEvent } from '../../types';

interface AssessmentWorkspaceProps {
  assessment: Assessment;
  session: CandidateSession;
  mediaStream?: MediaStream | null;
  propScreenStream?: MediaStream | null;
  studentSettings?: StudentSettings;
  onSubmitQuestion: (questionId: string, language: string, code: string) => Promise<CodeExecutionResult>;
  onLogProctoringEvent: (type: string, metadata?: Record<string, any>) => void;
  onFinishAssessment: (
    reason?: string,
    proctoringVideoUrl?: string,
    warningsCount?: number,
    finalCodeMap?: Record<string, string>,
    finalLanguage?: string,
    finalLanguageMap?: Record<string, string>
  ) => void | Promise<void>;
}

export interface QuestionStatusItem {
  status: 'Accepted' | 'Wrong Answer' | 'Compilation Error' | 'Runtime Error' | 'Submitted' | 'Unattempted';
  score?: number;
  testCasesPassed?: number;
  totalTestCases?: number;
  selectedLanguage?: string;
  language?: string;
}

export const AssessmentWorkspace: React.FC<AssessmentWorkspaceProps> = ({
  assessment,
  session,
  mediaStream: propMediaStream,
  propScreenStream,
  studentSettings,
  onSubmitQuestion,
  onLogProctoringEvent,
  onFinishAssessment,
}) => {
  const safeAssessment = assessment || {
    id: 'default-asm',
    title: 'Assessment',
    description: '',
    durationMinutes: 60,
    questions: [],
    securitySettings: { maxWarnings: 5, detectMultipleFaces: true, detectNoFace: true, detectCopy: true, detectPaste: true, detectRightClick: true, requireFullscreen: true },
    allowedLanguages: ['python', 'javascript'],
  };
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [micActive, setMicActive] = useState<boolean>(true);
  const [cameraRetryCount, setCameraRetryCount] = useState<number>(0);

  // Live stream & proctoring telemetry states
  const [currentMediaStream, setCurrentMediaStream] = useState<MediaStream | null>(propMediaStream || null);
  const [proctorTelemetry, setProctorTelemetry] = useState<FrameTelemetry | null>(null);
  const [showFloatingCamera, setShowFloatingCamera] = useState<boolean>(true);

  const mediaStreamRef = useRef<MediaStream | null>(propMediaStream || null);
  const assessmentEndedRef = useRef<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const publisherRef = useRef<CandidateWebRTCPublisher | null>(null);
  const detectorRef = useRef<LocalProctorDetector | null>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const hasEnteredFullscreenRef = useRef<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoBlobUrlRef = useRef<string | null>(null);

  // Screen recording state & progressive chunk upload refs
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenRecordedChunksRef = useRef<Blob[]>([]);
  const recordingIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(Date.now());
  const timelineEventsRef = useRef<RecordingTimelineEvent[]>([]);
  const chunkUploadQueueRef = useRef<Array<{ index: number; blob: Blob; duration: number }>>([]);
  const isUploadingChunkRef = useRef<boolean>(false);

  const [isScreenRecordingActive, setIsScreenRecordingActive] = useState<boolean>(false);
  const [screenShareInterrupted, setScreenShareInterrupted] = useState<boolean>(false);
  const [showScreenSharePromptModal, setShowScreenSharePromptModal] = useState<boolean>(false);
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState<boolean>(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);

  // Background frame broadcaster for rock-solid live monitoring in production
  const frameStreamIntervalRef = useRef<any>(null);
  const offscreenCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const startFrameBroadcaster = () => {
    if (frameStreamIntervalRef.current) return;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    if (!offscreenCamVideoRef.current) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      offscreenCamVideoRef.current = v;
    }
    if (!offscreenScreenVideoRef.current) {
      const sv = document.createElement('video');
      sv.muted = true;
      sv.playsInline = true;
      sv.autoplay = true;
      offscreenScreenVideoRef.current = sv;
    }

    frameStreamIntervalRef.current = setInterval(() => {
      const sock = socketRef.current;
      if (!sock) return;
      const canvas = offscreenCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Camera Frame
      const camStream = mediaStreamRef.current;
      const camVid = offscreenCamVideoRef.current;
      if (camStream && camVid && camStream.active && camStream.getVideoTracks().length > 0) {
        if (camVid.srcObject !== camStream) {
          camVid.srcObject = camStream;
          camVid.play().catch(() => {});
        }
        if (camVid.videoWidth > 0 && camVid.videoHeight > 0) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(camVid, 0, 0, 320, 240);
          try {
            const frameData = canvas.toDataURL('image/jpeg', 0.45);
            sock.emit('candidate_live_frame', {
              assessmentId: assessment.id,
              sessionId: session.id,
              candidateId: session.candidateId,
              candidateName: session.candidateName,
              feedType: 'camera',
              frameData,
              timestamp: Date.now(),
            });
          } catch {}
        }
      }

      // 2. Screen Frame
      const scrStream = screenStreamRef.current;
      const scrVid = offscreenScreenVideoRef.current;
      if (scrStream && scrVid && scrStream.active && scrStream.getVideoTracks().length > 0) {
        if (scrVid.srcObject !== scrStream) {
          scrVid.srcObject = scrStream;
          scrVid.play().catch(() => {});
        }
        if (scrVid.videoWidth > 0 && scrVid.videoHeight > 0) {
          canvas.width = 320;
          canvas.height = 180;
          ctx.drawImage(scrVid, 0, 0, 320, 180);
          try {
            const frameData = canvas.toDataURL('image/jpeg', 0.45);
            sock.emit('candidate_live_frame', {
              assessmentId: assessment.id,
              sessionId: session.id,
              candidateId: session.candidateId,
              candidateName: session.candidateName,
              feedType: 'screen',
              frameData,
              timestamp: Date.now(),
            });
          } catch {}
        }
      }
    }, 1200);
  };

  const stopFrameBroadcaster = () => {
    if (frameStreamIntervalRef.current) {
      clearInterval(frameStreamIntervalRef.current);
      frameStreamIntervalRef.current = null;
    }
    if (offscreenCamVideoRef.current) {
      offscreenCamVideoRef.current.srcObject = null;
    }
    if (offscreenScreenVideoRef.current) {
      offscreenScreenVideoRef.current.srcObject = null;
    }
  };

  // Centralized stop media function
  const stopMediaStream = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (err) {
        console.warn('Track stop error:', err);
      }
    });
  };

  // Stop recording and compile video blob URL & upload to Google Drive
  const stopRecordingAndGetUrl = (): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(videoBlobUrlRef.current || undefined);
        return;
      }

      const mimeType = recorder.mimeType || 'video/webm';

      recorder.onstop = async () => {
        try {
          if (recordedChunksRef.current.length > 0) {
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            const localUrl = URL.createObjectURL(blob);
            videoBlobUrlRef.current = localUrl;

            // 1. Persist recorded video into local browser IndexedDB
            storeSessionVideo(session.id, blob, session.videoRetentionDays || 15, {
              candidateId: session.candidateId,
              candidateName: session.candidateName,
              assessmentId: assessment.id,
              assessmentTitle: assessment.title,
            }).catch((err) => console.warn('[AssessmentWorkspace] Error saving video to storage:', err));

            // 2. Upload recording directly to Google Drive via Backend API
            try {
              const fileName = `ASSESSMENT${assessment.id}_STUDENT${session.candidateId}_${Date.now()}.webm`;
              const formData = new FormData();
              formData.append('recording', blob, fileName);
              formData.append('assessmentId', assessment.id);
              formData.append('sessionId', session.id);
              formData.append('candidateId', session.candidateId);
              formData.append('duration', String(assessment.durationMinutes * 60 - timeLeftSec));

              const res = await fetch('/api/recordings/upload', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer token`,
                  'X-User-Id': session.candidateId,
                },
                body: formData,
              });

              if (res.ok) {
                const data = await res.json();
                if (data.streamUrl) {
                  videoBlobUrlRef.current = data.streamUrl;
                  resolve(data.streamUrl);
                  return;
                }
              }
            } catch (uploadErr) {
              console.warn('[AssessmentWorkspace] Error uploading recording to Google Drive:', uploadErr);
            }

            resolve(localUrl);
          } else {
            resolve(undefined);
          }
        } catch (e) {
          console.warn('Error compiling video blob:', e);
          resolve(undefined);
        }
      };

      try {
        if (recorder.state === 'recording') {
          recorder.stop();
        } else {
          resolve(videoBlobUrlRef.current || undefined);
        }
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
        resolve(undefined);
      }
    });
  };

  // Log timeline event for screen recording playback and monitoring
  const logRecordingTimelineEvent = (
    type: string,
    description: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'INFO' = 'INFO'
  ) => {
    const offsetSeconds = Math.max(0, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
    const mins = Math.floor(offsetSeconds / 60);
    const secs = offsetSeconds % 60;
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const evt: RecordingTimelineEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      offsetSeconds,
      formattedTime,
      type,
      description,
      severity,
    };
    timelineEventsRef.current.push(evt);

    updateMonitoringStatusApi(session.id, {
      event: { type, description, severity },
    }).catch(() => {});
  };

  // Progressive chunk upload queue worker
  const processChunkUploadQueue = async () => {
    if (isUploadingChunkRef.current) return;
    if (chunkUploadQueueRef.current.length === 0) return;
    const recId = recordingIdRef.current;
    if (!recId) return;

    isUploadingChunkRef.current = true;
    while (chunkUploadQueueRef.current.length > 0) {
      const item = chunkUploadQueueRef.current[0];
      try {
        await uploadScreenChunkApi(recId, item.blob, item.index, item.duration);
        chunkUploadQueueRef.current.shift();
      } catch (err) {
        console.warn(`[ScreenRecording] Upload chunk ${item.index} failed:`, err);
        break;
      }
    }
    isUploadingChunkRef.current = false;
  };

  // Attaches and begins recording for any valid screen stream (native or sandbox monitor)
  const attachAndStartScreenStream = async (screenStream: MediaStream, isFallback = false) => {
    screenStreamRef.current = screenStream;
    setIsScreenRecordingActive(true);
    setScreenShareInterrupted(false);
    setShowScreenSharePromptModal(false);
    setScreenShareError(null);

    // Official test timer begins now that all access & screen sharing permissions are acquired
    session.startedAt = new Date().toISOString();
    session.startTime = new Date().toISOString();
    setTimeLeftSec((safeAssessment.durationMinutes || 60) * 60);
    if (!session.startedAt) {
      session.startedAt = new Date().toISOString();
      session.startTime = new Date().toISOString();
    }
    if (session.timeLeftSec === undefined && session.timer === undefined) {
      setTimeLeftSec((safeAssessment.durationMinutes || 60) * 60);
    }

    // Stream live desktop screen to faculty monitoring via WebRTC
    if (publisherRef.current) {
      try {
        publisherRef.current.updateStream(screenStream);
      } catch (err) {
        console.warn('[ScreenRecording] WebRTC stream update error:', err);
      }
    }

    // Initialize recording session in backend
    let recId = recordingIdRef.current;
    if (!recId) {
      try {
        const startRes = await startScreenRecordingApi({
          assessmentId: assessment.id,
          attemptId: session.id,
          studentId: session.candidateId,
          studentName: session.candidateName,
          studentRegisterNo: session.candidateRegisterNo || (session as any).registerNo,
        });
        recId = startRes.recordingId;
        recordingIdRef.current = recId;
        recordingStartTimeRef.current = Date.now();
        chunkIndexRef.current = 0;
        timelineEventsRef.current = [];
        logRecordingTimelineEvent(
          'SCREEN_SHARING_STARTED',
          isFallback
            ? 'Desktop stream initialized via sandbox screen monitor'
            : 'Screen sharing permission granted and desktop recording started',
          'INFO'
        );
      } catch (e) {
        console.warn('[ScreenRecording] startScreenRecordingApi error:', e);
        recordingIdRef.current = `rec_${session.id}`;
        recId = recordingIdRef.current;
      }
    } else {
      logRecordingTimelineEvent(
        'SCREEN_SHARING_RESUMED',
        'Screen sharing re-established and live streaming resumed',
        'INFO'
      );
      updateMonitoringStatusApi(session.id, {
        status: 'STREAMING',
        streamStatus: 'LIVE',
        screenActive: true,
        event: {
          type: 'SCREEN_SHARING_RESUMED',
          description: 'Screen sharing re-established and live streaming resumed',
          severity: 'INFO',
        },
      }).catch(() => {});
    }

    // Start chunk recording (5 seconds per chunk)
    try {
      const mimeTypes = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
      let chosenMime: string | undefined;
      for (const m of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)) {
          chosenMime = m;
          break;
        }
      }

      const rec = chosenMime
        ? new MediaRecorder(screenStream, { mimeType: chosenMime })
        : new MediaRecorder(screenStream);
      screenRecorderRef.current = rec;

      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunkIndexRef.current += 1;
          const currentDuration = Math.max(0, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
          screenRecordedChunksRef.current.push(event.data);
          chunkUploadQueueRef.current.push({
            index: chunkIndexRef.current,
            blob: event.data,
            duration: currentDuration,
          });
          processChunkUploadQueue();
        }
      };

      rec.onstop = async () => {
        if (screenRecordedChunksRef.current.length > 0) {
          const screenBlob = new Blob(screenRecordedChunksRef.current, { type: 'video/webm' });
          storeSessionVideo(`${session.id}_screen`, screenBlob, session.videoRetentionDays || 15, {
            candidateId: session.candidateId,
            candidateName: session.candidateName,
            assessmentId: assessment.id,
            assessmentTitle: `${assessment.title || 'Assessment'} (Screen Recording)`,
          }).catch(() => {});
        }
      };

      // Detect when student stops sharing (clicks "Stop sharing" in browser bar)
      screenStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.onended = () => {
          setIsScreenRecordingActive(false);
          setScreenShareInterrupted(true);
          logRecordingTimelineEvent(
            'SCREEN_SHARING_STOPPED',
            'Screen sharing was disconnected or stopped by student',
            'HIGH'
          );
          updateMonitoringStatusApi(session.id, {
            status: 'INTERRUPTED',
            streamStatus: 'INTERRUPTED',
            screenActive: false,
            event: {
              type: 'SCREEN_SHARING_STOPPED',
              description: 'Student stopped desktop screen sharing.',
              severity: 'HIGH',
            },
          }).catch(() => {});
          onLogProctoringEvent('SCREEN_SHARE_STOPPED', {
            message: 'Candidate stopped desktop screen sharing.',
            timestamp: new Date().toISOString(),
          });
          registerProctoringWarning(
            'SCREEN_SHARE_STOPPED',
            'Desktop Screen Sharing was disconnected. Continuous screen sharing is required.'
          );
        };
      });

      rec.start(5000);
    } catch (recorderErr) {
      console.warn('[ScreenRecording] MediaRecorder initialization error:', recorderErr);
    }
  };

  // Start or recover screen recording & WebRTC streaming
  const handleStartScreenRecording = async () => {
    setIsRequestingScreenShare(true);
    setScreenShareError(null);

    // If pre-acquired screen stream from before the timer exists and is active, reuse it directly!
    if (propScreenStream && propScreenStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      await attachAndStartScreenStream(propScreenStream, false);
      setIsRequestingScreenShare(false);
      return;
    }

    // Check if browser supports getDisplayMedia
    if (!navigator.mediaDevices || typeof (navigator.mediaDevices as any).getDisplayMedia !== 'function') {
      setScreenShareError('Screen Capture API is not supported in this browser. Please use Chrome, Edge, or Firefox in a standard browser window.');
      setIsRequestingScreenShare(false);
      return;
    }

    try {
      // First attempt with standard video constraints
      let screenStream: MediaStream | null = null;
      try {
        screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
          audio: false,
        });
      } catch (firstErr: any) {
        // Retry with displaySurface hint if supported
        console.warn('[ScreenRecording] First getDisplayMedia attempt failed, retrying:', firstErr);
        screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: { displaySurface: 'monitor' },
          audio: false,
        });
      }

      if (screenStream) {
        await attachAndStartScreenStream(screenStream, false);
      }
    } catch (err: any) {
      console.warn('[AssessmentWorkspace] Desktop Screen Recording permission error or canceled:', err);
      const msg = (err?.message || '').toLowerCase();
      const isPermissionsPolicy =
        err?.name === 'NotAllowedError' &&
        (msg.includes('permission') || msg.includes('policy') || msg.includes('disallowed') || msg.includes('feature'));

      if (isPermissionsPolicy) {
        setScreenShareError(
          'Screen sharing is restricted inside iframe preview mode. Click "Open in Full Tab" to open the assessment in a dedicated window and grant screen sharing permission.'
        );
      } else if (err?.name === 'NotAllowedError') {
        setScreenShareError(
          'Screen sharing was canceled or denied in the browser dialog. Continuous screen sharing is required. Please click "Grant Permission & Share Screen" to retry.'
        );
      } else {
        setScreenShareError(
          err?.message || 'Could not initiate screen capture. Please allow screen sharing to continue your assessment.'
        );
      }
      setShowScreenSharePromptModal(true);
    } finally {
      setIsRequestingScreenShare(false);
    }
  };

  // Finalize screen recording on submit or termination
  const finalizeScreenRecordingSession = async () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      try {
        screenRecorderRef.current.stop();
      } catch (e) {}
    }

    if (chunkUploadQueueRef.current.length > 0 && recordingIdRef.current) {
      for (const item of [...chunkUploadQueueRef.current]) {
        try {
          await uploadScreenChunkApi(recordingIdRef.current, item.blob, item.index, item.duration);
        } catch (e) {}
      }
      chunkUploadQueueRef.current = [];
    }

    if (recordingIdRef.current) {
      const finalDuration = Math.max(1, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      logRecordingTimelineEvent('ASSESSMENT_SUBMITTED', 'Assessment submitted and proctoring session finalized', 'INFO');
      try {
        await finalizeScreenRecordingApi(recordingIdRef.current, {
          duration: finalDuration,
          events: timelineEventsRef.current,
        });
      } catch (err) {
        console.warn('[ScreenRecording] finalize error:', err);
      }
    }

    if (screenStreamRef.current) {
      stopMediaStream(screenStreamRef.current);
      screenStreamRef.current = null;
    }
    setIsScreenRecordingActive(false);
  };

  // Centralized cleanup function for all assessment resources
  const cleanupAssessmentResources = () => {
    stopFrameBroadcaster();
    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current = null;
    }
    if (publisherRef.current) {
      publisherRef.current.stop();
      publisherRef.current = null;
    }
    if (assessmentEndedRef.current) {
      if (socketRef.current) {
        closeSessionSocket(session.id);
        socketRef.current = null;
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      try {
        screenRecorderRef.current.stop();
      } catch (e) {}
    }
    if (screenStreamRef.current) {
      stopMediaStream(screenStreamRef.current);
      screenStreamRef.current = null;
    }
    if (mediaStreamRef.current) {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
    }
    if (propMediaStream) {
      stopMediaStream(propMediaStream);
    }
    setIsScreenRecordingActive(false);
    setCameraActive(false);
    setMicActive(false);
  };

  // Notifies the monitoring server and updates Firestore.
  // CRITICAL: Temporary window hiding, tab switching, re-render or network disconnect must NEVER mark an active test as ENDED!
  const notifySessionDisconnection = (reason: string = 'PAGE_CLOSED') => {
    const nowIso = new Date().toISOString();

    if (!assessmentEndedRef.current) {
      console.log(`[AssessmentWorkspace] Temporary disconnection notification (${reason}). Test session remains ACTIVE.`);
      try {
        const statusPayload = JSON.stringify({
          connectionStatus: 'DISCONNECTED',
          streamStatus: 'OFFLINE',
          isLive: false,
          state: 'ACTIVE',
          status: 'ACTIVE',
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            `/api/monitoring/${encodeURIComponent(session.id)}/status`,
            new Blob([statusPayload], { type: 'application/json' })
          );
        } else {
          fetch(`/api/monitoring/${encodeURIComponent(session.id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: statusPayload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch (e) {}
      return;
    }

    try {
      const endPayload = JSON.stringify({
        reason,
        endedAt: nowIso,
        explicit: true,
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/sessions/${encodeURIComponent(session.id)}/end`,
          new Blob([endPayload], { type: 'application/json' })
        );
      } else {
        fetch(`/api/sessions/${encodeURIComponent(session.id)}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: endPayload,
          keepalive: true,
        }).catch(() => {});
      }

      const statusPayload = JSON.stringify({
        status: 'ENDED',
        state: 'ENDED',
        streamStatus: 'OFFLINE',
        isActive: false,
        isLive: false,
        endedAt: nowIso,
        cameraActive: false,
        screenActive: false,
        connectionStatus: 'DISCONNECTED',
        event: {
          type: 'PAGE_CLOSED',
          description: `Candidate test completed/exited (${reason})`,
          severity: 'INFO',
        },
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `/api/monitoring/${encodeURIComponent(session.id)}/status`,
          new Blob([statusPayload], { type: 'application/json' })
        );
      } else {
        fetch(`/api/monitoring/${encodeURIComponent(session.id)}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: statusPayload,
          keepalive: true,
        }).catch(() => {});
      }

      if (socketRef.current) {
        socketRef.current.emit('candidate_session_ended', {
          assessmentId: safeAssessment.id,
          sessionId: session.id,
          reason,
          explicit: true,
        });
        socketRef.current.emit('webrtc_leave_room', {
          assessmentId: safeAssessment.id,
          sessionId: session.id,
          role: 'CANDIDATE',
          reason,
        });
      }
    } catch (e) {}

    saveAttemptToFirestore({
      ...session,
      id: session.id,
      attemptId: session.id,
      state: 'ENDED',
      status: 'ENDED',
      isActive: false,
      isLive: false,
      endedAt: nowIso,
      cameraActive: false,
      screenActive: false,
      connectionStatus: 'DISCONNECTED',
      timer: timeLeftSec,
      timeLeftSec: timeLeftSec,
      updatedAt: nowIso,
    }).catch(() => {});
  };

  // Idempotent end assessment function
  const endAssessment = async (reason: 'MANUAL_SUBMIT' | 'TIME_EXPIRED' | 'AUTO_SUBMIT' | 'FACULTY_TERMINATED' | 'USER_EXIT') => {
    if (assessmentEndedRef.current) return;
    assessmentEndedRef.current = true;

    let reasonStr = 'Manual Submit';
    if (reason === 'TIME_EXPIRED') reasonStr = 'Time Expired';
    else if (reason === 'AUTO_SUBMIT') reasonStr = 'Auto Submit (Warnings Exceeded)';
    else if (reason === 'FACULTY_TERMINATED') reasonStr = 'Force-terminated by Faculty';
    else if (reason === 'USER_EXIT') reasonStr = 'Exited by User';

    try {
      await syncAllCodeAndFinish(reasonStr);
    } finally {
      cleanupAssessmentResources();
    }
  };

  // Page lifecycle listeners & background camera proctoring setup
  useEffect(() => {
    // Camera & Microphone access strictly controlled by assessment security settings
    const isCameraEnabledInSettings =
      safeAssessment.securitySettings?.enableCamera !== false &&
      (safeAssessment.securitySettings?.recordProctoringVideo !== false ||
        safeAssessment.securitySettings?.detectMultipleFaces !== false ||
        safeAssessment.securitySettings?.detectNoFace !== false ||
        safeAssessment.securitySettings?.detectCameraDisabled !== false ||
        safeAssessment.securitySettings?.detectCameraObstruction !== false ||
        safeAssessment.securitySettings?.detectVideoFreeze !== false ||
        safeAssessment.securitySettings?.liveFacultyMonitoring !== false ||
        safeAssessment.securitySettings?.showCameraPreviewToStudent !== false);

    const isMicEnabledInSettings =
      safeAssessment.securitySettings?.enableMicrophone !== false &&
      safeAssessment.securitySettings?.detectMicrophoneDisabled !== false;

    if (!isCameraEnabledInSettings && !isMicEnabledInSettings) {
      console.log('[AssessmentWorkspace] Camera & Microphone access skipped: disabled by settings.');
      setCameraActive(false);
      setMicActive(false);
      return;
    }

    let activeStream = cameraRetryCount > 0 ? null : (propMediaStream || null);

    async function initCameraAndProctoring() {
      try {
        if (!activeStream) {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: isCameraEnabledInSettings ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } } : false,
            audio: isMicEnabledInSettings,
          });
        }
        mediaStreamRef.current = activeStream;
        setCurrentMediaStream(activeStream);
        setCameraActive(isCameraEnabledInSettings);
        setMicActive(isMicEnabledInSettings);

        // Initialize temporary session video recording only if enabled in security settings
        const isVideoRecordingEnabled = safeAssessment.securitySettings?.recordProctoringVideo !== false && isCameraEnabledInSettings;
        if (isVideoRecordingEnabled && typeof window !== 'undefined' && typeof (window as any).MediaRecorder !== 'undefined') {
          recordedChunksRef.current = [];

          const startSafeRecorder = (stream: MediaStream): MediaRecorder | null => {
            const vTracks = stream.getVideoTracks();
            if (!vTracks || vTracks.length === 0) return null;

            // Prioritized mime type list
            const candidateMimes = [
              'video/webm;codecs=vp9,opus',
              'video/webm;codecs=vp8,opus',
              'video/webm',
              'video/mp4;codecs=avc1,mp4a.40.2',
              'video/mp4',
            ];

            let chosenMime: string | undefined = undefined;
            if (typeof MediaRecorder.isTypeSupported === 'function') {
              for (const mime of candidateMimes) {
                try {
                  if (MediaRecorder.isTypeSupported(mime)) {
                    chosenMime = mime;
                    break;
                  }
                } catch {
                  // ignore
                }
              }
            }

            // If combined audio/video fails, also try video-only stream
            const streamsToAttempt: MediaStream[] = [stream];
            if (stream.getAudioTracks().length > 0) {
              try {
                streamsToAttempt.push(new MediaStream(vTracks));
              } catch {}
            }

            for (const targetStream of streamsToAttempt) {
              const optionSets = chosenMime ? [{ mimeType: chosenMime }, undefined] : [undefined];
              for (const opts of optionSets) {
                try {
                  const rec = opts ? new MediaRecorder(targetStream, opts) : new MediaRecorder(targetStream);
                  rec.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                      recordedChunksRef.current.push(event.data);
                    }
                  };
                  rec.onerror = (ev: any) => {
                    console.warn('[AssessmentWorkspace] MediaRecorder event error:', ev?.error || ev);
                  };

                  try {
                    rec.start(1000);
                  } catch {
                    rec.start();
                  }

                  if (rec.state === 'recording') {
                    return rec;
                  }
                } catch {
                  // Try next fallback attempt
                }
              }
            }

            return null;
          };

          try {
            const safeRecorder = startSafeRecorder(activeStream);
            if (safeRecorder) {
              mediaRecorderRef.current = safeRecorder;
            } else {
              console.warn('[AssessmentWorkspace] Session video recording not supported in this browser context; continuing without recording.');
            }
          } catch (recErr) {
            console.warn('[AssessmentWorkspace] MediaRecorder setup skipped gracefully:', recErr);
          }
        }

        // Bind ended event listener to lock workspace when camera is disconnected physically
        if (isCameraEnabledInSettings && safeAssessment.securitySettings?.detectCameraDisabled !== false) {
          activeStream.getVideoTracks().forEach((track) => {
            track.onended = () => {
              setCameraActive(false);
              onLogProctoringEvent('CAMERA_DISABLED', { reason: 'Hardware/permission track ended', timestamp: new Date().toISOString() });
              // Automatically prompt browser permission dialog to re-enable camera access
              setCameraRetryCount((prev) => prev + 1);
            };
          });
        }

        const socket = socketRef.current || getOrCreateSessionSocket(session.id);
        socketRef.current = socket;

        socket.on('assessment_auto_submitted', (data: any) => {
          if (
            data &&
            (data.sessionId === session.id ||
              (data.assessmentId === safeAssessment.id && data.candidateId === session.candidateId))
          ) {
            setInfoToast({
              message: 'Your test has been automatically submitted.',
              type: 'warning',
            });
            syncAllCodeAndFinish('Auto Submit (Assessment Closed)');
          }
        });

        // 1. Connect socket & WebRTC publisher for live faculty monitoring if enabled
        const isLiveMonitoringEnabled = safeAssessment.securitySettings?.liveFacultyMonitoring !== false && isCameraEnabledInSettings;
        if (isLiveMonitoringEnabled) {
          const publisher = new CandidateWebRTCPublisher(socket, safeAssessment.id, session.id, session.candidateId);
          publisherRef.current = publisher;
          publisher.start(activeStream);

          // Start live frame broadcaster to guarantee stream visibility
          startFrameBroadcaster();
        }

        // 2. Start local computer vision frame detector for proctoring events if camera enabled
        if (isCameraEnabledInSettings) {
          const detector = new LocalProctorDetector({
            sessionId: session.id,
            assessmentId: safeAssessment.id,
            candidateId: session.candidateId,
            candidateName: session.candidateName,
            securitySettings: safeAssessment.securitySettings,
            onEventDetected: (event) => {
              if (event.type === 'MULTIPLE_FACES') {
                if (safeAssessment.securitySettings?.detectMultipleFaces !== false) {
                  onLogProctoringEvent('MULTIPLE_FACES', event.metadata || { message: 'Multiple people detected in camera feed' });
                  registerProctoringWarning(
                    'MULTIPLE_FACES',
                    '👥 Multiple People Detected: More than one face was detected in camera view. The assessment requires you to be alone.'
                  );
                }
              } else if (event.type === 'PHONE_DETECTED') {
                if (event.metadata?.conditionState === 'STARTED' || !event.metadata?.conditionState) {
                  onLogProctoringEvent('PHONE_DETECTED', event.metadata);
                  registerProctoringWarning(
                    'PHONE_DETECTED',
                    '📱 Mobile Device Alert: A potential mobile device was detected in frame. Please keep your workspace and hands clear of smartphones.'
                  );
                }
              } else if (event.type === 'CAMERA_OBSTRUCTED') {
                if (safeAssessment.securitySettings?.detectCameraObstruction !== false) {
                  registerProctoringWarning(
                    'CAMERA_OBSTRUCTED',
                    '📷 Camera Obstructed: The camera feed is obstructed or too dark. Ensure good lighting.'
                  );
                }
              } else if (event.type === 'VIDEO_FROZEN') {
                if (safeAssessment.securitySettings?.detectVideoFreeze !== false) {
                  registerProctoringWarning(
                    'VIDEO_FROZEN',
                    '❄️ Video Frozen: The camera feed appears frozen or looped.'
                  );
                }
              } else if (event.type === 'CAMERA_DISABLED') {
                setCameraActive(false);
                if (safeAssessment.securitySettings?.detectCameraDisabled !== false) {
                  registerProctoringWarning(
                    'CAMERA_DISABLED',
                    '🚫 Camera Disabled: The camera connection appears offline or was disabled.'
                  );
                  setCameraRetryCount((prev) => (prev >= 3 ? prev : prev + 1));
                }
              } else if (event.type === 'NO_FACE') {
                if (safeAssessment.securitySettings?.detectNoFace !== false) {
                  registerProctoringWarning(
                    'NO_FACE',
                    '👤 No Face Detected: Your face is not visible in the camera frame. Please keep your face centered.'
                  );
                }
              }
            },
            onEventResolved: () => {},
            onFrameAnalyzed: (telemetry) => {
              setProctorTelemetry(telemetry);
            },
          });
          detectorRef.current = detector;
          detector.start(activeStream);
        }
      } catch (err) {
        console.warn('Physical camera stream initialization unavailable or permission denied:', err);
        if (isCameraEnabledInSettings && safeAssessment.securitySettings?.detectCameraDisabled !== false) {
          setCameraActive(false);
          setWarningMessage('Camera Alert: The camera connection appears offline or permission was denied. Please check your camera permissions.');
        }
      }
    }

    initCameraAndProctoring();
    const isScreenRecordingEnabled = (assessment.securitySettings as any)?.recordScreenRecording !== false;
    const isScreenStreamActive = Boolean(
      propScreenStream &&
      propScreenStream.getVideoTracks().some((t) => t.readyState === 'live')
    );

    if (isScreenStreamActive && propScreenStream) {
      attachAndStartScreenStream(propScreenStream, false);
    } else if (isScreenRecordingEnabled && !screenStreamRef.current) {
      setShowScreenSharePromptModal(true);
    }

    const handlePageHide = () => {
      notifySessionDisconnection('PAGE_HIDE');
    };

    const handleBeforeUnload = () => {
      notifySessionDisconnection('BEFORE_UNLOAD');
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [propMediaStream, propScreenStream, cameraRetryCount]);

  // Handlers for clearing false warning alerts and rolling back strikes
  const handleClearFalseWarnings = () => {
    setMultiPersonDuration(0);
    setIsMultiPersonMalpractice(false);
    if (detectorRef.current) {
      detectorRef.current.suppressPhoneDetection(90000);
      detectorRef.current.suppressMultiplePersons(90000);
    }
    setProctorTelemetry((prev) =>
      prev
        ? {
            ...prev,
            phoneDetected: false,
            phoneBox: undefined,
            faceCount: 1,
            faceBoxes: prev.faceBox ? [prev.faceBox] : undefined,
          }
        : null
    );

    // Roll back the latest strike if one was recorded
    const decremented = Math.max(0, warningsCountRef.current - 1);
    warningsCountRef.current = decremented;
    setWarningsCount(decremented);
    setWarningsHistory((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));

    setWarningMessage(null);
    setInfoToast({
      message: '✅ Warning strike cleared as false alarm. Sensor detection paused for 90s.',
      type: 'success',
    });
    onLogProctoringEvent('FALSE_ALARM_CLEARED', {
      message: 'Candidate dismissed proctoring warning / false alarm; strike rolled back and detection paused for 90s',
      warningsCount: decremented,
      timestamp: new Date().toISOString(),
    });
    saveAttemptToFirestore({
      ...session,
      id: session.id,
      attemptId: session.id,
      warningsCount: decremented,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('candidate_warning', {
        assessmentId: safeAssessment.id,
        sessionId: session.id,
        candidateId: session.candidateId,
        warningsCount: decremented,
        warningType: 'FALSE_ALARM_CLEARED',
        message: 'Warning strike rolled back as false alarm',
      });
    }
  };

  // Process questions list based on individual attempt's questionOrder, equal marks, and candidate randomization
  const [candidateQuestions] = useState<Question[]>(() => {
    return getCandidateAssignedQuestions(safeAssessment, session);
  });

  const fallbackQuestion: Question = {
    id: 'default-q',
    type: 'CODING',
    title: 'Assessment Question',
    problemStatement: 'No problem statement available.',
    difficulty: 'EASY',
    points: 10,
    pointsPerHiddenTestCase: 5,
    testCases: [],
    sampleTestCases: [],
    tags: ['General'],
  };

  const [currentQIndex, setCurrentQIndex] = useState<number>(() => {
    if (session.currentQuestionIndex !== undefined) return session.currentQuestionIndex;
    if (session.currentQuestion !== undefined) return session.currentQuestion;
    return 0;
  });
  const currentQIndexRef = useRef<number>(currentQIndex);
  useEffect(() => {
    currentQIndexRef.current = currentQIndex;
  }, [currentQIndex]);

  useEffect(() => {
    setAssessmentActiveState(true);
    return () => {
      setAssessmentActiveState(false);
    };
  }, []);

  const currentQuestion: Question = candidateQuestions[currentQIndex] || candidateQuestions[0] || fallbackQuestion;

  // Editor states (strictly loaded from student's individual attempt)
  const configuredLanguages = (safeAssessment.allowedLanguages || [])
    .map((language: string) => language.toLowerCase() === 'c++' ? 'cpp' : language.toLowerCase())
    .filter((language: string): language is typeof SUPPORTED_LANGUAGES[number] =>
      SUPPORTED_LANGUAGES.includes(language as typeof SUPPORTED_LANGUAGES[number])
    );
  const defaultLang = configuredLanguages[0] || 'python';
  const [languageMap, setLanguageMap] = useState<Record<string, string>>(() => {
    return session.languageMap || {};
  });
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const firstQId = candidateQuestions[0]?.id;
    if (firstQId && session.languageMap?.[firstQId]) {
      return session.languageMap[firstQId];
    }
    return defaultLang;
  });

  // Track submitted languages per question
  const submittedLanguageMapRef = useRef<Record<string, string>>({
    ...(session.languageMap || {}),
  });

  // Dynamic language synchronization: switch selected language to this specific question's chosen language
  useEffect(() => {
    if (currentQuestion?.id) {
      const qLang = languageMap[currentQuestion.id] || session.languageMap?.[currentQuestion.id] || defaultLang;
      setSelectedLanguage(qLang);
    }
  }, [currentQIndex, currentQuestion?.id]);

  const [codeMap, setCodeMap] = useState<Record<string, string>>(() => {
    return session.selectedAnswers || session.codeMap || {};
  });

  // Tracks ONLY officially submitted code per question (synced strictly on code submission, not every keystroke)
  const submittedCodeMapRef = useRef<Record<string, string>>({
    ...(session.codeMap || {}),
    ...((session.selectedAnswers as any) || {}),
  });
  const [fontSize, setFontSize] = useState<number>(studentSettings?.fontSize || 14);
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>(
    (studentSettings?.editorTheme as any) || 'vs-dark'
  );

  // Sync editor settings if studentSettings change
  useEffect(() => {
    if (studentSettings?.fontSize) {
      setFontSize(studentSettings.fontSize);
    }
    if (studentSettings?.editorTheme) {
      setEditorTheme(studentSettings.editorTheme as 'vs-dark' | 'light');
    }
  }, [studentSettings?.fontSize, studentSettings?.editorTheme]);

  // Custom Input & Single Execution states
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>('');
  const [customResult, setCustomResult] = useState<SingleExecutionResult | null>(null);
  const [isCustomRunning, setIsCustomRunning] = useState<boolean>(false);

  // Initialize customInput on question change
  useEffect(() => {
    const defaultInput = currentQuestion?.sampleTestCases?.[0]?.input
      || currentQuestion?.testCases?.[0]?.input
      || '';
    setCustomInput(defaultInput);
    setCustomResult(null);
  }, [currentQuestion?.id]);

  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    if (currentQuestion?.id) {
      setLanguageMap((prev) => ({ ...prev, [currentQuestion.id]: newLang }));
      // Load starter code for the new language if enabled, or reset editor code
      const langKey = newLang.toLowerCase();
      let initialCode = '';
      if (currentQuestion.enableStarterCode && currentQuestion.functionSignature?.[langKey]) {
        initialCode = currentQuestion.functionSignature[langKey];
      }
      setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: initialCode }));
    }
    setCustomResult(null);
  };

  // Monaco Editor Ref
  const editorRef = useRef<any>(null);

  // Execution & Status states
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runResultMap, setRunResultMap] = useState<Record<string, CodeExecutionResult | null>>({});
  const [activeTab, setActiveTab] = useState<'TESTS' | 'OUTPUT'>('TESTS');
  const [tcFilter, setTcFilter] = useState<'ALL' | 'PASSED' | 'FAILED'>('ALL');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Active run result for the currently selected question
  const runResult = runResultMap[currentQuestion.id] || null;

  const updateRunResult = (questionId: string, result: CodeExecutionResult | null) => {
    setRunResultMap((prev) => ({ ...prev, [questionId]: result }));
  };

  // Submission Statuses per question (strictly loaded from student's individual attempt)
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatusItem>>(() => {
    return session.questionStatuses || {};
  });

  // Submit Assessment Modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Pause Assessment State
  const isFacultyPaused = safeAssessment.status === 'PAUSED';
  const [isCandidatePaused, setIsCandidatePaused] = useState<boolean>(() => {
    return session.state === 'PAUSED' || session.isPaused || false;
  });
  const [showPauseConfirmModal, setShowPauseConfirmModal] = useState<boolean>(false);
  const [isResuming, setIsResuming] = useState<boolean>(false);
  const isPaused = isCandidatePaused || isFacultyPaused;

  // Handler for candidate pausing the test session
  const handlePauseAssessment = async () => {
    setIsCandidatePaused(true);
    setShowPauseConfirmModal(false);
    cleanupAssessmentResources();

    const nowIso = new Date().toISOString();
    try {
      fetch(`/api/sessions/${encodeURIComponent(session.id)}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'TEST_PAUSED', endedAt: nowIso }),
      }).catch(() => {});

      const payload = JSON.stringify({
        status: 'ENDED',
        streamStatus: 'OFFLINE',
        isActive: false,
        isLive: false,
        endedAt: nowIso,
        cameraActive: false,
        screenActive: false,
        connectionStatus: 'DISCONNECTED',
        state: 'ENDED',
        event: {
          type: 'ASSESSMENT_PAUSED',
          description: 'Candidate paused the assessment session. Live session ended.',
          severity: 'INFO',
        },
      });

      fetch(`/api/monitoring/${encodeURIComponent(session.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});

      if (socketRef.current) {
        socketRef.current.emit('candidate_session_ended', {
          assessmentId: safeAssessment.id,
          sessionId: session.id,
          reason: 'TEST_PAUSED',
        });
      }

      await saveAttemptToFirestore({
        ...session,
        id: session.id,
        attemptId: session.id,
        state: 'ENDED',
        status: 'ENDED',
        isActive: false,
        isLive: false,
        isPaused: true,
        endedAt: nowIso,
        pausedAt: nowIso,
        cameraActive: false,
        screenActive: false,
        connectionStatus: 'DISCONNECTED',
        timer: timeLeftSec,
        timeLeftSec: timeLeftSec,
        selectedAnswers: submittedCodeMapRef.current,
        codeMap: submittedCodeMapRef.current,
        updatedAt: nowIso,
      });
    } catch (err) {
      console.warn('Failed to save paused state:', err);
    }
  };

  // Handler for resuming the assessment session
  const handleResumeAssessment = async () => {
    setIsResuming(true);
    try {
      const isCameraEnabled = safeAssessment.securitySettings?.enableCamera !== false;
      const isMicEnabled = safeAssessment.securitySettings?.enableMicrophone !== false;

      let newStream: MediaStream | null = null;
      if (isCameraEnabled || isMicEnabled) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: isCameraEnabled ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } : false,
            audio: isMicEnabled,
          });
          mediaStreamRef.current = newStream;
          setCameraActive(isCameraEnabled);
          setMicActive(isMicEnabled);

          if (!socketRef.current) {
            socketRef.current = getOrCreateSessionSocket(session.id);
          }
          const publisher = new CandidateWebRTCPublisher(
            socketRef.current,
            safeAssessment.id,
            session.id,
            session.candidateId || 'candidate'
          );
          publisherRef.current = publisher;
          publisher.start(newStream);
        } catch (camErr) {
          console.warn('Webcam stream re-acquisition warning on resume:', camErr);
        }
      }

      const isScreenRequired = (safeAssessment.securitySettings as any)?.recordScreenRecording !== false;
      if (isScreenRequired) {
        try {
          const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          screenStreamRef.current = sStream;
          setIsScreenRecordingActive(true);
        } catch (screenErr) {
          console.warn('Screen share cancelled on resume:', screenErr);
        }
      }

      const payload = JSON.stringify({
        status: 'LIVE',
        streamStatus: 'LIVE',
        isLive: true,
        cameraActive: isCameraEnabled,
        screenActive: true,
        connectionStatus: 'CONNECTED',
        state: 'ACTIVE',
        event: {
          type: 'ASSESSMENT_RESUMED',
          description: 'Candidate resumed the assessment session.',
          severity: 'INFO',
        },
      });

      fetch(`/api/monitoring/${encodeURIComponent(session.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});

      await saveAttemptToFirestore({
        ...session,
        id: session.id,
        attemptId: session.id,
        state: 'ACTIVE',
        isLive: true,
        isPaused: false,
        resumedAt: new Date().toISOString(),
        cameraActive: isCameraEnabled,
        screenActive: true,
        connectionStatus: 'CONNECTED',
        updatedAt: new Date().toISOString(),
      });

      setIsCandidatePaused(false);
    } finally {
      setIsResuming(false);
    }
  };

  // Timer state (strictly individual to this student's attempt start time and remaining duration)
  const [timeLeftSec, setTimeLeftSec] = useState<number>(() => {
    const totalSec = (safeAssessment.durationMinutes || 60) * 60;
    const startStr = session.startedAt || session.startTime;
    if (startStr) {
      const startMs = new Date(startStr).getTime();
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const remaining = Math.max(0, totalSec - elapsedSec);
      if (session.timeLeftSec !== undefined || session.timer !== undefined) {
        const savedTime = session.timeLeftSec !== undefined ? session.timeLeftSec : session.timer!;
        return Math.min(savedTime, remaining);
      }
      return remaining;
    }
    return session.timeLeftSec !== undefined ? session.timeLeftSec : (session.timer !== undefined ? session.timer : totalSec);
  });

  // Warnings & Fullscreen state management
  const maxAllowedWarnings = assessment?.securitySettings?.maxWarnings || 5;
  const [warningsCount, setWarningsCount] = useState<number>(session.warningsCount || 0);
  const warningsCountRef = useRef<number>(session.warningsCount || 0);
  const [warningsHistory, setWarningsHistory] = useState<{ type: string; message: string; timestamp: string }[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState<boolean>(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [showWarningsHistoryModal, setShowWarningsHistoryModal] = useState<boolean>(false);
  const [showProctorTestModal, setShowProctorTestModal] = useState<boolean>(false);
  const [infoToast, setInfoToast] = useState<{ message: string; type?: 'info' | 'warning' | 'success' } | null>(null);
  const [fullscreenGraceSec, setFullscreenGraceSec] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTED');
  const serverTimeOffsetRef = useRef<number>(0);
  const testEndTimeStr =
    session.testEndTime ||
    session.test_end_time ||
    (session.startedAt
      ? new Date(new Date(session.startedAt).getTime() + (safeAssessment.durationMinutes || 60) * 60 * 1000).toISOString()
      : new Date(Date.now() + (safeAssessment.durationMinutes || 60) * 60 * 1000).toISOString());
  const testEndTimeRef = useRef<string>(testEndTimeStr);
  const timeLeftSecRef = useRef<number>(timeLeftSec);
  useEffect(() => {
    timeLeftSecRef.current = timeLeftSec;
  }, [timeLeftSec]);

  // Synchronize server time offset on mount
  useEffect(() => {
    fetch('/api/server-time')
      .then((res) => res.json())
      .then((data) => {
        if (data?.serverTime) {
          const sTime = typeof data.serverTime === 'number' ? data.serverTime : new Date(data.serverTime).getTime();
          serverTimeOffsetRef.current = sTime - Date.now();
          console.log(`[AssessmentWorkspace] Server time synchronized. Offset: ${serverTimeOffsetRef.current}ms`);
        }
      })
      .catch((err) => {
        console.warn('[AssessmentWorkspace] Server time fetch fallback:', err);
      });
  }, []);

  // Dedicated WebSocket session connection lifecycle (one connection per active session)
  useEffect(() => {
    const socket = getOrCreateSessionSocket(session.id);
    socketRef.current = socket;

    const handleConnect = () => {
      console.log(`[WebSocket] Connected for session ${session.id}`);
      setConnectionStatus('CONNECTED');
    };

    const handleDisconnect = (reason: string) => {
      console.warn(`[WebSocket] Disconnected for session ${session.id} (${reason}). Test session remains ACTIVE.`);
      setConnectionStatus('RECONNECTING');
    };

    const handleConnectError = (error: any) => {
      console.warn(`[WebSocket] Connection error for session ${session.id}:`, error?.message || error);
      setConnectionStatus('RECONNECTING');
    };

    const handleReconnect = () => {
      console.log(`[WebSocket] Reconnected for session ${session.id}`);
      setConnectionStatus('CONNECTED');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io?.on('reconnect', handleReconnect);

    if (socket.connected) {
      setConnectionStatus('CONNECTED');
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io?.off('reconnect', handleReconnect);
      // NOTE: Do not close socket here so it survives normal component re-renders
    };
  }, [session.id]);

  // Sync ref with session changes (both increments and faculty resets)
  useEffect(() => {
    if (session.warningsCount !== undefined) {
      if (session.warningsCount > warningsCountRef.current || session.warningsCount === 0) {
        warningsCountRef.current = session.warningsCount;
        setWarningsCount(session.warningsCount);
      }
    }
  }, [session.warningsCount]);

  // Debouncing ref to eliminate duplicate warning strike increments from rapid event loops
  const lastWarningTimesRef = useRef<Map<string, number>>(new Map());
  const lastGlobalWarningTimeRef = useRef<number>(0);

  // Auto-dismiss info toast after 3.5s
  useEffect(() => {
    if (!infoToast) return;
    const timer = setTimeout(() => {
      setInfoToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [infoToast]);

  // Fullscreen exit grace countdown: gives candidate 10s to return to fullscreen before recording a strike
  useEffect(() => {
    if (fullscreenGraceSec === null) return;
    if (fullscreenGraceSec <= 0) {
      setFullscreenGraceSec(null);
      registerProctoringWarning(
        'FULLSCREEN_EXIT',
        'Exited Fullscreen mode. Exiting fullscreen violates test integrity and counts as a warning.'
      );
      return;
    }

    const timer = setTimeout(() => {
      setFullscreenGraceSec((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [fullscreenGraceSec]);

  // Auto-sync individual attempt progress into attempts/{attemptId} in the background
  // NOTE: Code is synced strictly when submitted, not for every letter typed!
  useEffect(() => {
    if (assessmentEndedRef.current) return;
    const saveTimer = setTimeout(() => {
      saveAttemptToFirestore({
        ...session,
        id: session.id,
        attemptId: session.id,
        studentId: session.candidateId || session.studentId || 'candidate',
        studentName: session.candidateName,
        studentEmail: session.candidateEmail,
        studentRegisterNo: session.candidateRegisterNo,
        assessmentId: safeAssessment.id,
        assessmentTitle: safeAssessment.title,
        attemptNumber: session.attemptNumber || 1,
        currentQuestion: currentQIndex,
        currentQuestionIndex: currentQIndex,
        questionOrder: candidateQuestions.map((q) => q.id),
        selectedAnswers: submittedCodeMapRef.current,
        codeMap: submittedCodeMapRef.current,
        timer: timeLeftSec,
        timeLeftSec: timeLeftSec,
        submissionStatus: 'ACTIVE',
        state: 'ACTIVE',
        questionStatuses: questionStatuses,
        warningsCount: warningsCount,
        flags: session.proctoringEvents || [],
        proctoringEvents: session.proctoringEvents || [],
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }, 5000);

    return () => clearTimeout(saveTimer);
  }, [currentQIndex, questionStatuses, warningsCount]);

  // Multi-person presence tracking: if two or more people are detected for > 10s => Malpractice!
  // Otherwise, only show warning message in upper side of website.
  const [multiPersonDuration, setMultiPersonDuration] = useState<number>(0);
  const [isMultiPersonMalpractice, setIsMultiPersonMalpractice] = useState<boolean>(false);

  const isMultiPersonActive = Boolean(
    safeAssessment.securitySettings?.enableCamera !== false &&
    safeAssessment.securitySettings?.detectMultipleFaces !== false &&
    proctorTelemetry?.faceCount && proctorTelemetry.faceCount >= 2
  );

  // Multi-person presence timer: if two persons are detected for more than 10 seconds => malpractice!
  useEffect(() => {
    if (isAutoSubmitting || isMultiPersonMalpractice || assessmentEndedRef.current) return;

    if (!isMultiPersonActive) {
      if (multiPersonDuration > 0 && multiPersonDuration < 10) {
        setMultiPersonDuration(0);
      }
      return;
    }

    const timer = setInterval(() => {
      setMultiPersonDuration((prev) => {
        const next = Math.round((prev + 0.5) * 10) / 10;
        if (next >= 10 && !isMultiPersonMalpractice) {
          clearInterval(timer);
          triggerMultiPersonMalpractice();
          return 10;
        }
        return next;
      });
    }, 500);

    return () => clearInterval(timer);
  }, [isMultiPersonActive, isAutoSubmitting, isMultiPersonMalpractice]);

  const triggerMultiPersonMalpractice = () => {
    if (safeAssessment.securitySettings?.detectMultipleFacesAsWarning === true) {
      registerProctoringWarning(
        'MULTIPLE_FACES',
        '👥 Multiple People Detected: Continuous multi-person presence detected in camera view.'
      );
      setMultiPersonDuration(0);
      return;
    }

    setIsMultiPersonMalpractice(true);
    setIsAutoSubmitting(true);
    warningsCountRef.current = maxAllowedWarnings;
    setWarningsCount(maxAllowedWarnings);
    onLogProctoringEvent('MALPRACTICE', {
      type: 'MULTIPLE_PERSONS_MALPRACTICE',
      reason: 'Multiple persons detected in camera frame for more than 10 seconds',
      durationSec: 10,
      warningsCount: maxAllowedWarnings,
      isWarningStrike: true,
      timestamp: new Date().toISOString(),
    });
    onLogProctoringEvent('MULTIPLE_FACES', {
      malpractice: true,
      durationSec: 10,
      message: 'Continuous multi-person presence exceeded 10-second threshold',
      warningsCount: maxAllowedWarnings,
      isWarningStrike: true,
    });

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('candidate_warning', {
        assessmentId: safeAssessment.id,
        sessionId: session.id,
        candidateId: session.candidateId,
        warningsCount: maxAllowedWarnings,
        warningType: 'MULTIPLE_PERSONS_MALPRACTICE',
        message: 'Multiple persons detected in camera frame > 10s',
      });
    }

    if (safeAssessment.securitySettings?.autoSubmitOnWarningThreshold !== false) {
      setWarningMessage(
        `🚨 CRITICAL INTEGRITY VIOLATION: Continuous multi-person presence detected in camera view for more than 10 seconds. The assessment session has ended and is submitting automatically.`
      );
      setTimeout(() => {
        syncAllCodeAndFinish('Malpractice Termination (Multiple Persons)');
      }, 2500);
    } else {
      setWarningMessage(
        `🚨 CRITICAL INTEGRITY VIOLATION: Continuous multi-person presence detected in camera view for more than 10 seconds. Flagged for faculty proctor review.`
      );
    }
  };

  // State for immediate termination on Alt+Tab or Tab Switch
  const [isImmediateTabSwitchExit, setIsImmediateTabSwitchExit] = useState<boolean>(false);
  const [immediateExitReason, setImmediateExitReason] = useState<string>('');

  // Immediate termination handler for Tab Switch / Alt+Tab
  const triggerImmediateTabSwitchExit = (reason: string) => {
    // If Tab Switch detection is turned OFF, do NOT detect, log, or exit
    if (assessment.securitySettings.detectTabSwitch === false) return;

    if (isAutoSubmitting || isImmediateTabSwitchExit || assessmentEndedRef.current) return;
    setIsImmediateTabSwitchExit(true);
    setIsAutoSubmitting(true);
    setImmediateExitReason(reason);
    const finalCount = Math.max(warningsCountRef.current, maxAllowedWarnings);
    warningsCountRef.current = finalCount;
    setWarningsCount(finalCount);

    onLogProctoringEvent('MALPRACTICE', {
      type: 'TAB_SWITCH_IMMEDIATE_TERMINATION',
      reason,
      warningsCount: finalCount,
      isWarningStrike: true,
      timestamp: new Date().toISOString(),
    });
    onLogProctoringEvent('TAB_SWITCH', {
      immediateTermination: true,
      message: `Test terminated immediately: ${reason}`,
      warningsCount: finalCount,
      isWarningStrike: true,
      timestamp: new Date().toISOString(),
    });

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('candidate_warning', {
        assessmentId: safeAssessment.id,
        sessionId: session.id,
        candidateId: session.candidateId,
        warningsCount: finalCount,
        warningType: 'TAB_SWITCH_IMMEDIATE_TERMINATION',
        message: reason,
      });
    }

    setTimeout(() => {
      syncAllCodeAndFinish(`Malpractice: Immediate Exit due to ${reason}`);
    }, 1800);
  };

  // Request native fullscreen mode
  const requestFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
      hasEnteredFullscreenRef.current = true;
    } catch (err) {
      console.warn('Fullscreen API request failed or was restricted by iframe permissions, enabling full-window reading mode:', err);
      // Ensure candidate is never blocked from reading assessment questions
      setIsFullscreen(true);
      hasEnteredFullscreenRef.current = true;
    }
  };

  // Manual / Testing triggers for proctoring verification
  const handleSimulateFullscreenExit = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    } catch {}
    setIsFullscreen(false);
    registerProctoringWarning(
      'FULLSCREEN_EXIT',
      'Exited Fullscreen mode. Exiting fullscreen violates assessment integrity.'
    );
  };

  const handleSimulateTabSwitch = () => {
    registerProctoringWarning(
      'TAB_SWITCH',
      'Browser Tab Switch / Window Focus Lost detected (Simulated / Test).'
    );
  };

  const handleSimulateNoFace = () => {
    detectorRef.current?.simulateNoFace(true);
    registerProctoringWarning(
      'NO_FACE',
      '👤 No Candidate Face Detected in camera view (Simulated / Test).'
    );
    setTimeout(() => {
      detectorRef.current?.simulateNoFace(false);
    }, 4000);
  };

  const handleSimulateMultipleFaces = () => {
    detectorRef.current?.simulateMultipleFaces(true);
    registerProctoringWarning(
      'MULTIPLE_FACES',
      '👥 Multiple People Detected in camera feed (Simulated / Test).'
    );
    setTimeout(() => {
      detectorRef.current?.simulateMultipleFaces(false);
    }, 4000);
  };

  const handleSimulatePhone = () => {
    detectorRef.current?.simulatePhone(true);
    registerProctoringWarning(
      'PHONE_DETECTED',
      '📱 Mobile Phone / Smartphone detected in frame (Simulated / Test).'
    );
    setTimeout(() => {
      detectorRef.current?.simulatePhone(false);
    }, 4000);
  };

  const handleResetWarnings = () => {
    warningsCountRef.current = 0;
    setWarningsCount(0);
    setWarningMessage(null);
    detectorRef.current?.resetAllSimulations();
    saveAttemptToFirestore({
      ...session,
      id: session.id,
      attemptId: session.id,
      warningsCount: 0,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    setInfoToast({ message: 'Warnings count reset to 0 for proctoring verification.', type: 'success' });
  };

  // Register proctoring warning event and trigger auto-submit if count reaches threshold (5)
  const registerProctoringWarning = (type: string, message: string) => {
    if (assessmentEndedRef.current || isAutoSubmitting) return;

    // Suppress warnings during initial warmup/setup (1.5 seconds only) or while screen-share prompt is open
    if (Date.now() - mountTimeRef.current < 1500) return;
    if (isRequestingScreenShare || showScreenSharePromptModal) return;

    const now = Date.now();
    const lastTime = lastWarningTimesRef.current.get(type) || 0;

    // Minimum 3.5-second debounce for same warning type to prevent duplicate strikes from one incident
    if (now - lastTime < 3500) {
      return;
    }

    // Minimum 1.2-second global debounce across any warning strikes to avoid cascading strikes
    if (now - lastGlobalWarningTimeRef.current < 1200) {
      return;
    }

    lastWarningTimesRef.current.set(type, now);
    lastGlobalWarningTimeRef.current = now;

    const nextCount = warningsCountRef.current + 1;
    warningsCountRef.current = nextCount;
    setWarningsCount(nextCount);

    const timeStr = new Date().toLocaleTimeString();
    setWarningsHistory((prev) => [...prev, { type, message, timestamp: timeStr }]);

    // Persist proctoring event with explicit warning strike and exact count
    onLogProctoringEvent(type, {
      message,
      timestamp: new Date().toISOString(),
      warningsCount: nextCount,
      isWarningStrike: true,
    });

    // Save to Firestore attempt immediately
    saveAttemptToFirestore({
      ...session,
      id: session.id,
      attemptId: session.id,
      warningsCount: nextCount,
      timer: timeLeftSec,
      timeLeftSec: timeLeftSec,
      isActive: true,
      isLive: true,
      connectionStatus: 'CONNECTED',
      state: 'ACTIVE',
      submissionStatus: 'ACTIVE',
      updatedAt: new Date().toISOString(),
    }).catch(() => {});

    // Broadcast warning update over socket to server & faculty
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('candidate_warning', {
        assessmentId: safeAssessment.id,
        sessionId: session.id,
        candidateId: session.candidateId,
        warningsCount: nextCount,
        warningType: type,
        message,
      });
    }

    if (nextCount >= maxAllowedWarnings) {
      const autoSubmit = safeAssessment.securitySettings?.autoSubmitOnWarningThreshold !== false;
      if (autoSubmit) {
        setIsAutoSubmitting(true);
        setWarningMessage(`🚨 CRITICAL PROCTORING VIOLATION (Warning ${nextCount}/${maxAllowedWarnings}): ${message}. Maximum warning limit reached! The assessment is exiting and being automatically submitted.`);
        
        // Auto-exit & submit code immediately
        setTimeout(() => {
          syncAllCodeAndFinish('Auto Submit (Warnings Exceeded)');
        }, 2200);
      } else {
        setWarningMessage(`🚨 Warning limit reached (${nextCount}/${maxAllowedWarnings}): ${message}. Continued infractions will be reported directly to faculty proctors.`);
      }
    } else {
      setWarningMessage(`Warning ${nextCount} of ${maxAllowedWarnings}: ${message}. (Reaching ${maxAllowedWarnings} warnings ${safeAssessment.securitySettings?.autoSubmitOnWarningThreshold !== false ? 'will terminate and auto-submit your assessment' : 'will flag your attempt for faculty review'}).`);
    }
  };

  // Handle webcam camera face analysis feedback
  const handleFaceStatusChange = (status: 'OK' | 'NO_FACE' | 'MULTIPLE_FACES' | 'PHONE_DETECTED', message?: string) => {
    if (safeAssessment.securitySettings?.enableCamera === false) return;
    if (status === 'MULTIPLE_FACES' && safeAssessment.securitySettings?.detectMultipleFaces !== false) {
      onLogProctoringEvent('MULTIPLE_FACES', { message: message || 'Multiple people detected', timestamp: new Date().toISOString() });
      registerProctoringWarning('MULTIPLE_FACES', message || 'Multiple people detected in camera feed');
    } else if (status === 'PHONE_DETECTED') {
      registerProctoringWarning('PHONE_DETECTED', message || 'Mobile phone / smartphone detected in camera frame!');
    } else if (status === 'NO_FACE') {
      if (safeAssessment.securitySettings?.detectNoFace !== false) {
        registerProctoringWarning('NO_FACE', message || 'No candidate face detected in camera frame.');
      }
    }
  };

  // Safely acknowledge and close proctoring warning modal without penalizing the candidate
  const handleAcknowledgeWarning = () => {
    onLogProctoringEvent('WARNING_ACKNOWLEDGED', {
      message: 'Candidate acknowledged proctoring warning alert',
      timestamp: new Date().toISOString(),
    });
    setWarningMessage(null);
    if (!isFullscreen && assessment.securitySettings?.requireFullscreen) {
      requestFullscreen().catch(() => {});
    }
    if (editorRef.current) {
      try {
        editorRef.current.focus();
      } catch {}
    }
  };

  // Keyboard shortcut listener to acknowledge warning with Escape or Enter
  useEffect(() => {
    if (!warningMessage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        handleAcknowledgeWarning();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [warningMessage, isFullscreen]);

  // Handle Monaco Editor Mount
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    editor.focus();
  };

  // Focus editor when current question changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setPosition({ lineNumber: 1, column: 1 });
    }
  }, [currentQIndex]);

  // Helper to generate complete, runnable starter templates supporting Standard I/O
  const getStarterTemplate = (question: Question, lang: string): string => {
    const langKey = lang.toLowerCase();

    if (question.functionSignature && question.functionSignature[langKey]) {
      return question.functionSignature[langKey];
    }

    switch (langKey) {
      case 'python':
      case 'py':
        return `a = int(input())

# Write your logic here

print(a)`;

      case 'cpp':
      case 'c++':
      case 'c':
        return `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;

    cout << a + b;

    return 0;
}`;

      case 'java':
        return `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        int a = sc.nextInt();
        int b = sc.nextInt();

        System.out.println(a + b);
    }
}`;

      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
        return `const fs = require("fs");

const input = fs.readFileSync(0, "utf8").trim().split(/\\s+/);

const a = Number(input[0]);
const b = Number(input[1]);

console.log(a + b);`;

      case 'go':
        return `package main

import "fmt"

func main() {
    var a, b int
    fmt.Scan(&a, &b)

    fmt.Println(a + b)
}`;

      case 'rust':
        return `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();

    let values: Vec<i32> = input
        .split_whitespace()
        .map(|x| x.parse().unwrap())
        .collect();

    let a = values[0];
    let b = values[1];

    println!("{}", a + b);
}`;

      default:
        return `a = int(input())\n\nprint(a)`;
    }
  };

  // Initialize candidate code editor: empty string by default unless starter code is explicitly enabled
  useEffect(() => {
    if (currentQuestion) {
      if (codeMap[currentQuestion.id] === undefined) {
        const qLang = languageMap[currentQuestion.id] || selectedLanguage || defaultLang;
        const langKey = qLang.toLowerCase();
        let initialCode = '';
        if (currentQuestion.enableStarterCode && currentQuestion.functionSignature?.[langKey]) {
          initialCode = currentQuestion.functionSignature[langKey];
        }
        setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: initialCode }));
      }
    }
  }, [currentQIndex, selectedLanguage, currentQuestion?.id]);

  // Helper to sync all code in codeMap before finishing assessment
  const syncAllCodeAndFinish = async (reason?: string) => {
    if (assessmentEndedRef.current && isSubmitting) return;
    assessmentEndedRef.current = true;
    setIsSubmitting(true);
    let videoUrl: string | undefined;

    const mergedCodeMap: Record<string, string> = {
      ...submittedCodeMapRef.current,
    };
    const mergedLanguageMap: Record<string, string> = {
      ...languageMap,
      ...submittedLanguageMapRef.current,
    };

    // 1. Compile camera recording with 1.2s timeout guard
    try {
      const videoPromise = stopRecordingAndGetUrl();
      const timeoutPromise = new Promise<string | undefined>((res) => setTimeout(() => res(undefined), 1200));
      videoUrl = await Promise.race([videoPromise, timeoutPromise]);
    } catch (err) {
      console.warn('Error compiling video recording on finish:', err);
    }

    // 2. Finalize screen recording session with 800ms timeout guard
    try {
      const finalizePromise = finalizeScreenRecordingSession();
      const timeoutPromise = new Promise<void>((res) => setTimeout(() => res(), 800));
      await Promise.race([finalizePromise, timeoutPromise]);
    } catch (err) {
      console.warn('Error finalizing screen recording on finish:', err);
    }

    // 3. Guaranteed instant completion of assessment with code map & language map
    try {
      cleanupAssessmentResources();
      closeSessionSocket(session.id);
      await onFinishAssessment(
        reason,
        videoUrl,
        warningsCountRef.current,
        mergedCodeMap,
        selectedLanguage,
        mergedLanguageMap
      );
    } catch (finishErr) {
      console.error('Error during onFinishAssessment:', finishErr);
      try {
        await onFinishAssessment(
          reason || 'Submitted (Recovered)',
          videoUrl,
          warningsCountRef.current,
          mergedCodeMap,
          selectedLanguage,
          mergedLanguageMap
        );
      } catch (fallbackErr) {
        console.error('Fallback onFinishAssessment error:', fallbackErr);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Countdown timer effect - ONLY displays remaining time calculated from server test_end_time
  useEffect(() => {
    if (isPaused) return;

    const tick = () => {
      const endMs = new Date(testEndTimeRef.current).getTime();
      const currentServerTime = Date.now() + serverTimeOffsetRef.current;
      const remaining = Math.max(0, Math.floor((endMs - currentServerTime) / 1000));
      setTimeLeftSec(remaining);
      timeLeftSecRef.current = remaining;

      // The display may reach 00:00 slightly early because it is floored. Only
      // request finalization once the synchronized server clock reaches the deadline.
      if (remaining === 0 && currentServerTime >= endMs && !assessmentEndedRef.current) {
        console.log('[AssessmentWorkspace] Server test end time reached. Requesting finalization.');
        syncAllCodeAndFinish('Time Expired');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const isHeartbeatInFlightRef = useRef(false);
  const consecutiveHeartbeatFailuresRef = useRef(0);

  // Candidate Heartbeat effect: Pings server watchdog every 12s via HTTP and Socket.IO
  // Heartbeat is used to synchronize server time, remaining seconds, and verify expiration.
  // Concurrency lock: strictly 1 in-flight heartbeat at a time.
  // On network drop: exponential backoff without resetting timer or ending test.
  useEffect(() => {
    if (isPaused || isSubmitting) return;

    let heartbeatTimeoutTimer: any = null;

    const pingHeartbeat = async () => {
      if (isHeartbeatInFlightRef.current) return;
      isHeartbeatInFlightRef.current = true;

      const controller = new AbortController();
      const abortTimer = setTimeout(() => {
        try { controller.abort(); } catch {}
      }, 9000);

      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            assessmentId: safeAssessment.id,
            candidateId: session.candidateId,
            timeLeftSec: timeLeftSecRef.current,
            currentQuestionIndex: currentQIndexRef.current,
            warningsCount: warningsCountRef.current,
          }),
        });
        clearTimeout(abortTimer);

        if (res.ok) {
          consecutiveHeartbeatFailuresRef.current = 0;
          const payload = await res.json().catch(() => null);
          const data = payload?.data || payload;
          if (data?.serverTime) {
            const sTime = typeof data.serverTime === 'number' ? data.serverTime : new Date(data.serverTime).getTime();
            serverTimeOffsetRef.current = sTime - Date.now();
          }
          const remainingSeconds = data?.remainingSec ?? data?.remaining_seconds;
          if (typeof remainingSeconds === 'number') {
            setTimeLeftSec(remainingSeconds);
            timeLeftSecRef.current = remainingSeconds;
          }
          // Server confirmed absolute test expiration!
          if (data?.isExpired === true && !assessmentEndedRef.current) {
            console.log('[AssessmentWorkspace] Server confirmed test expiration via heartbeat. Submitting...');
            syncAllCodeAndFinish('Time Expired');
          }
        } else {
          consecutiveHeartbeatFailuresRef.current++;
          console.warn(`[AssessmentWorkspace] Heartbeat non-ok status: ${res.status}. Test remains ACTIVE.`);
        }
      } catch (err: any) {
        clearTimeout(abortTimer);
        consecutiveHeartbeatFailuresRef.current++;
        // Temporary network issues or heartbeat failures must NOT end the test or reset the timer
        console.warn('[AssessmentWorkspace] Heartbeat ping failed (test remains ACTIVE):', err?.message || err);
      } finally {
        isHeartbeatInFlightRef.current = false;
      }

      if (socketRef.current && socketRef.current.connected) {
        try {
          socketRef.current.emit('candidate_heartbeat', {
            assessmentId: safeAssessment.id,
            sessionId: session.id,
            candidateId: session.candidateId,
            timeLeftSec: timeLeftSecRef.current,
            warningsCount: warningsCountRef.current,
          });
        } catch {}
      }
    };

    pingHeartbeat();
    const heartbeatInterval = setInterval(pingHeartbeat, 12000);
    return () => {
      clearInterval(heartbeatInterval);
      if (heartbeatTimeoutTimer) clearTimeout(heartbeatTimeoutTimer);
    };
  }, [isPaused, isSubmitting, session.id, safeAssessment.id, session.candidateId]);

  // Event Listeners for Proctoring
  useEffect(() => {
    // 1. Tab Switch / Visibility Change -> Count as warning strike
    const handleVisibilityChange = () => {
      if (isPaused || assessment.securitySettings.detectTabSwitch === false) return;
      if (Date.now() - mountTimeRef.current < 8000) return;
      if (isRequestingScreenShare || showScreenSharePromptModal) return;

      if (document.hidden) {
        registerProctoringWarning('TAB_SWITCH', 'Browser Tab Switch / Window Minimized detected.');
      }
    };

    // 2. Window Blur (Alt+Tab / clicking another app) -> Check sustained window focus loss
    const handleBlur = () => {
      if (isPaused) return;
      if (assessment.securitySettings.detectTabSwitch === false && (assessment.securitySettings as any).detectWindowBlur === false) return;
      if (Date.now() - mountTimeRef.current < 8000) return;
      if (isRequestingScreenShare || showScreenSharePromptModal) return;

      // Allow 3000ms grace for transient focus changes (such as system permission prompts)
      setTimeout(() => {
        if (Date.now() - mountTimeRef.current < 8000) return;
        if (isRequestingScreenShare || showScreenSharePromptModal) return;

        if (document.hidden) {
          registerProctoringWarning('TAB_SWITCH', 'Browser Tab Switch / Window Minimized detected.');
        } else if (!document.hasFocus() && (assessment.securitySettings as any).detectWindowBlur !== false) {
          registerProctoringWarning('WINDOW_BLUR', 'Application Switch / Test Window Lost Focus for more than 3 seconds.');
        }
      }, 3000);
    };

    // 3. Keydown trap: Alt+Tab, F12, DevTools shortcuts, Cut/Copy/Paste shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F12 / DevTools / Inspect
      if (
        e.key === 'F12' ||
        e.keyCode === 123 ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k'].includes(e.key)) ||
        ((e.ctrlKey || e.metaKey) && ['u', 'U', 's', 'S', 'p', 'P'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        onLogProctoringEvent('DEVTOOLS_ATTEMPT' as any, { questionId: currentQuestion.id });
        setInfoToast({
          message: 'F12 & Developer Tools shortcuts are disabled during the assessment.',
          type: 'warning',
        });
        return;
      }

      // Prevent Copy / Cut / Paste shortcuts (non-modal toast notification)
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'v', 'V', 'x', 'X'].includes(e.key)) {
        const action = e.key.toLowerCase() === 'c' ? 'Copy' : e.key.toLowerCase() === 'x' ? 'Cut' : 'Paste';
        const isRestricted =
          (action === 'Copy' && assessment.securitySettings?.detectCopy) ||
          (action === 'Cut' && assessment.securitySettings?.detectCut) ||
          (action === 'Paste' && assessment.securitySettings?.detectPaste);

        if (isRestricted) {
          e.preventDefault();
          e.stopPropagation();
          onLogProctoringEvent(`${action.toUpperCase()}_ATTEMPT` as any, { questionId: currentQuestion.id });
          setInfoToast({
            message: `Clipboard ${action} is disabled during the assessment.`,
            type: 'warning',
          });
        }
        return;
      }

      // Tab switch prevention
      if (assessment.securitySettings.detectTabSwitch !== false && Date.now() - mountTimeRef.current > 8000) {
        if (
          (e.altKey && (e.key === 'Tab' || e.code === 'Tab' || e.key === 'Escape')) ||
          (e.metaKey && (e.key === 'Tab' || e.code === 'Tab'))
        ) {
          e.preventDefault();
          e.stopPropagation();
          registerProctoringWarning('TAB_SWITCH', 'Alt+Tab Shortcut Pressed during assessment');
        }
      }
    };

    // 4. Exit Fullscreen -> Monitored only if required and previously entered
    const handleFullscreenChange = () => {
      const fsActive = !!document.fullscreenElement;
      setIsFullscreen(fsActive);

      if (fsActive) {
        hasEnteredFullscreenRef.current = true;
        setFullscreenGraceSec(null);
      } else {
        if (!assessment.securitySettings?.requireFullscreen) return;
        if (!hasEnteredFullscreenRef.current) return;
        if (Date.now() - mountTimeRef.current < 8000) return;
        if (isRequestingScreenShare || showScreenSharePromptModal) return;

        // Start 10-second grace countdown
        setFullscreenGraceSec(10);
      }
    };

    const handleCut = (e: ClipboardEvent) => {
      if (assessment.securitySettings?.detectCut) {
        e.preventDefault();
        e.stopPropagation();
        onLogProctoringEvent('CUT' as any, { questionId: currentQuestion.id });
        setInfoToast({ message: 'Cut action is disabled during the assessment.', type: 'warning' });
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (assessment.securitySettings?.detectCopy) {
        e.preventDefault();
        e.stopPropagation();
        onLogProctoringEvent('COPY', { questionId: currentQuestion.id });
        setInfoToast({ message: 'Copy action is disabled during the assessment.', type: 'warning' });
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (assessment.securitySettings?.detectPaste) {
        e.preventDefault();
        e.stopPropagation();
        onLogProctoringEvent('PASTE', { questionId: currentQuestion.id });
        setInfoToast({ message: 'Paste action is disabled during the assessment.', type: 'warning' });
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onLogProctoringEvent('RIGHT_CLICK', { questionId: currentQuestion.id });
    };

    // Initial fullscreen check
    setIsFullscreen(!!document.fullscreenElement);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [currentQuestion.id, isAutoSubmitting, isImmediateTabSwitchExit]);

  const currentLang = languageMap[currentQuestion.id] || selectedLanguage;
  const currentLangKey = currentLang.toLowerCase();
  const currentCode = codeMap[currentQuestion.id] !== undefined
    ? codeMap[currentQuestion.id]
    : (currentQuestion.enableStarterCode && (currentQuestion.functionSignature?.[currentLangKey] || currentQuestion.functionSignature?.[currentLang])
        ? (currentQuestion.functionSignature[currentLangKey] || currentQuestion.functionSignature[currentLang])
        : '');

  const handleCodeChange = (val: string | undefined) => {
    setCodeMap((prev) => ({ ...prev, [currentQuestion.id]: val || '' }));
  };

  const handleRunCustomCode = async () => {
    setIsCustomRunning(true);
    setRunResultMap((prev) => ({ ...prev, [currentQuestion.id]: null }));
    try {
      const inputToUse = showCustomInput
        ? customInput
        : (currentQuestion.sampleTestCases?.[0]?.input || currentQuestion.testCases?.[0]?.input || '');

      const sampleOutput = showCustomInput
        ? (currentQuestion.sampleTestCases?.find((stc) => stc.input.trim() === inputToUse.trim())?.output ||
           currentQuestion.testCases?.find((tc) => tc.input.trim() === inputToUse.trim())?.expectedOutput)
        : (currentQuestion.sampleTestCases?.[0]?.output || currentQuestion.testCases?.[0]?.expectedOutput);

      const activeQuesLang = languageMap[currentQuestion.id] || selectedLanguage;
      const res = await executeCustomInput(activeQuesLang, currentCode, inputToUse, sampleOutput);
      setCustomResult(res);
    } catch (err: any) {
      setCustomResult({
        status: 'Runtime Error',
        input: showCustomInput ? customInput : '',
        yourOutput: '',
        executionTimeMs: 0,
        error: err.message || 'Execution error',
      });
    } finally {
      setIsCustomRunning(false);
    }
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setCustomResult(null);
    setActiveTab('TESTS');
    updateRunResult(currentQuestion.id, null); // Clear old results immediately on re-run
    try {
      const allCases = (function resolveCases(q: Question) {
        if (q.testCases && q.testCases.length > 0) {
          const hasHidden = q.testCases.some((tc) => tc.isPublic === false);
          if (hasHidden) {
            return q.testCases;
          }
          if (q.hiddenTestCases && q.hiddenTestCases.length > 0) {
            const hidden = q.hiddenTestCases.map((htc, i) => ({
              id: `tc-hidden-${i}`,
              input: htc.input,
              expectedOutput: htc.output,
              isPublic: false,
            }));
            return [...q.testCases, ...hidden];
          }
          return q.testCases;
        }
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
        return [...sampleCases, ...hiddenCases];
      })(currentQuestion);

      const activeQuesLang = languageMap[currentQuestion.id] || selectedLanguage;
      const res = await executeCodeInSandbox(
        activeQuesLang,
        currentCode,
        allCases
      );
      updateRunResult(currentQuestion.id, res);
      setTcFilter('ALL');
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err: any) {
      updateRunResult(currentQuestion.id, {
        status: 'Runtime Error',
        stderr: err.message,
        testCasesPassed: 0,
        totalTestCases: currentQuestion.testCases?.length || 0,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmitSolution = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    updateRunResult(currentQuestion.id, null); // Clear old results on submission
    try {
      const activeQuesLang = languageMap[currentQuestion.id] || selectedLanguage;
      const res = await onSubmitQuestion(currentQuestion.id, activeQuesLang, currentCode);
      updateRunResult(currentQuestion.id, res);
      setActiveTab('TESTS');
      setTcFilter('ALL');
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);

      // Check if test cases passed or status is Accepted
      const testResults = res.testCaseResults || [];
      const passedCount = res.testCasesPassed ?? (testResults.length > 0 ? testResults.filter((tc: any) => tc.passed).length : 0);
      const totalCount = res.totalTestCases || (testResults.length > 0 ? testResults.length : 1);
      const isAccepted = passedCount === totalCount && totalCount > 0;

      const statusLabel: QuestionStatusItem['status'] = isAccepted
        ? 'Accepted'
        : (res.status === 'Compilation Error' ? 'Compilation Error' : (res.status === 'Runtime Error' ? 'Runtime Error' : 'Wrong Answer'));

      const qMax = assessment.isEqualMarks
        ? (Number(assessment.marksPerQuestion) || Number(currentQuestion.points) || 10)
        : (Number(currentQuestion.points) || 10);

      // Score: Authoritative from backend response if present, otherwise calculateQuestionScore
      const computedScore = (res.score !== undefined && res.score !== null)
        ? Number(res.score)
        : (res.marks !== undefined && res.marks !== null)
        ? Number(res.marks)
        : calculateQuestionScore({ passedTestCases: passedCount, totalTestCases: totalCount, maxMarks: qMax });

      // Sync code & language ONLY when code was submitted (not on every letter typed)
      submittedCodeMapRef.current[currentQuestion.id] = currentCode;
      submittedLanguageMapRef.current[currentQuestion.id] = activeQuesLang;

      const updatedStatuses: Record<string, QuestionStatusItem> = {
        ...questionStatuses,
        [currentQuestion.id]: {
          status: statusLabel,
          score: computedScore,
          testCasesPassed: res.testCasesPassed ?? (isAccepted ? (res.totalTestCases || 1) : 0),
          totalTestCases: res.totalTestCases ?? 1,
          selectedLanguage: activeQuesLang,
          language: activeQuesLang,
        },
      };

      setQuestionStatuses(updatedStatuses);

      const currentTotalScore = Object.values(updatedStatuses).reduce((acc: number, qs: any) => acc + (qs.score || 0), 0);
      const totalMaxScore = assessment.isEqualMarks && assessment.marksPerQuestion
        ? (candidateQuestions.length * Number(assessment.marksPerQuestion))
        : (candidateQuestions.reduce((a, b) => a + (b.points || 10), 0) || assessment.totalPoints || 100);

      const updatedLangMap = { ...languageMap, [currentQuestion.id]: activeQuesLang };
      setLanguageMap(updatedLangMap);

      // Persist submitted code, evaluated scores, per-question language map and statuses to attempt while explicitly KEEPING live feed active!
      saveAttemptToFirestore({
        ...session,
        id: session.id,
        attemptId: session.id,
        selectedAnswers: { ...submittedCodeMapRef.current },
        codeMap: { ...submittedCodeMapRef.current },
        languageMap: updatedLangMap,
        selectedLanguage: activeQuesLang,
        questionStatuses: updatedStatuses,
        score: currentTotalScore,
        totalPoints: totalMaxScore,
        timer: timeLeftSec,
        timeLeftSec: timeLeftSec,
        isActive: true,
        isLive: true,
        connectionStatus: 'CONNECTED',
        state: 'ACTIVE',
        submissionStatus: 'ACTIVE',
        cameraActive: cameraActive,
        screenActive: Boolean(screenStreamRef.current) || isScreenRecordingActive,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    } catch (err: any) {
      updateRunResult(currentQuestion.id, {
        status: 'Runtime Error',
        stderr: err.message,
        testCasesPassed: 0,
        totalTestCases: currentQuestion.testCases?.length || 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Count answered questions
  const answeredCount = Object.keys(questionStatuses).filter(
    (key) => questionStatuses[key] && questionStatuses[key].status !== 'Unattempted'
  ).length;

  if (candidateQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-8 space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">No Questions Available</h2>
            <p className="text-sm text-amber-300 font-medium">
              ⚠️ This assessment currently has no questions. Please contact your faculty.
            </p>
            <p className="text-xs text-slate-400">
              Your individual attempt has been registered. Questions have not been attached to this assessment yet.
            </p>
          </div>
          <button
            onClick={() => onFinishAssessment('NO_QUESTIONS_AVAILABLE')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none relative">
      {/* FLOATING NON-INTRUSIVE NOTIFICATION TOAST */}
      {infoToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none">
          <div
            className={`px-4 py-2 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 border ${
              infoToast.type === 'warning'
                ? 'bg-amber-950/95 text-amber-200 border-amber-500/50 shadow-amber-950/50'
                : infoToast.type === 'success'
                ? 'bg-emerald-950/95 text-emerald-200 border-emerald-500/50 shadow-emerald-950/50'
                : 'bg-slate-900/95 text-slate-200 border-slate-700 shadow-slate-950/50'
            }`}
          >
            <Info className="w-4 h-4 shrink-0" />
            <span>{infoToast.message}</span>
          </div>
        </div>
      )}

      {/* FULLSCREEN EXIT GRACE BANNER */}
      {fullscreenGraceSec !== null && fullscreenGraceSec > 0 && (
        <div className="bg-gradient-to-r from-rose-950 via-amber-950 to-rose-950 border-b-2 border-rose-500 text-white px-4 py-2.5 shadow-2xl relative z-50 shrink-0 animate-in fade-in duration-200">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shrink-0 text-rose-400 animate-pulse">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-rose-600 text-white font-mono shadow">
                  Fullscreen Required ({fullscreenGraceSec}s)
                </span>
                <p className="text-xs text-slate-200 mt-0.5">
                  You have exited fullscreen. Return to fullscreen within {fullscreenGraceSec}s to avoid a security warning strike.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestFullscreen}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow cursor-pointer self-end sm:self-center"
            >
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* UPPER SIDE WARNING MESSAGE: MULTIPLE PERSONS DETECTED */}
      {isMultiPersonActive && !isMultiPersonMalpractice && (
        <div
          id="upper-side-multi-person-warning"
          className="bg-gradient-to-r from-amber-950 via-rose-950 to-amber-950 border-b-2 border-rose-500 text-white px-4 py-2.5 shadow-2xl relative z-40 shrink-0 animate-in fade-in slide-in-from-top duration-200"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shrink-0 text-rose-400 animate-pulse">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-1">
                  <span className="text-[11px] font-black tracking-wide uppercase px-2 py-0.5 rounded bg-rose-600 text-white font-mono shadow">
                    ⚠️ Security Warning: Multiple People Detected
                  </span>
                </div>
                <p className="text-xs text-slate-200 mt-0.5 leading-snug">
                  Another person has been detected in your camera frame. Please ensure you are alone in your testing environment.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN SHARING INTERRUPTED WARNING BANNER */}
      {screenShareInterrupted && (
        <div
          id="screen-share-interrupted-banner"
          className="bg-gradient-to-r from-amber-950 via-rose-950 to-amber-950 border-b-2 border-amber-500 text-white px-4 py-2.5 shadow-2xl relative z-40 shrink-0"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0 text-amber-400 animate-pulse">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-600 text-white font-mono shadow">
                  Screen Sharing Interrupted
                </span>
                <p className="text-xs text-slate-200 mt-0.5">
                  Desktop screen capture stopped. Faculty continuous monitoring & chunked cloud recording are paused. Re-share immediately to remain compliant.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStartScreenRecording}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-share Screen Now</span>
            </button>
          </div>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <span className="text-xs font-bold text-white tracking-wide truncate max-w-xs">
            {safeAssessment.title || 'Assessment'}
          </span>
          <div className="flex items-center space-x-1.5">
            {(() => {
              const allowFreeNav = (safeAssessment as any).questionNavigation ?? true;
              return candidateQuestions.map((q, idx) => {
                const qStatus = questionStatuses[q.id]?.status;
                const isAccepted = qStatus === 'Accepted';
                const isFailed = qStatus === 'Wrong Answer' || qStatus === 'Runtime Error' || qStatus === 'Compilation Error';
                const isDisabled = !allowFreeNav && idx < currentQIndex; // Unchecked => Enforces strictly sequential question progression

                const qLang = languageMap[q.id] || questionStatuses[q.id]?.selectedLanguage || questionStatuses[q.id]?.language;

                return (
                  <button
                    key={q.id}
                    onClick={() => !isDisabled && setCurrentQIndex(idx)}
                    disabled={isDisabled}
                    title={isDisabled ? 'Sequential navigation active: Backwards navigation is disabled.' : (qLang ? `Q${idx + 1} (${qLang})` : undefined)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition flex items-center space-x-1 ${
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-600 border border-slate-800'
                        : currentQIndex === idx
                        ? 'bg-indigo-600 text-white ring-1 ring-indigo-400 cursor-pointer'
                        : isAccepted
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer'
                        : isFailed
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 cursor-pointer'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <span>Q{idx + 1}</span>
                    {qLang && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-950/60 font-sans uppercase text-slate-300">
                        {qLang === 'javascript' ? 'JS' : qLang === 'python' ? 'PY' : qLang.toUpperCase()}
                      </span>
                    )}
                    {isAccepted && <Check className="w-3 h-3 text-emerald-400" />}
                    {isFailed && <XCircle className="w-3 h-3 text-rose-400" />}
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* Center: Live Timer & Status Indicators */}
        <div className="flex items-center space-x-3">
          {/* Active Camera / Mic / Connection Indicators */}
          <div className="hidden md:flex items-center space-x-2 text-[11px] font-medium font-mono">
            {assessment.securitySettings?.enableCamera === false ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                <span>Camera: Disabled</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                <span className={cameraActive ? 'text-slate-300' : 'text-rose-400 font-bold'}>
                  {cameraActive ? 'Camera ● Active' : '⚠ Camera disconnected'}
                </span>
              </span>
            )}

            {assessment.securitySettings?.enableMicrophone === false ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                <span>Mic: Disabled</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                <span className={`w-2 h-2 rounded-full ${micActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                <span className={micActive ? 'text-slate-300' : 'text-rose-400 font-bold'}>
                  {micActive ? 'Microphone ● Active' : '⚠ Microphone disconnected'}
                </span>
              </span>
            )}

            {isScreenRecordingActive ? (
              <span className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>🖥 Screen: Streaming & Recording</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleStartScreenRecording}
                className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 hover:bg-amber-900 transition cursor-pointer"
                title="Click to start sharing your screen"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span>⚠ Screen: Disconnected (Click to Share)</span>
              </button>
            )}

            {connectionStatus === 'CONNECTED' ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Connection ● Stable</span>
              </span>
            ) : connectionStatus === 'RECONNECTING' ? (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-amber-800 text-amber-300 animate-pulse">
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-400">Reconnecting... (Active)</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-rose-800 text-rose-300">
                <Wifi className="w-3 h-3 text-rose-400" />
                <span className="text-rose-400">Offline (Active)</span>
              </span>
            )}

            {/* Warning Counter Status Pill */}
            <button
              type="button"
              onClick={() => setShowWarningsHistoryModal(true)}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono font-bold transition cursor-pointer ${
                warningsCount >= 3
                  ? 'bg-rose-950/80 border-rose-500/60 text-rose-300 hover:bg-rose-900'
                  : warningsCount > 0
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 hover:bg-amber-900'
                  : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900'
              }`}
              title="View Proctoring Warnings Audit Log"
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${warningsCount > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
              <span>Warnings: {warningsCount}/{maxAllowedWarnings}</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950 px-3.5 py-1 rounded-lg border border-slate-800 font-mono text-xs font-bold text-emerald-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTime(timeLeftSec)}</span>
          </div>
        </div>

        {/* Right: PAUSE, TEST PROCTORING & SUBMIT TEST BUTTONS */}
        <div className="flex items-center space-x-2.5">
          {/* Proctoring Test & Diagnostics Button */}
          <button
            type="button"
            onClick={() => setShowProctorTestModal((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-xs flex items-center space-x-1.5 transition border border-indigo-500/40 cursor-pointer shadow-xs"
            title="Test Proctoring Detections (No Face, 2+ People, Phone, Tab Switch)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
            <span>Test Proctoring</span>
          </button>

          {/* Pause Test Button (if allowed by assessment security settings) */}
          {safeAssessment.securitySettings?.allowPause !== false && (
            <button
              type="button"
              onClick={() => setShowPauseConfirmModal(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-xs flex items-center space-x-1.5 transition border border-amber-500/30 cursor-pointer shadow-xs"
              title="Pause Assessment (Suspends camera/screen proctors and freezes timer)"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              <span>Pause Test</span>
            </button>
          )}

          {/* Global SUBMIT TEST BUTTON */}
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-lg shadow-emerald-600/20 border border-emerald-500/30 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Submit Test</span>
          </button>
        </div>
      </header>

      {/* STANDARD PROGRAMMING EXAM WORKSPACE BODY */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: QUESTION DETAILS (5 cols) */}
        <div className="col-span-5 border-r border-slate-800 bg-slate-900/50 p-5 overflow-y-auto space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-indigo-400 font-bold px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                {currentQuestion.difficulty} • {currentQuestion.points} Points
              </span>

              {questionStatuses[currentQuestion.id]?.status === 'Accepted' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accepted
                </span>
              )}
            </div>

            <span className="text-[11px] text-slate-400 font-mono">
              Question {currentQIndex + 1} of {candidateQuestions.length}
            </span>
          </div>

          <h1 className="text-lg font-bold text-white leading-tight">{currentQuestion.title}</h1>

          {/* Problem Statement */}
          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Problem Statement</h3>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
              {currentQuestion.problemStatement}
            </p>
          </div>

          {/* Input Format */}
          {currentQuestion.inputFormat && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Input Format</h3>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
                {currentQuestion.inputFormat}
              </p>
            </div>
          )}

          {/* Output Format */}
          {currentQuestion.outputFormat && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Output Format</h3>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans">
                {currentQuestion.outputFormat}
              </p>
            </div>
          )}

          {/* Constraints */}
          {currentQuestion.constraints && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Constraints</h3>
              <div className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 whitespace-pre-line">
                {currentQuestion.constraints}
              </div>
            </div>
          )}

          {/* Sample Test Cases */}
          {((currentQuestion.sampleTestCases && currentQuestion.sampleTestCases.length > 0) ||
            (currentQuestion.testCases && currentQuestion.testCases.filter((tc) => tc.isPublic).length > 0)) && (
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Sample Test Cases</h3>
              {(currentQuestion.sampleTestCases ||
                currentQuestion.testCases
                  ?.filter((tc) => tc.isPublic)
                  .map((tc) => ({ input: tc.input, output: tc.expectedOutput, explanation: tc.explanation })) ||
                []
              ).map((stc, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/60 pb-1.5">
                    <span className="font-bold text-indigo-400">Sample Case {idx + 1}</span>
                    <button
                      onClick={() => {
                        setCustomInput(stc.input);
                        setShowCustomInput(true);
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1 font-sans font-semibold"
                    >
                      Use as Custom Input
                    </button>
                  </div>

                  <div>
                    <span className="text-slate-500 font-sans block text-[11px] font-semibold">Sample Input:</span>
                    <div className="text-slate-200 bg-slate-900 p-2 rounded border border-slate-800/80 whitespace-pre-wrap mt-0.5">
                      {stc.input}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 font-sans block text-[11px] font-semibold">Sample Output:</span>
                    <div className="text-emerald-400 bg-slate-900 p-2 rounded border border-slate-800/80 whitespace-pre-wrap mt-0.5">
                      {stc.output}
                    </div>
                  </div>

                  {stc.explanation && (
                    <div className="pt-1">
                      <span className="text-slate-500 font-sans block text-[11px] font-semibold">Explanation:</span>
                      <p className="text-[11px] text-slate-400 font-sans italic leading-relaxed mt-0.5">
                        {stc.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Explanation if standalone */}
          {currentQuestion.explanation && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Explanation</h3>
              <p className="text-xs text-slate-300 leading-relaxed font-sans italic">
                {currentQuestion.explanation}
              </p>
            </div>
          )}


        </div>

        {/* RIGHT PANEL: CODE EDITOR & CUSTOM INPUT & RESULTS (7 cols) */}
        <div className="col-span-7 bg-slate-950 flex flex-col overflow-hidden">
          {/* Editor Header Controls */}
          <div className="h-11 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-400 font-semibold">Language:</span>
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-indigo-400 font-bold focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.filter((lang) =>
                  configuredLanguages.length === 0 || configuredLanguages.includes(lang)
                ).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === 'cpp' ? 'C++' : lang === 'javascript' ? 'JavaScript' : lang.toUpperCase()}
                  </option>
                ))}
              </select>

              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline-block">
                Standard Input / Output Execution
              </span>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => handleCodeChange('')}
                className="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition flex items-center gap-1 font-semibold text-[11px]"
                title="Clear Code"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Editor</span>
              </button>
            </div>
          </div>

          {/* Monaco Code Editor */}
          <div className="flex-1 min-h-[220px] relative cursor-text border-b border-slate-800">
            <Editor
              height="100%"
              language={selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage}
              theme={editorTheme}
              value={currentCode}
              onChange={handleCodeChange}
              onMount={handleEditorDidMount}
              options={{
                fontSize: fontSize,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: studentSettings?.tabSize || 4,
                wordWrap: studentSettings?.wordWrap ? 'on' : 'off',
                lineNumbers: studentSettings?.showLineNumbers === false ? 'off' : 'on',
                quickSuggestions: studentSettings?.enableAutocomplete ?? true,
                fontFamily: 'JetBrains Mono, monospace',
                cursorStyle: 'line',
                cursorBlinking: 'smooth',
                renderLineHighlight: 'all',
                selectionHighlight: true,
                contextmenu: false,
              }}
            />
          </div>

          {/* BOTTOM SECTION: CUSTOM INPUT & ACTION BUTTONS & EXECUTION RESULT */}
          <div className="p-4 bg-slate-900/60 border-t border-slate-800 space-y-4 max-h-[360px] overflow-y-auto shrink-0">
            {/* Custom Input Checkbox & Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCustomInput}
                    onChange={(e) => setShowCustomInput(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer accent-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Custom Input</span>
                  </span>
                </label>

                {showCustomInput && (
                  <button
                    onClick={() => setCustomInput('')}
                    className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer transition"
                  >
                    Clear Input
                  </button>
                )}
              </div>

              {/* Show input field ONLY if checkbox is selected */}
              {showCustomInput && (
                <div className="space-y-1.5 animate-fadeIn pt-1">
                  <textarea
                    rows={3}
                    placeholder="Enter custom standard input values here..."
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                  />
                </div>
              )}
            </div>

            {/* Action Buttons Bar */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={showCustomInput ? handleRunCustomCode : handleRunCode}
                disabled={isCustomRunning || isRunning}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center space-x-2 transition border border-slate-700 cursor-pointer shadow-md"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                <span>{isCustomRunning || isRunning ? 'Executing...' : 'Run Code'}</span>
              </button>

              <button
                onClick={handleSubmitSolution}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Evaluating Test Cases...' : 'Submit Answer'}</span>
              </button>
            </div>

            {/* Execution Result Box (Custom Input Run or Submission) */}
            {customResult && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-sans font-bold text-slate-400 text-xs">Execution Result:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        customResult.status === 'Passed'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : customResult.status === 'Wrong Answer'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {customResult.status}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    Execution Time: {((customResult.executionTimeMs || 10) / 1000).toFixed(2)}s
                  </span>
                </div>

                {/* Compiler / Runtime error message */}
                {customResult.error && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px] whitespace-pre-wrap leading-relaxed">
                    <span className="font-bold block text-rose-400 mb-1">Error Output:</span>
                    {customResult.error}
                  </div>
                )}

                {/* Outputs comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-500 font-sans block text-[10px] font-semibold mb-0.5">Your Output:</span>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-slate-200 whitespace-pre-wrap font-mono min-h-[38px]">
                      {customResult.yourOutput || '(no output)'}
                    </div>
                  </div>

                  {customResult.expectedOutput && (
                    <div>
                      <span className="text-slate-500 font-sans block text-[10px] font-semibold mb-0.5">Expected Output:</span>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-emerald-400 whitespace-pre-wrap font-mono min-h-[38px]">
                        {customResult.expectedOutput}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submission Test Cases Result Box */}
            {runResult && (() => {
              const resolvedAllTestCases = (runResult.testCaseResults && runResult.testCaseResults.length > 0)
                ? runResult.testCaseResults
                : (function getFallbackCases() {
                    const sampleCases = (currentQuestion.sampleTestCases || []).map((stc, i) => ({
                      id: `tc-sample-${i}`,
                      input: stc.input,
                      expectedOutput: stc.output,
                      actualOutput: runResult.status === 'Accepted' || (runResult.testCasesPassed ?? 0) > i ? stc.output : (runResult.stderr || ''),
                      passed: runResult.status === 'Accepted' || (runResult.testCasesPassed ?? 0) > i,
                      isPublic: true,
                      error: (runResult.status !== 'Accepted' && (runResult.testCasesPassed ?? 0) <= i) ? (runResult.stderr || 'Output mismatch') : undefined,
                    }));
                    const hiddenCases = (currentQuestion.hiddenTestCases || []).map((htc, i) => ({
                      id: `tc-hidden-${i}`,
                      input: '[Concealed]',
                      expectedOutput: '[Concealed]',
                      actualOutput: '[Concealed]',
                      passed: runResult.status === 'Accepted' || (runResult.testCasesPassed ?? 0) > (sampleCases.length + i),
                      isPublic: false,
                    }));
                    if (sampleCases.length === 0 && hiddenCases.length === 0 && currentQuestion.testCases) {
                      return currentQuestion.testCases.map((tc, i) => ({
                        id: tc.id || `tc-${i}`,
                        input: tc.isPublic ? tc.input : '[Concealed]',
                        expectedOutput: tc.isPublic ? tc.expectedOutput : '[Concealed]',
                        actualOutput: tc.isPublic ? (runResult.status === 'Accepted' ? tc.expectedOutput : '') : '[Concealed]',
                        passed: runResult.status === 'Accepted' || (runResult.testCasesPassed ?? 0) > i,
                        isPublic: tc.isPublic ?? true,
                      }));
                    }
                    return [...sampleCases, ...hiddenCases];
                  })();

              const totalCount = resolvedAllTestCases.length || (runResult.totalTestCases || 1);
              const passedCount = resolvedAllTestCases.filter(tc => tc.passed).length;
              const failedCount = totalCount - passedCount;
              const isAccepted = passedCount === totalCount && totalCount > 0;

              const filteredCases = resolvedAllTestCases.filter(tc => {
                if (tcFilter === 'PASSED') return tc.passed;
                if (tcFilter === 'FAILED') return !tc.passed;
                return true;
              });

              const maxMarks = assessment.isEqualMarks
                ? (Number(assessment.marksPerQuestion) || Number(currentQuestion.points) || 10)
                : (Number(currentQuestion.points) || 10);

              const currentMarks = questionStatuses[currentQuestion.id]?.score ?? (
                isAccepted
                  ? maxMarks
                  : calculateQuestionScore({ passedTestCases: passedCount, totalTestCases: totalCount, maxMarks })
              );

              return (
                <div ref={resultsRef} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 font-mono text-xs animate-fadeIn shadow-xl">
                  {/* OVERALL STATUS BANNER */}
                  <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isAccepted
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        isAccepted
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      }`}>
                        {isAccepted ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-black text-sm uppercase tracking-wide">
                            {isAccepted ? 'ACCEPTED (ALL TEST CASES PASSED)' : (runResult.status ? runResult.status.toUpperCase() : 'WRONG ANSWER')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                            isAccepted
                              ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                              : 'bg-rose-500/30 text-rose-200 border border-rose-400/40'
                          }`}>
                            {isAccepted ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                        <p className="text-xs font-sans text-slate-300 mt-0.5">
                          {isAccepted
                            ? `All ${passedCount} of ${totalCount} test cases evaluated successfully with matching outputs.`
                            : `${passedCount} of ${totalCount} test cases passed (${failedCount} failed). Review results below.`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 font-sans">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Marks Earned</span>
                        <span className={`font-mono text-sm font-bold ${isAccepted ? 'text-emerald-400' : 'text-amber-400'}`}>
                          Score: {currentMarks}/{maxMarks} pts ({passedCount}/{totalCount} test cases)
                        </span>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Execution Time</span>
                        <span className="font-mono text-xs font-bold text-slate-300">
                          {((runResult.executionTimeMs || 12) / 1000).toFixed(2)}s
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* COMPILATION / RUNTIME ERROR TRACE */}
                  {runResult.stderr && (
                    <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs whitespace-pre-wrap leading-relaxed">
                      <div className="flex items-center space-x-2 font-bold text-rose-400 mb-1 font-sans text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Compilation / Runtime Error Diagnostics:</span>
                      </div>
                      <div className="font-mono text-[11px] bg-slate-950/80 p-2.5 rounded-lg border border-rose-500/30 text-rose-300 mt-1">
                        {runResult.stderr}
                      </div>
                    </div>
                  )}

                  {/* FILTER CONTROLS BAR */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5 font-sans">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">
                        All Test Cases ({totalCount}):
                      </span>
                      <button
                        type="button"
                        onClick={() => setTcFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          tcFilter === 'ALL'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>All</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/60">{totalCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTcFilter('PASSED')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          tcFilter === 'PASSED'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-slate-800 text-emerald-400 hover:text-emerald-300'
                        }`}
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>Passed</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/60">{passedCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTcFilter('FAILED')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          tcFilter === 'FAILED'
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'bg-slate-800 text-rose-400 hover:text-rose-300'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        <span>Failed</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950/60">{failedCount}</span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      Showing {filteredCases.length} of {totalCount} cases
                    </span>
                  </div>

                  {/* TEST CASES LIST */}
                  <div className="space-y-3 pt-1">
                    {filteredCases.map((tc, idx) => {
                      const isPublic = tc.isPublic ?? true;
                      const globalIdx = resolvedAllTestCases.findIndex(c => (c.id && c.id === tc.id) || c === tc);
                      const displayIdx = globalIdx >= 0 ? globalIdx + 1 : idx + 1;

                      if (isPublic) {
                        return (
                          <div
                            key={tc.id || idx}
                            className={`p-3.5 rounded-xl border space-y-2.5 text-xs font-mono transition ${
                              tc.passed
                                ? 'bg-slate-900/90 border-emerald-500/40'
                                : 'bg-rose-950/20 border-rose-500/40'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[11px]">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-200 font-sans text-xs">
                                  Test Case {displayIdx} (Public / Sample)
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-sans">
                                  Public Case
                                </span>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded text-[11px] font-bold font-sans flex items-center gap-1.5 ${
                                  tc.passed
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                }`}
                              >
                                {tc.passed ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>ACCEPTED ✓ (Passed)</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>FAILED ✗ (Not Passed)</span>
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                              <div>
                                <span className="text-slate-400 font-sans block text-[10px] font-bold uppercase tracking-wider mb-1">
                                  Input:
                                </span>
                                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 font-mono text-[11px] whitespace-pre-wrap min-h-[38px]">
                                  {tc.input && tc.input !== '[Concealed]' ? tc.input : '(empty input)'}
                                </div>
                              </div>

                              <div>
                                <span className="text-slate-400 font-sans block text-[10px] font-bold uppercase tracking-wider mb-1">
                                  Expected Output:
                                </span>
                                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400 font-mono text-[11px] whitespace-pre-wrap min-h-[38px]">
                                  {tc.expectedOutput && tc.expectedOutput !== '[Concealed]' ? tc.expectedOutput : '(empty)'}
                                </div>
                              </div>

                              <div>
                                <span className="text-slate-400 font-sans block text-[10px] font-bold uppercase tracking-wider mb-1">
                                  Your Output:
                                </span>
                                <div className={`bg-slate-950 p-2.5 rounded-lg border font-mono text-[11px] whitespace-pre-wrap min-h-[38px] ${
                                  tc.passed
                                    ? 'border-emerald-500/30 text-emerald-300'
                                    : 'border-rose-500/30 text-rose-400'
                                }`}>
                                  {tc.actualOutput !== undefined && tc.actualOutput !== null && tc.actualOutput !== '' && tc.actualOutput !== '[Concealed]'
                                    ? tc.actualOutput
                                    : tc.error
                                    ? `Error: ${tc.error}`
                                    : '(no output)'}
                                </div>
                              </div>
                            </div>

                            {tc.error && (
                              <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-rose-300 text-[11px]">
                                <span className="font-bold">Error detail: </span>{tc.error}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div
                            key={tc.id || idx}
                            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono transition ${
                              tc.passed
                                ? 'bg-slate-900/90 border-emerald-500/40'
                                : 'bg-rose-950/20 border-rose-500/40'
                            }`}
                          >
                            <div className="space-y-1 font-sans">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-200 text-xs">
                                  Test Case {displayIdx} (Hidden)
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  🔒 Hidden Test Case
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                Evaluated on standard test suite. Inputs & expected outputs are concealed for academic integrity.
                              </p>
                            </div>

                            <span
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans self-start sm:self-auto flex items-center gap-1.5 shrink-0 ${
                                tc.passed
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {tc.passed ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>ACCEPTED ✓ (Passed)</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4" />
                                  <span>FAILED ✗ (Not Passed)</span>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* PAUSE ASSESSMENT CONFIRMATION MODAL */}
      {showPauseConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-5 text-left shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                <Pause className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Pause Assessment?</h3>
                <p className="text-xs text-slate-400">Suspend live monitoring and freeze your exam timer.</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-950 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
              <p>When paused:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                <li>All webcam broadcasts, screen sharing, and AI vision sensors will be temporarily stopped.</li>
                <li>Your remaining exam time ({formatTime(timeLeftSec)}) is frozen.</li>
                <li>Your written code and answered questions are safely saved.</li>
                <li>Live monitoring status will be marked as paused/suspended.</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowPauseConfirmModal(false)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePauseAssessment}
                className="py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 cursor-pointer transition flex items-center justify-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Confirm Pause</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSESSMENT PAUSED FULLSCREEN OVERLAY */}
      {isPaused && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-lg w-full space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <Pause className="w-8 h-8 fill-current" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                {isFacultyPaused ? 'Assessment Paused by Faculty' : 'Assessment Paused'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                {isFacultyPaused
                  ? 'The instructor has temporarily paused this examination. All camera feeds, screen sharing streams, and AI proctoring sensors have been suspended. The session will automatically resume when the instructor unpauses.'
                  : 'All video proctoring, screen sharing, and AI detection sensors are temporarily suspended. Your timer and answers are safely preserved.'}
              </p>
            </div>

            {/* Timer & Session State Display */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-around text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Remaining Time</span>
                <span className="font-mono font-bold text-base text-emerald-400">{formatTime(timeLeftSec)}</span>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Proctor Sensors</span>
                <span className="font-bold text-xs text-amber-400 flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Suspended
                </span>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Current Question</span>
                <span className="font-mono font-bold text-xs text-indigo-300">
                  Q{currentQIndex + 1} of {candidateQuestions.length}
                </span>
              </div>
            </div>

            {!isFacultyPaused ? (
              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  disabled={isResuming}
                  onClick={handleResumeAssessment}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center space-x-2 transition shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50"
                >
                  {isResuming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Restoring Session & Sensors...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Resume Assessment</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-500">
                  Resuming will reconnect your camera and screen streams to verify test integrity.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 animate-spin shrink-0" />
                <span>Waiting for instructor to resume the assessment...</span>
              </div>
            )}
          </div>
        </div>
      )}



      {/* SUBMIT ASSESSMENT CONFIRMATION MODAL */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-5 text-left shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Submit Entire Assessment?</h3>
                <p className="text-xs text-slate-400">Review your question summary before finalizing.</p>
              </div>
            </div>

            {/* Summary Breakdown */}
            <div className="space-y-2 max-h-48 overflow-y-auto p-3 rounded-xl bg-slate-950 border border-slate-800">
              {candidateQuestions.map((q, idx) => {
                const qStat = questionStatuses[q.id]?.status;
                const isAccepted = qStat === 'Accepted';
                const isSubmitted = qStat && qStat !== 'Unattempted';

                const qLang = languageMap[q.id] || questionStatuses[q.id]?.selectedLanguage || questionStatuses[q.id]?.language;

                return (
                  <div key={q.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-none">
                    <span className="text-slate-300 font-medium truncate max-w-[200px]">
                      Q{idx + 1}. {q?.title || 'Question'}
                    </span>
                    <div className="flex items-center gap-2">
                      {qLang && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-indigo-300 border border-slate-700 uppercase">
                          {qLang === 'javascript' ? 'JS' : qLang === 'python' ? 'PY' : qLang.toUpperCase()}
                        </span>
                      )}
                      {isAccepted ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Accepted
                        </span>
                      ) : isSubmitted ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {qStat}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-500">
                          Not Answered
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-400 bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-xl leading-relaxed">
              <strong>Note:</strong> Once submitted, your assessment session will end and your final score and proctoring telemetry will be submitted.
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
              >
                Return to Test
              </button>
              <button
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitModalOpen(false);
                  await syncAllCodeAndFinish('Manual Submit');
                }}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 cursor-pointer transition flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Syncing Code...' : 'Confirm & Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LOCK ENFORCER OVERLAY */}
      {!isFullscreen && assessment.securitySettings.requireFullscreen && !isAutoSubmitting && !isImmediateTabSwitchExit && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-6 animate-in fade-in duration-200">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center shadow-2xl animate-pulse">
            <Maximize2 className="w-10 h-10" />
          </div>
          <div className="max-w-md space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs font-bold text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Fullscreen Exited — Warning Recorded</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Fullscreen Required to Take Assessment</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exiting full-screen mode is considered a security violation and counts as a warning strike. You cannot view questions, write code, or execute tests outside of full-screen mode.
            </p>
            <div className="pt-2 flex flex-col items-center space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Current Warnings: {warningsCount} / {maxAllowedWarnings}</span>
              </span>
              <p className="text-[11px] text-slate-400">
                Accumulating {maxAllowedWarnings} warnings will permanently terminate your assessment.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={async () => {
                setWarningMessage(null);
                await requestFullscreen();
                setIsFullscreen(true);
              }}
              className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xl shadow-indigo-600/30 transition transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Re-Enter Fullscreen Mode Now</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsFullscreen(true);
                hasEnteredFullscreenRef.current = true;
                setWarningMessage(null);
                onLogProctoringEvent('FULL_WINDOW_FALLBACK', {
                  message: 'Candidate activated full-window reading mode',
                  timestamp: new Date().toISOString(),
                });
              }}
              className="px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <span>Resume Full-Window Exam</span>
            </button>
          </div>
        </div>
      )}

      {/* FLOATING PROCTORING CAMERA & REAL-TIME PHONE DETECTION HUD */}
      {safeAssessment.securitySettings?.enableCamera !== false &&
        safeAssessment.securitySettings?.showCameraPreviewToStudent !== false &&
        showFloatingCamera &&
        studentSettings?.cameraPipPosition !== 'hidden' && (
          <div className={`fixed z-40 shadow-2xl animate-in fade-in duration-200 ${
            studentSettings?.cameraPipPosition === 'top-left'
              ? 'top-4 left-4 slide-in-from-top-3'
              : studentSettings?.cameraPipPosition === 'top-right'
              ? 'top-4 right-4 slide-in-from-top-3'
              : studentSettings?.cameraPipPosition === 'bottom-left'
              ? 'bottom-4 left-4 slide-in-from-bottom-3'
              : 'bottom-4 right-4 slide-in-from-bottom-3'
          }`}>
            <ProctorCamera
              stream={currentMediaStream}
              isCompact={true}
              telemetry={proctorTelemetry}
              multiPersonDuration={safeAssessment.securitySettings?.detectMultipleFaces !== false ? multiPersonDuration : 0}
              onFaceStatusChange={handleFaceStatusChange}
              onPhoneStatusChange={(detected) => {
                if (detected && safeAssessment.securitySettings?.enableCamera !== false) {
                  registerProctoringWarning(
                    'PHONE_DETECTED',
                    '📱 Mobile Phone Alert: A smartphone was detected in camera view. Please keep your workspace clear.'
                  );
                }
              }}
              onCameraStatusChange={(active) => {
                setCameraActive(active);
                if (!active && safeAssessment.securitySettings?.enableCamera !== false && safeAssessment.securitySettings?.detectCameraDisabled !== false) {
                  registerProctoringWarning('CAMERA_DISABLED', 'Camera connection offline or disabled.');
                }
              }}
            />
          </div>
        )}

      {/* CAMERA DISCONNECTED / REQUIRED OVERLAY */}
      {safeAssessment.securitySettings?.enableCamera !== false &&
        safeAssessment.securitySettings?.detectCameraDisabled !== false &&
        !cameraActive &&
        !isAutoSubmitting &&
        !isImmediateTabSwitchExit && (
          <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border-2 border-rose-500/40 text-rose-400 flex items-center justify-center shadow-2xl animate-pulse">
              <CameraOff className="w-10 h-10" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">Camera Connection Required</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                This assessment enforces active AI camera proctoring. You cannot view questions, write code, or attend this test without an active, unobstructed camera stream.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-bold text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Camera Stream: Offline / Disconnected</span>
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={() => {
                  setCameraRetryCount((prev) => prev + 1);
                }}
                className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xl shadow-rose-600/30 transition transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Enable Camera & Retry Connection</span>
              </button>
            </div>
          </div>
        )}

      {/* IMMEDIATE TAB SWITCH / ALT+TAB MALPRACTICE TERMINAL OVERLAY */}
      {isImmediateTabSwitchExit && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in duration-200">
          <div className="w-20 h-20 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-rose-400 flex items-center justify-center shadow-2xl animate-pulse">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div className="max-w-md space-y-3">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-rose-600 text-white shadow-lg">
              Immediate Termination • Malpractice
            </span>
            <h2 className="text-3xl font-black text-white tracking-tight">Test Terminated Immediately</h2>
            <p className="text-sm text-rose-300 font-bold">
              {immediateExitReason || 'Alt+Tab or Tab Switch Detected'}
            </p>
            <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
              Switching browser tabs, pressing Alt+Tab, or leaving the examination window is strictly forbidden under test integrity policy. Your assessment has been permanently terminated for malpractice and code submissions are being finalized.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-rose-400 font-bold text-xs pt-2">
            <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Exiting test immediately & locking answers...</span>
          </div>
        </div>
      )}

      {/* MULTI-PERSON MALPRACTICE TERMINATION OVERLAY (> 10s EXCEEDED) */}
      {isMultiPersonMalpractice && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-5 animate-in fade-in duration-300">
          <div className="w-20 h-20 rounded-2xl bg-rose-950/80 border-2 border-rose-500 text-rose-400 flex items-center justify-center shadow-2xl animate-pulse">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div className="max-w-lg space-y-3">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-rose-600 text-white shadow-lg">
              Malpractice Recorded
            </span>
            <h2 className="text-3xl font-black text-white tracking-tight">Assessment Terminated for Malpractice</h2>
            <p className="text-sm text-rose-300 font-bold">
              Two or more persons were detected in camera frame for more than 10 seconds.
            </p>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              In accordance with examination proctoring regulations, continuous presence of multiple individuals during the test is strictly prohibited. Your session has been terminated and permanently flagged for malpractice.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-rose-400 font-bold text-xs pt-2">
            <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Locking test session & archiving proctoring audit log...</span>
          </div>
        </div>
      )}

      {/* 5 WARNINGS EXCEEDED AUTO-SUBMIT TERMINAL OVERLAY */}
      {isAutoSubmitting && !isMultiPersonMalpractice && !isImmediateTabSwitchExit && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-5">
          <div className="w-20 h-20 rounded-2xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-400 flex items-center justify-center shadow-2xl animate-bounce">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-2xl font-black text-white tracking-tight">5 Warnings Limit Reached</h2>
            <p className="text-sm text-rose-400 font-bold">Assessment Exited & Automatically Submitted</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              You have reached the limit of 5 proctoring warnings for malpractice or exiting fullscreen mode. Your test session has been terminated and your saved code is being finalized automatically.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs pt-2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Finalizing assessment & saving code...</span>
          </div>
        </div>
      )}

      {/* WARNING MODAL POPUP */}
      {warningMessage && !isAutoSubmitting && !isImmediateTabSwitchExit && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/60 p-6 rounded-2xl max-w-lg w-full space-y-4 text-center shadow-2xl relative">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={handleAcknowledgeWarning}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close Warning"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Warning Icon Badge */}
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
              <AlertTriangle className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <span>Warning {warningsCount} of {maxAllowedWarnings}</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Proctoring Security Warning</h3>
            </div>

            {/* Warning Meter */}
            <div className="flex items-center justify-center gap-2 py-1">
              {Array.from({ length: maxAllowedWarnings }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    i < warningsCount
                      ? 'bg-amber-400 shadow-sm shadow-amber-500/50'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                />
              ))}
            </div>

            {/* Warning Message Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-amber-200/90 leading-relaxed font-mono text-left">
              {warningMessage}
            </div>

            {/* Examination Integrity Rules Advisory */}
            <div className="text-[11px] text-slate-400 text-left bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 space-y-1">
              <p className="font-semibold text-slate-300">Examination Integrity Rules:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                <li>Remain in fullscreen mode with camera enabled.</li>
                <li>Keep your face centered and visible at all times.</li>
                <li>Do not switch tabs, minimize windows, or use unauthorized devices.</li>
              </ul>
              <p className="text-rose-400 font-semibold pt-1">
                Accumulating {maxAllowedWarnings} warnings will permanently terminate and submit your assessment.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={handleAcknowledgeWarning}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Acknowledge & Resume Assessment</span>
              </button>
              {warningsHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleAcknowledgeWarning();
                    setShowWarningsHistoryModal(true);
                  }}
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs cursor-pointer transition border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Info className="w-4 h-4" />
                  <span>View History</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROCTORING TEST & DIAGNOSTICS MODAL */}
      {showProctorTestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-indigo-500/40 p-6 rounded-2xl max-w-lg w-full space-y-5 text-left shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Proctoring Diagnostics & Test Simulator</h3>
                  <p className="text-xs text-slate-400">Trigger simulated infractions to verify face tracking and warning counters</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProctorTestModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Real-time Diagnostics HUD */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block uppercase">Active Warnings</span>
                <div className="flex items-baseline space-x-1.5 mt-1">
                  <span className={`text-2xl font-black font-mono ${warningsCount >= 3 ? 'text-rose-400' : warningsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {warningsCount}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">/ {maxAllowedWarnings}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block uppercase">Face Tracking</span>
                <div className="flex items-center space-x-1.5 mt-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    proctorTelemetry?.faceCount === 0
                      ? 'bg-rose-500 animate-pulse'
                      : (proctorTelemetry?.faceCount || 1) >= 2
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`} />
                  <span className="text-xs font-bold text-slate-200 font-mono">
                    {proctorTelemetry?.faceCount === 0
                      ? 'No Face (0)'
                      : (proctorTelemetry?.faceCount || 1) >= 2
                      ? `Multiple (${proctorTelemetry?.faceCount})`
                      : 'Verified (1 Face)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Test Action Buttons Grid */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 block uppercase font-mono tracking-wider">
                Simulate Violations & Strikes
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSimulateNoFace();
                    setInfoToast({ message: 'Triggered: No Face in camera test strike', type: 'warning' });
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-mono text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>👤 Test No Face</span>
                  <span className="text-[10px] text-amber-400 font-bold">+1 Strike</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSimulateMultipleFaces();
                    setInfoToast({ message: 'Triggered: Multiple Faces in camera test strike', type: 'warning' });
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-mono text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>👥 Test 2+ People</span>
                  <span className="text-[10px] text-amber-400 font-bold">+1 Strike</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSimulatePhone();
                    setInfoToast({ message: 'Triggered: Mobile Phone detected test strike', type: 'warning' });
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-mono text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>📱 Test Smartphone</span>
                  <span className="text-[10px] text-amber-400 font-bold">+1 Strike</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSimulateTabSwitch();
                    setInfoToast({ message: 'Triggered: Tab Switch violation test strike', type: 'warning' });
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-mono text-xs flex items-center justify-between transition cursor-pointer"
                >
                  <span>🔀 Test Tab Switch</span>
                  <span className="text-[10px] text-amber-400 font-bold">+1 Strike</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSimulateFullscreenExit();
                    setInfoToast({ message: 'Triggered: Fullscreen exit test strike', type: 'warning' });
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-mono text-xs flex items-center justify-between transition cursor-pointer col-span-2"
                >
                  <span>🖥️ Test Fullscreen Exit Violation</span>
                  <span className="text-[10px] text-amber-400 font-bold">+1 Strike</span>
                </button>
              </div>
            </div>

            {/* Reset Warnings */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetWarnings}
                className="py-2 px-3.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Warnings to 0</span>
              </button>

              <button
                type="button"
                onClick={() => setShowProctorTestModal(false)}
                className="py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Close Simulator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANDIDATE PROCTORING WARNINGS HISTORY MODAL */}
      {showWarningsHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-xl w-full space-y-5 text-left shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Proctoring Warnings Audit Log</h3>
                  <p className="text-xs text-slate-400">Recorded infractions and security alerts for this session</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWarningsHistoryModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warnings Counter & Status */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block font-mono">Current Warning Count</span>
                <div className="flex items-baseline space-x-1 mt-0.5">
                  <span className={`text-2xl font-black font-mono ${warningsCount >= 3 ? 'text-rose-400' : warningsCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {warningsCount}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">/ {maxAllowedWarnings} max allowed</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                  warningsCount === 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : warningsCount < 3
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {warningsCount === 0 ? 'Good Standing' : warningsCount < 3 ? 'Warning Advisory' : 'Critical Standing'}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  {Math.max(0, maxAllowedWarnings - warningsCount)} warning{maxAllowedWarnings - warningsCount === 1 ? '' : 's'} remaining before auto-submit
                </p>
              </div>
            </div>

            {/* History List */}
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {warningsHistory.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold text-white">No warnings recorded</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">Your assessment session is currently in clean standing.</p>
                </div>
              ) : (
                warningsHistory.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono font-bold text-[10px]">
                        {item.type}
                      </span>
                      <span className="text-slate-500 font-mono text-[10px]">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-mono">{item.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Close Action */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWarningsHistoryModal(false)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                Close & Return to Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY SCREEN SHARING PERMISSION MODAL */}
      {showScreenSharePromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Screen Sharing & Streaming Required</h3>
                <p className="text-xs text-slate-400">Institutional Examination Integrity Policy</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800 leading-relaxed">
              <p className="font-semibold text-white">Before proceeding with your exam:</p>
              <ul className="space-y-1.5 list-disc list-inside text-slate-300">
                <li>Your desktop screen will be streamed live to the proctoring faculty.</li>
                <li>Your screen is recorded in continuous chunks uploaded to secure cloud storage.</li>
                <li>Select your <strong>entire screen</strong> when prompted by the browser.</li>
                <li>Stopping or interrupting screen capture will register proctoring warnings.</li>
              </ul>
            </div>

            {screenShareError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-1.5 text-left">
                <div className="flex items-center space-x-2 font-bold text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Screen Capture Status</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-300/90">{screenShareError}</p>
              </div>
            )}

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isRequestingScreenShare}
                onClick={handleStartScreenRecording}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center justify-center space-x-2"
              >
                {isRequestingScreenShare ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Waiting for Browser Permission Prompt...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Grant Permission & Share Screen</span>
                  </>
                )}
              </button>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 border border-slate-700"
                  title="Open assessment in new tab to grant native display capture permissions"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>Open in Full Tab</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
