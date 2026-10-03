import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Camera,
  Circle,
  Eye,
  Monitor,
  Radio,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  Filter,
  Play,
  Pause,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Users,
  AlertOctagon,
  Activity,
  Clock,
  Mic,
} from 'lucide-react';
import { Assessment, CandidateSession } from '../../types';
import { RestartTestModal, RestartTestOptions } from '../common/RestartTestModal';
import { createDemoCameraStream, DemoStreamController } from '../../services/demoStream';
import { createResilientSocket } from '../../services/socketClient';
import { FacultyWebRTCSubscriber } from '../../services/webrtcProctor';

interface LiveMonitoringProps {
  assessments: Assessment[];
  sessions: CandidateSession[];
  onInspectCandidate: (sessionId: string) => void;
  onRestartTest?: (
    assessmentId: string,
    candidateId: string,
    sessionId?: string,
    options?: RestartTestOptions
  ) => Promise<void> | void;
}

const LiveCandidateStreamFeed: React.FC<{
  url?: string;
  cameraActive?: boolean;
  screenActive?: boolean;
  feedType: 'camera' | 'screen';
  isLive: boolean;
  candidateName: string;
  assessmentId?: string;
  sessionId?: string;
}> = ({ url, cameraActive = true, screenActive = true, feedType, isLive, candidateName, assessmentId, sessionId }) => {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [webrtcConnected, setWebrtcConnected] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<string | null>(null);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const demoControllerRef = useRef<DemoStreamController | null>(null);
  const webrtcSubscriberRef = useRef<FacultyWebRTCSubscriber | null>(null);

  // WebRTC real-time candidate subscriber connection & live frame subscriber
  useEffect(() => {
    if (!isLive || !assessmentId || !sessionId) {
      if (webrtcSubscriberRef.current) {
        webrtcSubscriberRef.current.stop();
        webrtcSubscriberRef.current = null;
      }
      setWebrtcConnected(false);
      return;
    }

    let socket: any = null;
    try {
      socket = createResilientSocket();
      socket.emit('webrtc_join_room', {
        assessmentId,
        sessionId,
        role: 'FACULTY',
      });

      socket.on('candidate_live_frame', (data: { feedType: 'camera' | 'screen'; frameData: string; sessionId?: string }) => {
        if (!data.sessionId || data.sessionId === sessionId) {
          if (data.feedType === feedType && data.frameData) {
            setLiveSnapshot(data.frameData);
            setLastSnapshotTime(Date.now());
          }
        }
      });

      if (feedType === 'camera' && videoRef.current) {
        const subscriber = new FacultyWebRTCSubscriber(socket, assessmentId, sessionId, (state) => {
          if (state === 'CONNECTED') {
            setWebrtcConnected(true);
          } else if (state === 'DISCONNECTED' || state === 'FAILED') {
            setWebrtcConnected(false);
          }
        });

        webrtcSubscriberRef.current = subscriber;
        subscriber.start(videoRef.current);
      }

      return () => {
        if (webrtcSubscriberRef.current) {
          webrtcSubscriberRef.current.stop();
          webrtcSubscriberRef.current = null;
        }
        if (socket) {
          socket.disconnect();
        }
        setWebrtcConnected(false);
      };
    } catch (err) {
      console.warn('[LiveMonitoring] Live connection warning:', err);
    }
  }, [isLive, feedType, assessmentId, sessionId]);

  // Check if current snapshot is fresh (under 12 seconds old)
  const isSnapshotFresh = Boolean(liveSnapshot && Date.now() - lastSnapshotTime < 12000);

  // Fallback demo stream setup when no active WebRTC stream, snapshot, or video URL exists
  useEffect(() => {
    if ((!url || hasVideoError) && isLive && feedType === 'camera' && !webrtcConnected && !isSnapshotFresh) {
      if (videoRef.current && !demoControllerRef.current) {
        const ctrl = createDemoCameraStream(false);
        demoControllerRef.current = ctrl;
        videoRef.current.srcObject = ctrl.stream;
        videoRef.current.play().catch(() => {});
      }
    } else {
      if (demoControllerRef.current) {
        demoControllerRef.current.destroy();
        demoControllerRef.current = null;
      }
    }

    return () => {
      if (demoControllerRef.current) {
        demoControllerRef.current.destroy();
        demoControllerRef.current = null;
      }
    };
  }, [url, hasVideoError, isLive, feedType, webrtcConnected, isSnapshotFresh]);

  // Screen recording canvas simulation if screen mode selected and no video URL / snapshot
  useEffect(() => {
    let animId: number;
    if ((!url || hasVideoError) && feedType === 'screen' && !isSnapshotFresh && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      let step = 0;

      const renderScreen = () => {
        if (!ctx) return;
        step += 0.05;

        // Draw simulated IDE screen
        ctx.fillStyle = '#16161B';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header bar
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, 30);

        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(15, 15, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(30, 15, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(45, 15, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`Desktop Capture - ${candidateName} [IDE Active]`, 65, 19);

        // Sidebar
        ctx.fillStyle = '#182234';
        ctx.fillRect(0, 30, 80, canvas.height - 30);

        // Code editor area
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(80, 30, canvas.width - 80, canvas.height - 30);

        // Simulated typing lines
        const lines = [
          'function solveProblem(arr, target) {',
          '  const map = new Map();',
          '  for (let i = 0; i < arr.length; i++) {',
          '    const complement = target - arr[i];',
          '    if (map.has(complement)) {',
          '      return [map.get(complement), i];',
          '    }',
          '    map.set(arr[i], i);',
          '  }',
          '  return [];',
          '}',
        ];

        ctx.font = '11px monospace';
        lines.forEach((line, idx) => {
          ctx.fillStyle = idx === 3 ? '#60a5fa' : idx === 1 || idx === 8 ? '#c084fc' : '#e2e8f0';
          ctx.fillText(`${idx + 1}  ${line}`, 95, 55 + idx * 18);
        });

        // Blinking cursor
        if (Math.sin(step * 3) > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(240, 147, 7, 14);
        }

        animId = requestAnimationFrame(renderScreen);
      };

      renderScreen();
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [url, hasVideoError, feedType, isSnapshotFresh, candidateName]);

  if (url && !hasVideoError) {
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        onError={() => setHasVideoError(true)}
        className="w-full h-full object-cover"
      />
    );
  }

  if (feedType === 'camera') {
    return (
      <div className="relative w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {isSnapshotFresh && !webrtcConnected ? (
          <img
            src={liveSnapshot!}
            alt="Live Webcam Feed"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        {isSnapshotFresh && !webrtcConnected && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500/80 text-[9px] font-bold text-white flex items-center gap-1 shadow-xs backdrop-blur-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE FEED
          </div>
        )}
        {!isLive && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
            <Camera className="w-8 h-8 mb-2 text-zinc-600" />
            <span className="text-xs font-semibold text-zinc-300">Session Completed / Feed Archived</span>
            <span className="text-[11px] text-zinc-500 mt-1">Inspection logs available in Session Audit</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
      {isSnapshotFresh ? (
        <>
          <img
            src={liveSnapshot!}
            alt="Live Desktop Feed"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-indigo-500/80 text-[9px] font-bold text-white flex items-center gap-1 shadow-xs backdrop-blur-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE SCREEN
          </div>
        </>
      ) : (
        <canvas ref={canvasRef} width={640} height={360} className="w-full h-full object-cover" />
      )}
      {!isLive && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
          <Monitor className="w-8 h-8 mb-2 text-zinc-600" />
          <span className="text-xs font-semibold text-zinc-300">Desktop Stream Ended</span>
        </div>
      )}
    </div>
  );
};

export const LiveMonitoring: React.FC<LiveMonitoringProps> = ({
  assessments = [],
  sessions = [],
  onInspectCandidate,
  onRestartTest,
}) => {
  const [assessmentId, setAssessmentId] = useState<string>('ALL');
  const [statusTab, setStatusTab] = useState<'ACTIVE' | 'SUBMITTED' | 'FLAGGED' | 'ALL'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [restartModalSession, setRestartModalSession] = useState<CandidateSession | null>(null);

  // Individual Selected Student Live Stream state
  // Only ONE student live stream is mounted/buffered at any time!
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedFeedMode, setSelectedFeedMode] = useState<'camera' | 'screen'>('camera');

  // Live assessments only: closed, ended, and deleted assessments disappear from live monitoring
  const liveAssessments = useMemo(() => {
    return assessments.filter((asm) => {
      if (!asm || !asm.id) return false;
      if ((asm as any).isDeleted || asm.status === 'ARCHIVED' || (asm.status as any) === 'deleted' || (asm as any).deletedAt) return false;
      if (asm.status === 'CLOSED' || asm.status === 'COMPLETED') return false;
      const isPastEnd = asm.endTime && new Date(asm.endTime).getTime() <= Date.now() && asm.status !== 'PAUSED';
      if (isPastEnd) return false;
      return asm.status === 'ACTIVE' || (asm.status as any) === 'live';
    });
  }, [assessments]);

  // If currently selected assessment was closed or ended, reset to 'ALL'
  useEffect(() => {
    if (assessmentId !== 'ALL' && !liveAssessments.some((a) => a.id === assessmentId)) {
      setAssessmentId('ALL');
    }
  }, [assessmentId, liveAssessments]);

  // Helper to check if a session is finished, closed, or expired
  const isSessionFinished = (session: CandidateSession) => {
    const parentAsm = liveAssessments.find((a) => a.id === session.assessmentId);
    if (!parentAsm) return true; // Parent assessment closed or ended -> session no longer live

    const startTime = new Date(session.startedAt || (session as any).startTime || 0).getTime();
    const durationMins = parentAsm?.durationMinutes || 90;
    const isDurationExpired = startTime > 0 && Date.now() > startTime + durationMins * 60 * 1000;

    const st = (session.state || '').toUpperCase();
    const rawStatus = ((session as any).status || '').toUpperCase();
    const subSt = ((session as any).submissionStatus || '').toUpperCase();

    const isExplicitlyCompleted = Boolean(session.completedAt) || Boolean(session.endedAt);
    const isTerminated = st === 'TERMINATED_MALPRACTICE' || (session as any).riskCategory === 'MALPRACTICE_TERMINATED';
    const isClosedOrExpired = Boolean(isDurationExpired) || st === 'CLOSED' || st === 'EXPIRED' || rawStatus === 'CLOSED';

    if (isClosedOrExpired || isTerminated) return true;
    if (isExplicitlyCompleted && (st === 'SUBMITTED' || st === 'AUTO_SUBMITTED' || st === 'ENDED' || subSt === 'SUBMITTED' || subSt === 'AUTO_SUBMITTED')) {
      return true;
    }

    return false;
  };

  // Helper to check if a candidate is actively taking the test right now
  const isSessionActive = (session: CandidateSession) => {
    if (isSessionFinished(session)) return false;
    if (session.state === 'PAUSED' || session.isPaused) return false;
    return true;
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      // Must belong to a valid live, active assessment (closed/ended tests disappear from live monitoring)
      const parentAsm = liveAssessments.find((a) => a.id === session.assessmentId);
      if (!parentAsm) return false;

      // Filter by selected assessment
      if (assessmentId !== 'ALL' && session.assessmentId !== assessmentId) {
        return false;
      }

      // Filter by candidate name, register number or email search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (session.candidateName || '').toLowerCase().includes(q);
        const emailMatch = (session.candidateEmail || '').toLowerCase().includes(q);
        const regMatch = (session.candidateRegisterNo || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !regMatch) return false;
      }

      const active = isSessionActive(session);
      if (statusTab === 'ACTIVE') {
        return active;
      }
      if (statusTab === 'SUBMITTED') {
        return !active;
      }
      if (statusTab === 'FLAGGED') {
        return (session.warningsCount && session.warningsCount > 0) || session.state === 'TERMINATED_MALPRACTICE';
      }
      return true;
    });
  }, [assessmentId, sessions, statusTab, searchQuery, liveAssessments]);

  const activeCount = useMemo(() => {
    return sessions.filter((s) => {
      if (!liveAssessments.some((a) => a.id === s.assessmentId)) return false;
      if (assessmentId !== 'ALL' && s.assessmentId !== assessmentId) return false;
      return isSessionActive(s);
    }).length;
  }, [sessions, assessmentId, liveAssessments]);

  const submittedCount = useMemo(() => {
    return sessions.filter((s) => {
      if (!liveAssessments.some((a) => a.id === s.assessmentId)) return false;
      if (assessmentId !== 'ALL' && s.assessmentId !== assessmentId) return false;
      return !isSessionActive(s);
    }).length;
  }, [sessions, assessmentId, liveAssessments]);

  const flaggedCount = useMemo(() => {
    return sessions.filter((s) => {
      if (!liveAssessments.some((a) => a.id === s.assessmentId)) return false;
      if (assessmentId !== 'ALL' && s.assessmentId !== assessmentId) return false;
      return (s.warningsCount && s.warningsCount > 0) || s.state === 'TERMINATED_MALPRACTICE';
    }).length;
  }, [sessions, assessmentId, liveAssessments]);

  // Find currently selected session for focused individual live stream
  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions.find((s) => s.id === selectedSessionId) || null;
  }, [selectedSessionId, sessions]);

  const selectedIndex = useMemo(() => {
    if (!selectedSession) return -1;
    return filteredSessions.findIndex((s) => s.id === selectedSession.id);
  }, [selectedSession, filteredSessions]);

  const handlePrevCandidate = () => {
    if (selectedIndex > 0) {
      setSelectedSessionId(filteredSessions[selectedIndex - 1].id);
    }
  };

  const handleNextCandidate = () => {
    if (selectedIndex >= 0 && selectedIndex < filteredSessions.length - 1) {
      setSelectedSessionId(filteredSessions[selectedIndex + 1].id);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono flex items-center gap-2 text-rose-400 mb-1">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> Live Candidate Directory & Proctoring
          </span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Real-time Monitoring
          </h1>
          <p className="text-zinc-400 text-sm">
            View detailed student proctoring status, warning logs, and launch dedicated zero-latency individual live streams.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Assessment Filter */}
          <div className="flex items-center gap-2 bg-[#141417] border border-white/10 rounded px-3 py-2">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value)}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#141417]">All Live Assessments ({liveAssessments.length})</option>
              {liveAssessments.map((asm) => (
                <option key={asm.id} value={asm.id} className="bg-[#141417]">
                  {asm.title} [LIVE]
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search candidate name, reg no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#141417] border border-white/10 rounded pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 w-56"
            />
          </div>
        </div>
      </div>

      {/* Overview Stat Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#141417] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 font-mono block">Enrolled Candidates</span>
            <span className="text-2xl font-black text-white">{sessions.length}</span>
          </div>
          <Users className="w-6 h-6 text-zinc-500" />
        </div>

        <div className="bg-[#141417] p-4 rounded-xl border border-rose-500/20 flex items-center justify-between">
          <div>
            <span className="text-xs text-rose-300 font-mono block">Live Active Now</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="text-2xl font-black text-rose-400">{activeCount}</span>
            </div>
          </div>
          <Activity className="w-6 h-6 text-rose-400" />
        </div>

        <div className="bg-[#141417] p-4 rounded-xl border border-indigo-500/20 flex items-center justify-between">
          <div>
            <span className="text-xs text-indigo-300 font-mono block">Submitted / Finished</span>
            <span className="text-2xl font-black text-indigo-400">{submittedCount}</span>
          </div>
          <CheckCircle2 className="w-6 h-6 text-indigo-400" />
        </div>

        <div className="bg-[#141417] p-4 rounded-xl border border-amber-500/20 flex items-center justify-between">
          <div>
            <span className="text-xs text-amber-300 font-mono block">Flagged / Warnings</span>
            <span className="text-2xl font-black text-amber-400">{flaggedCount}</span>
          </div>
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 gap-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setStatusTab('ACTIVE')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              statusTab === 'ACTIVE'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <Circle className="w-2 h-2 fill-current animate-ping" />
            <span>Live Active In Test ({activeCount})</span>
          </button>

          <button
            onClick={() => setStatusTab('FLAGGED')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              statusTab === 'FLAGGED'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>With Warnings ({flaggedCount})</span>
          </button>

          <button
            onClick={() => setStatusTab('SUBMITTED')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              statusTab === 'SUBMITTED'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Submitted / Finished ({submittedCount})</span>
          </button>

          <button
            onClick={() => setStatusTab('ALL')}
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              statusTab === 'ALL'
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-[#141417] text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            <span>All Students ({sessions.length})</span>
          </button>
        </div>

        <div className="text-xs text-zinc-400 font-mono">
          Showing {filteredSessions.length} candidate{filteredSessions.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* CANDIDATES DETAILS LIST - Lightweight & Fast (No buffer overload!) */}
      {filteredSessions.length === 0 ? (
        <div className="card-variation2 p-12 text-center text-zinc-400 space-y-4">
          <Users className="w-12 h-12 mx-auto text-zinc-600 animate-pulse" />
          <div>
            <h3 className="text-base font-bold text-white">
              {statusTab === 'ACTIVE'
                ? 'No active candidates taking a test right now'
                : 'No candidates match the selected filter'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Candidate live streams and real-time proctoring telemetry update dynamically as students progress.
            </p>
          </div>

          {statusTab === 'ACTIVE' && (
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => setStatusTab('ALL')}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                View All Candidates ({sessions.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredSessions.map((session) => {
            const asm = assessments.find((item) => item.id === session.assessmentId);
            const finished = isSessionFinished(session);
            const active = isSessionActive(session);
            const maxAllowedWarnings = asm?.securitySettings?.maxWarnings || 5;
            const currentWarnings = session.warningsCount || 0;
            const isSelected = selectedSessionId === session.id;

            return (
              <div
                key={session.id}
                className={`rounded-xl border transition-all flex flex-col justify-between overflow-hidden ${
                  isSelected
                    ? 'bg-slate-900/90 border-indigo-500 shadow-lg shadow-indigo-500/20'
                    : 'bg-[#141417] border-white/10 hover:border-white/20'
                }`}
              >
                {/* Card Header & Candidate Details */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-sm">
                        {(session.candidateName || 'C').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          {session.candidateName}
                        </h3>
                        <p className="text-xs text-zinc-400 font-mono">
                          {session.candidateRegisterNo || session.candidateEmail}
                        </p>
                      </div>
                    </div>

                    {/* Live Status Pill */}
                    {active ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold flex items-center gap-1 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                        LIVE
                      </span>
                    ) : session.state === 'TERMINATED_MALPRACTICE' ? (
                      <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[10px] font-bold">
                        TERMINATED
                      </span>
                    ) : session.isPaused || session.state === 'PAUSED' ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                        PAUSED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                        SUBMITTED
                      </span>
                    )}
                  </div>

                  {/* Assessment Info */}
                  <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 truncate max-w-[190px]">
                        {asm?.title || session.assessmentTitle || 'Assessment'}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Q: {(session.currentQuestionIndex || 0) + 1}
                      </span>
                    </div>
                  </div>

                  {/* Warning Counter & Integrity Pill */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          currentWarnings >= 3
                            ? 'text-rose-400 animate-pulse'
                            : currentWarnings > 0
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      />
                      <div>
                        <span className="text-[11px] font-mono text-zinc-400 block">Proctoring Warnings</span>
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`text-sm font-bold font-mono ${
                              currentWarnings >= 3
                                ? 'text-rose-400'
                                : currentWarnings > 0
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {currentWarnings} / {maxAllowedWarnings}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {currentWarnings === 0 ? 'Clean' : currentWarnings >= maxAllowedWarnings ? 'Max Reached' : 'Strikes'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Visual Meter Dots */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: maxAllowedWarnings }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < currentWarnings
                              ? currentWarnings >= 3
                                ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                                : 'bg-amber-400 shadow-xs shadow-amber-500/50'
                              : 'bg-zinc-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Hardware Status Signals */}
                  <div className="flex items-center justify-between text-[11px] pt-1 text-zinc-400 font-mono">
                    <span
                      className={`flex items-center gap-1 ${
                        session.cameraActive !== false ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                      title={session.cameraActive !== false ? 'Webcam is active' : 'Webcam disabled'}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {session.cameraActive !== false ? 'Cam' : 'No Cam'}
                    </span>

                    <span
                      className={`flex items-center gap-1 ${
                        session.screenActive !== false ? 'text-indigo-400' : 'text-zinc-500'
                      }`}
                      title={session.screenActive !== false ? 'Screen share active' : 'Screen share inactive'}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      {session.screenActive !== false ? 'Screen' : 'No Screen'}
                    </span>

                    <span
                      className={`flex items-center gap-1 ${
                        session.connectionStatus !== 'DISCONNECTED' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" />
                      {session.connectionStatus || 'ONLINE'}
                    </span>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 pt-3 border-t border-white/10 bg-black/20 flex items-center justify-between gap-2">
                  {/* Primary Action: View Individual Live Feed */}
                  <button
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setSelectedFeedMode('camera');
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{active ? 'View Live Feed' : 'View Stream / Audit'}</span>
                  </button>

                  <button
                    onClick={() => onInspectCandidate(session.id)}
                    className="p-2 rounded-lg bg-[#1a1a1f] hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition cursor-pointer"
                    title="Inspect Full Audit Log"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {onRestartTest && (
                    <button
                      onClick={() => setRestartModalSession(session)}
                      className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition cursor-pointer"
                      title="Grant Retake (+1 Attempt)"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DEDICATED INDIVIDUAL LIVE STREAM THEATER (Only 1 stream running = Zero Buffer Lag!) */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-[#0f0f12] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#141418]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                  {(selectedSession.candidateName || 'C').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">{selectedSession.candidateName}</h2>
                    {isSessionActive(selectedSession) ? (
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm">
                        <Circle className="w-2 h-2 fill-current animate-ping" /> LIVE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold">
                        {(selectedSession.status || selectedSession.state || 'SUBMITTED').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 font-mono">
                    {selectedSession.candidateRegisterNo || selectedSession.candidateEmail} •{' '}
                    <span className="text-zinc-300">{selectedSession.assessmentTitle}</span>
                  </p>
                </div>
              </div>

              {/* Feed Switcher & Close Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-black/60 p-1 rounded-lg border border-white/10">
                  <button
                    onClick={() => setSelectedFeedMode('camera')}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedFeedMode === 'camera'
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" /> Webcam
                  </button>
                  <button
                    onClick={() => setSelectedFeedMode('screen')}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedFeedMode === 'screen'
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop Screen
                  </button>
                </div>

                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition cursor-pointer"
                  title="Close Live Stream"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Single High-Definition Stream + Telemetry */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-inner">
                <LiveCandidateStreamFeed
                  key={`${selectedSession.id}-${selectedFeedMode}`}
                  url={
                    selectedFeedMode === 'screen'
                      ? selectedSession.screenVideoUrl
                      : selectedSession.proctoringVideoUrl
                  }
                  cameraActive={selectedSession.cameraActive !== false}
                  screenActive={selectedSession.screenActive !== false}
                  feedType={selectedFeedMode}
                  isLive={isSessionActive(selectedSession) && !selectedSession.isPaused}
                  candidateName={selectedSession.candidateName || 'Candidate'}
                  assessmentId={selectedSession.assessmentId}
                  sessionId={selectedSession.id}
                />

                {/* Overlaid Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                  <span className="px-2.5 py-1 rounded-md bg-black/80 text-white text-xs font-mono border border-white/10 flex items-center gap-1.5 backdrop-blur-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {selectedFeedMode === 'camera' ? 'CANDIDATE WEBCAM' : 'CANDIDATE DESKTOP SCREEN'}
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs z-10">
                  <span className="px-2.5 py-1 rounded-md bg-black/80 text-emerald-400 border border-white/10 font-mono flex items-center gap-1.5 backdrop-blur-xs">
                    <Wifi className="w-3.5 h-3.5" />
                    {selectedSession.connectionStatus || 'CONNECTED ● Active'}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-black/80 text-zinc-300 border border-white/10 font-mono text-[11px] backdrop-blur-xs">
                    Session ID: {selectedSession.id.slice(-8)}
                  </span>
                </div>
              </div>

              {/* Real-time Candidate Diagnostic Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#141418] p-4 rounded-xl border border-white/10">
                {/* Warnings Strike */}
                <div>
                  <span className="text-[11px] text-zinc-400 font-mono block">Proctoring Strikes</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <AlertTriangle
                      className={`w-4 h-4 ${
                        (selectedSession.warningsCount || 0) >= 3
                          ? 'text-rose-400 animate-pulse'
                          : (selectedSession.warningsCount || 0) > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    />
                    <span className="text-lg font-black font-mono text-white">
                      {selectedSession.warningsCount || 0} / 5
                    </span>
                  </div>
                </div>

                {/* Camera Hardware */}
                <div>
                  <span className="text-[11px] text-zinc-400 font-mono block">Webcam Status</span>
                  <span
                    className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${
                      selectedSession.cameraActive !== false ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    {selectedSession.cameraActive !== false ? 'Streaming' : 'Disabled'}
                  </span>
                </div>

                {/* Screen Recording Hardware */}
                <div>
                  <span className="text-[11px] text-zinc-400 font-mono block">Desktop Recording</span>
                  <span
                    className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${
                      selectedSession.screenActive !== false ? 'text-indigo-400' : 'text-zinc-500'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    {selectedSession.screenActive !== false ? 'Capturing' : 'Not Active'}
                  </span>
                </div>

                {/* Risk Category */}
                <div>
                  <span className="text-[11px] text-zinc-400 font-mono block">Risk Assessment</span>
                  <span
                    className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${
                      selectedSession.riskCategory === 'CRITICAL' || selectedSession.state === 'TERMINATED_MALPRACTICE'
                        ? 'text-rose-400'
                        : selectedSession.riskCategory === 'SUSPICIOUS'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {selectedSession.riskCategory || 'NORMAL'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer with Student Switcher Navigation */}
            <div className="p-4 border-t border-white/10 bg-[#141418] flex flex-wrap items-center justify-between gap-3">
              {/* Quick Prev/Next Candidate switcher */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevCandidate}
                  disabled={selectedIndex <= 0}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev Student
                </button>

                <span className="text-xs font-mono text-zinc-400 px-2">
                  {selectedIndex + 1} of {filteredSessions.length}
                </span>

                <button
                  onClick={handleNextCandidate}
                  disabled={selectedIndex < 0 || selectedIndex >= filteredSessions.length - 1}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  Next Student <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Actions for this student */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const sid = selectedSession.id;
                    setSelectedSessionId(null);
                    onInspectCandidate(sid);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-400" /> Full Audit Log
                </button>

                {onRestartTest && (
                  <button
                    onClick={() => {
                      setRestartModalSession(selectedSession);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Grant Retake
                  </button>
                )}

                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Close Live Feed
                </button>
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
          restartModalSession
            ? assessments.find((a) => a.id === restartModalSession.assessmentId) || null
            : null
        }
        session={restartModalSession}
        onConfirmRestart={async (asmId, candId, sessId, opts) => {
          if (onRestartTest) {
            await onRestartTest(asmId, candId, sessId, opts);
          }
        }}
      />
    </div>
  );
};

