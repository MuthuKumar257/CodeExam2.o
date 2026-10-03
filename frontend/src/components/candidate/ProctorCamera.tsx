import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertTriangle, UserCheck, Users, EyeOff, Smartphone, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { FrameTelemetry } from '../../services/proctorDetector';

export interface ProctorCameraProps {
  stream?: MediaStream | null;
  onFaceStatusChange?: (status: 'OK' | 'NO_FACE' | 'MULTIPLE_FACES', message?: string) => void;
  onPhoneStatusChange?: (detected: boolean) => void;
  onDismissPhoneDetection?: () => void;
  onCameraError?: () => void;
  onCameraStatusChange?: (active: boolean) => void;
  onMicStatusChange?: (active: boolean) => void;
  isCompact?: boolean;
  telemetry?: FrameTelemetry | null;
  multiPersonDuration?: number;
}

export const ProctorCamera: React.FC<ProctorCameraProps> = ({
  stream: externalStream,
  onFaceStatusChange,
  onPhoneStatusChange,
  onDismissPhoneDetection,
  onCameraError,
  onCameraStatusChange,
  onMicStatusChange,
  isCompact = false,
  telemetry,
  multiPersonDuration = 0,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [faceState, setFaceState] = useState<'OK' | 'NO_FACE' | 'MULTIPLE_FACES'>('OK');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const activeStreamRef = useRef<MediaStream | null>(null);
  const lastStatusRef = useRef<'OK' | 'NO_FACE' | 'MULTIPLE_FACES'>('OK');
  const lastPhoneRef = useRef<boolean>(false);

  useEffect(() => {
    let localStream: MediaStream | null = null;
    let intervalId: any = null;

    async function initCamera() {
      try {
        let streamToUse = externalStream;

        if (!streamToUse) {
          streamToUse = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true,
          });
          localStream = streamToUse;
        }

        activeStreamRef.current = streamToUse;

        if (videoRef.current) {
          videoRef.current.srcObject = streamToUse;
          videoRef.current.play().catch(() => {});
        }

        setStreamActive(true);
        setPermissionGranted(true);

        if (onCameraStatusChange) onCameraStatusChange(true);
        if (onMicStatusChange) onMicStatusChange(true);

        // Monitor track status (ended/disabled)
        const videoTrack = streamToUse.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setStreamActive(false);
            if (onCameraStatusChange) onCameraStatusChange(false);
          };
        }

        const audioTrack = streamToUse.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            if (onMicStatusChange) onMicStatusChange(false);
          };
        }

        // Only run internal canvas analysis if external telemetry is NOT provided
        if (!telemetry) {
          intervalId = setInterval(() => {
            analyzeFrameFallback();
          }, 2500);
        }
      } catch (err) {
        console.warn('Camera permission denied or unavailable:', err);
        setStreamActive(false);
        setPermissionGranted(false);
        setFaceState('NO_FACE');
        if (onCameraStatusChange) onCameraStatusChange(false);
        if (onMicStatusChange) onMicStatusChange(false);
        if (onFaceStatusChange) {
          onFaceStatusChange('NO_FACE', 'Webcam feed is offline or blocked.');
        }
        if (onCameraError) onCameraError();
      }
    }

    initCamera();

    return () => {
      if (intervalId) clearInterval(intervalId);

      // Stop local stream if component created it
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [externalStream]);

  // Sync external telemetry updates
  useEffect(() => {
    if (telemetry) {
      if (telemetry.faceCount === 0) {
        setFaceState('NO_FACE');
        setStatusMessage('No candidate face detected');
      } else if (telemetry.faceCount > 1) {
        setFaceState('MULTIPLE_FACES');
        setStatusMessage(`Multiple people detected (${telemetry.faceCount})`);
      } else {
        setFaceState('OK');
        setStatusMessage('Face verified');
      }

      if (telemetry.phoneDetected !== lastPhoneRef.current) {
        lastPhoneRef.current = telemetry.phoneDetected;
        if (onPhoneStatusChange) {
          onPhoneStatusChange(telemetry.phoneDetected);
        }
      }
    }
  }, [telemetry]);

  // Fallback analyzer if external telemetry is not piped in
  const analyzeFrameFallback = async () => {
    if (!videoRef.current || !canvasRef.current || !streamActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0) return;

    canvas.width = 160;
    canvas.height = 120;
    ctx.drawImage(video, 0, 0, 160, 120);

    let nextStatus: 'OK' | 'NO_FACE' | 'MULTIPLE_FACES' = 'OK';
    let msg = '';

    if ('FaceDetector' in window) {
      try {
        const faceDetector = new (window as any).FaceDetector({ fastMode: true, maxFaces: 5 });
        const faces = await faceDetector.detect(canvas);
        if (faces.length === 0) {
          nextStatus = 'NO_FACE';
          msg = 'No candidate face detected in camera frame.';
        } else if (faces.length > 1) {
          nextStatus = 'MULTIPLE_FACES';
          msg = `Multiple people detected in frame (${faces.length} faces)!`;
        } else {
          nextStatus = 'OK';
          msg = 'Single candidate face verified.';
        }
      } catch {
        nextStatus = performCanvasSkinToneAnalysis(ctx);
      }
    } else {
      nextStatus = performCanvasSkinToneAnalysis(ctx);
    }

    setFaceState(nextStatus);
    setStatusMessage(msg);

    if (nextStatus !== lastStatusRef.current) {
      lastStatusRef.current = nextStatus;
      if (onFaceStatusChange) {
        onFaceStatusChange(nextStatus, msg);
      }
    }
  };

  const performCanvasSkinToneAnalysis = (ctx: CanvasRenderingContext2D): 'OK' | 'NO_FACE' | 'MULTIPLE_FACES' => {
    if ((window as any).__SIMULATE_MULTIPLE_PERSONS__) {
      return 'MULTIPLE_FACES';
    }

    // If authoritative detector telemetry is provided, prefer its face count
    if (telemetry && typeof telemetry.faceCount === 'number') {
      if (telemetry.faceCount === 0) return 'NO_FACE';
      if (telemetry.faceCount > 1) return 'MULTIPLE_FACES';
      return 'OK';
    }

    const frameData = ctx.getImageData(0, 0, 160, 120);
    const data = frameData.data;

    let totalSkinPixels = 0;
    const gridCols = 8;
    const gridRows = 6;
    const cellW = 160 / gridCols;
    const cellH = 120 / gridRows;
    const cellSkin = new Uint16Array(gridCols * gridRows);

    for (let y = 0; y < 120; y += 2) {
      const r_idx = Math.floor(y / cellH);
      for (let x = 0; x < 160; x += 2) {
        const c_idx = Math.floor(x / cellW);
        const idx = (y * 160 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const isSkin =
          (r > 40 && g > 25 && b > 15 &&
           r > g && g >= b &&
           (r - g) >= 6 &&
           (r - b) >= 10 &&
           Math.abs(g - b) < 55) ||
          (r > 45 && g > 30 && b > 15 && r > g && r > b && Math.abs(r - g) > 10);

        if (isSkin) {
          totalSkinPixels++;
          cellSkin[r_idx * gridCols + c_idx]++;
        }
      }
    }

    if (totalSkinPixels < 40) {
      return 'NO_FACE';
    }

    // Check for 2 distinct head clusters in upper half of frame (rows 0..3) with separation
    let leftHeadSkin = 0;
    let rightHeadSkin = 0;
    let centerGapSkin = 0;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        leftHeadSkin += cellSkin[r * gridCols + c];
      }
      for (let c = 3; c < 5; c++) {
        centerGapSkin += cellSkin[r * gridCols + c];
      }
      for (let c = 6; c < gridCols; c++) {
        rightHeadSkin += cellSkin[r * gridCols + c];
      }
    }

    // Only flag multiple faces if there are two large independent head blobs on opposite sides with an empty middle gap
    if (leftHeadSkin >= 120 && rightHeadSkin >= 120 && centerGapSkin < 30) {
      return 'MULTIPLE_FACES';
    }

    return 'OK';
  };

  const isPhoneDetected = Boolean(telemetry?.phoneDetected);

  return (
    <div
      className={`relative rounded-xl bg-slate-950 border transition-all duration-200 overflow-hidden shadow-2xl ${
        isPhoneDetected
          ? 'border-rose-500 ring-2 ring-rose-500/40'
          : faceState !== 'OK'
          ? 'border-amber-500/60'
          : 'border-slate-800'
      } ${
        isCompact
          ? isMinimized
            ? 'w-48 h-10'
            : 'w-64 h-48'
          : isMinimized
          ? 'w-64 h-12'
          : 'w-full aspect-video'
      }`}
    >
      {/* Minimized Header Bar */}
      {isMinimized ? (
        <div className="w-full h-full flex items-center justify-between px-3 bg-slate-900/90 text-xs">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${streamActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="font-mono text-slate-300 text-[11px] font-bold">Proctor Camera</span>
            {isPhoneDetected && (
              <span className="bg-rose-500/20 text-rose-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-500/40 animate-pulse">
                📱 Phone!
              </span>
            )}
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
            title="Expand Camera Preview"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          {/* Main Video View */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            onError={(e) => console.warn('ProctorCamera video stream event', e)}
            className="w-full h-full object-cover transform -scale-x-100"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Real-time Bounding Box Overlays */}
          {/* 1. Candidate Face Box */}
          {telemetry?.faceBox && telemetry.faceCount === 1 && !isPhoneDetected && (
            <div
              className="absolute border border-emerald-400/50 bg-emerald-400/5 rounded-md pointer-events-none transition-all duration-150 z-10"
              style={{
                // Mirror horizontally since video has -scale-x-100
                right: `${(telemetry.faceBox.x / 320) * 100}%`,
                top: `${(telemetry.faceBox.y / 240) * 100}%`,
                width: `${(telemetry.faceBox.width / 320) * 100}%`,
                height: `${(telemetry.faceBox.height / 240) * 100}%`,
              }}
            >
              <div className="absolute -top-4 right-0 bg-emerald-500/90 text-slate-950 text-[8px] font-bold px-1 rounded font-mono uppercase whitespace-nowrap">
                Face Verified
              </div>
            </div>
          )}

          {/* Multiple Faces Bounding Boxes (Highlights Candidate and Unauthorized Persons) */}
          {telemetry?.faceBoxes && telemetry.faceBoxes.length >= 2 && !isPhoneDetected && (
            <>
              {telemetry.faceBoxes.map((box, idx) => (
                <div
                  key={idx}
                  className={`absolute border-2 rounded-md pointer-events-none transition-all duration-150 z-15 ${
                    idx === 0
                      ? 'border-amber-400/80 bg-amber-400/10'
                      : 'border-rose-500 bg-rose-500/20 animate-pulse'
                  }`}
                  style={{
                    right: `${(box.x / 320) * 100}%`,
                    top: `${(box.y / 240) * 100}%`,
                    width: `${(box.width / 320) * 100}%`,
                    height: `${(box.height / 240) * 100}%`,
                  }}
                >
                  <div
                    className={`absolute -top-4 right-0 text-[8px] font-bold px-1 rounded font-mono uppercase whitespace-nowrap shadow ${
                      idx === 0 ? 'bg-amber-500 text-slate-950' : 'bg-rose-600 text-white animate-pulse'
                    }`}
                  >
                    {idx === 0 ? 'Candidate' : `Person ${idx + 1} (Detected)`}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 2. Detected Phone Bounding Box (Flashing Red Alert Box) */}
          {isPhoneDetected && (
            <div
              className="absolute border-2 border-rose-500 bg-rose-500/20 rounded-lg animate-pulse pointer-events-none transition-all duration-150 z-20 shadow-lg shadow-rose-500/30"
              style={{
                right: telemetry?.phoneBox
                  ? `${(telemetry.phoneBox.x / 320) * 100}%`
                  : '15%',
                top: telemetry?.phoneBox
                  ? `${(telemetry.phoneBox.y / 240) * 100}%`
                  : '45%',
                width: telemetry?.phoneBox
                  ? `${(telemetry.phoneBox.width / 320) * 100}%`
                  : '32%',
                height: telemetry?.phoneBox
                  ? `${(telemetry.phoneBox.height / 240) * 100}%`
                  : '48%',
              }}
            >
              <div className="absolute -top-5 right-0 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap flex items-center space-x-1">
                <Smartphone className="w-3 h-3" />
                <span>PHONE DETECTED</span>
                <span className="opacity-80">
                  {Math.round((telemetry?.phoneBox?.confidence || 0.96) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Top Status Bar Overlays */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20 pointer-events-auto">
            {/* Camera Live Indicator overlay */}
            <div className="flex items-center space-x-1 bg-slate-950/85 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-800 text-[10px]">
              {streamActive ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-semibold">Live Camera</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="text-rose-400 font-semibold">Offline</span>
                </>
              )}
            </div>

            {/* Phone Detection HUD Tag */}
            <div className="flex items-center space-x-1">
              {isPhoneDetected ? (
                <div className="flex items-center space-x-1 bg-rose-950/90 border border-rose-500 text-rose-300 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse shadow-md">
                  <Smartphone className="w-3 h-3 text-rose-400" />
                  <span>PHONE DETECTED!</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 bg-slate-950/80 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[9px] font-mono">
                  <Smartphone className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Phone: None</span>
                </div>
              )}

              {/* Minimize button */}
              {isCompact && (
                <button
                  onClick={() => setIsMinimized(true)}
                  className="bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-white p-1 rounded border border-slate-800 cursor-pointer"
                  title="Minimize Video"
                >
                  <Minimize2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Face Alignment Oval Guide when face is not centered or detected */}
          {faceState === 'NO_FACE' && streamActive && !isPhoneDetected && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-28 h-36 rounded-full border-2 border-dashed border-amber-400/70 bg-amber-500/5 animate-pulse flex items-center justify-center">
                <span className="text-[9px] font-bold text-amber-300 bg-slate-950/90 px-2 py-0.5 rounded border border-amber-500/40 font-mono shadow">
                  Center Face Here
                </span>
              </div>
            </div>
          )}

          {/* Proctoring Warning Overlay banner when multiple faces or no face */}
          {faceState !== 'OK' && streamActive && !isPhoneDetected && (
            <div className="absolute inset-x-2 bottom-2 bg-slate-950/95 border border-rose-500/60 rounded-lg p-2 flex items-center space-x-2.5 z-15 shadow-xl animate-in slide-in-from-bottom-2">
              <div className="w-7 h-7 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
                {faceState === 'NO_FACE' ? (
                  <EyeOff className="w-4 h-4 text-amber-400 animate-pulse" />
                ) : (
                  <Users className="w-4 h-4 text-rose-400 animate-pulse" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <span className="text-[10px] font-bold block text-white leading-tight font-mono">
                  {faceState === 'NO_FACE' ? 'NO FACE DETECTED' : '2+ PEOPLE IN FRAME'}
                </span>
                <span className="text-[9px] text-rose-300 block leading-tight truncate">
                  {faceState === 'NO_FACE'
                    ? 'Center your face in front of the camera.'
                    : 'Multiple people detected. Ensure you are alone.'}
                </span>
              </div>
            </div>
          )}


        </>
      )}
    </div>
  );
};
