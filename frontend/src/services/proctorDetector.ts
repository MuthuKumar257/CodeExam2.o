import { ProctoringEvent, ProctoringEventType, SecuritySettings, ProctoringThresholds } from '../types';
import { DEFAULT_PROCTORING_THRESHOLDS, getProctoringThresholds } from './proctorConfig';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface HeadPoseTelemetry {
  yaw: number; // in degrees: negative = left, positive = right
  pitch: number; // in degrees: negative = looking up, positive = looking down
  roll: number; // in degrees: tilt
  confidence: number;
  state: 'NORMAL' | 'LOOKING_AWAY' | 'TRACKING_LOST';
  isWithinThresholds: boolean;
  normalizedCoords?: { x: number; y: number; width: number; height: number };
}

export interface FrameTelemetry {
  faceCount: number;
  phoneDetected: boolean;
  phoneBox?: BoundingBox;
  faceBox?: BoundingBox;
  faceBoxes?: BoundingBox[];
  avgLuminance: number;
  isObstructed: boolean;
  isFrozen: boolean;
  headPose?: HeadPoseTelemetry;
  tier?: 'NORMAL' | 'WARNING' | 'REVIEW';
}

export interface DetectorOptions {
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  candidateName: string;
  securitySettings?: Partial<SecuritySettings>;
  thresholds?: Partial<ProctoringThresholds>;
  onEventDetected: (event: Omit<ProctoringEvent, 'id' | 'timestamp' | 'reviewStatus'>) => void;
  onEventResolved?: (eventType: ProctoringEventType) => void;
  onFrameAnalyzed?: (telemetry: FrameTelemetry) => void;
}

interface FrameObservation {
  timestamp: number;
  rawFaceCount: number;
  yaw: number;
  pitch: number;
  roll: number;
  confidence: number;
  box?: BoundingBox;
  normalizedBox?: { x: number; y: number; width: number; height: number };
}

export class LocalProctorDetector {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private checkIntervalId: any = null;

  private isRunning: boolean = false;
  private options: DetectorOptions;
  private thresholds: ProctoringThresholds;

  // Temporal smoothing rolling buffer
  private rollingBuffer: FrameObservation[] = [];

  // Grace period & state tracking
  private trackingLossStartTime: number = 0;
  private sustainedLookingAwayStartTime: number = 0;
  private lastWarningEmitTime: Map<string, number> = new Map();
  private lastReviewEventEmitTime: Map<string, number> = new Map();
  private currentHeadPoseState: 'NORMAL' | 'LOOKING_AWAY' | 'TRACKING_LOST' = 'NORMAL';

  // State trackers for temporal debouncing
  private activeConditions: Map<ProctoringEventType, { startTime: number; durationSeconds: number }> = new Map();
  private consecutiveNoPersonFrames: number = 0;
  private consecutiveMultiplePersonsFrames: number = 0;
  private consecutiveObstructedFrames: number = 0;
  private consecutiveFrozenFrames: number = 0;

  // Native browser FaceDetector (Shape Detection API) when available
  private nativeFaceDetector: any = null;
  private latestNativeFaces: Array<{
    box: BoundingBox;
    landmarks?: Array<{ type: string; locations: Array<{ x: number; y: number }> }>;
  }> = [];
  private latestNativeDetectionAt = 0;

  // Leaky bucket confidence score for mobile device detection
  private phoneConfidenceScore: number = 0;
  private lastDetectedPhoneBox: BoundingBox | undefined = undefined;
  private phoneSuppressedUntil: number = 0;
  private multiplePersonsSuppressedUntil: number = 0;

  private lastFrameBuffer: Uint8ClampedArray | null = null;
  private lastSmoothedFaceBox: BoundingBox | undefined = undefined;

  // Manual simulation overrides for testing
  private simulatedLookingAway: { enabled: boolean; yaw: number; pitch: number } = {
    enabled: false,
    yaw: 0,
    pitch: 0,
  };

  constructor(options: DetectorOptions) {
    this.options = options;
    this.thresholds = {
      ...getProctoringThresholds(options.securitySettings),
      ...(options.thresholds || {}),
    };
  }

  public getThresholds(): ProctoringThresholds {
    return { ...this.thresholds };
  }

  public setThresholds(overrides: Partial<ProctoringThresholds>) {
    this.thresholds = { ...this.thresholds, ...overrides };
  }

  /**
   * Reset phone detection state and clear active condition
   */
  public resetPhoneState() {
    this.phoneConfidenceScore = 0;
    this.lastDetectedPhoneBox = undefined;
    this.phoneSuppressedUntil = 0;
    (window as any).__SIMULATE_PHONE_DETECTION__ = false;
    this.resolveCondition('PHONE_DETECTED');
  }

  /**
   * Simulation test methods for instant manual or automated verification
   */
  public simulateNoFace(enable: boolean = true) {
    (window as any).__SIMULATE_NO_FACE__ = enable;
    if (enable) {
      (window as any).__SIMULATE_MULTIPLE_PERSONS__ = false;
      this.consecutiveNoPersonFrames = 9;
      this.trackingLossStartTime = Date.now() - (this.thresholds.trackingLossGraceMs + 1000);
    } else {
      this.consecutiveNoPersonFrames = 0;
      this.trackingLossStartTime = 0;
      this.resolveCondition('NO_FACE');
    }
  }

  public simulateMultipleFaces(enable: boolean = true) {
    (window as any).__SIMULATE_MULTIPLE_PERSONS__ = enable;
    if (enable) {
      (window as any).__SIMULATE_NO_FACE__ = false;
      this.consecutiveMultiplePersonsFrames = 7;
    } else {
      this.consecutiveMultiplePersonsFrames = 0;
      this.resolveCondition('MULTIPLE_FACES');
    }
  }

  public simulateLookingAway(enable: boolean = true, yaw: number = 45, pitch: number = 0) {
    this.simulatedLookingAway = { enabled: enable, yaw, pitch };
    if (!enable) {
      this.sustainedLookingAwayStartTime = 0;
      this.resolveCondition('LOOKING_AWAY');
    }
  }

  public simulatePhone(enable: boolean = true) {
    (window as any).__SIMULATE_PHONE_DETECTION__ = enable;
    if (enable) {
      this.phoneConfidenceScore = 10;
    } else {
      this.resetPhoneState();
    }
  }

  public resetAllSimulations() {
    (window as any).__SIMULATE_NO_FACE__ = false;
    (window as any).__SIMULATE_MULTIPLE_PERSONS__ = false;
    (window as any).__SIMULATE_PHONE_DETECTION__ = false;
    this.simulatedLookingAway = { enabled: false, yaw: 0, pitch: 0 };
    this.phoneConfidenceScore = 0;
    this.lastDetectedPhoneBox = undefined;
    this.consecutiveNoPersonFrames = 0;
    this.consecutiveMultiplePersonsFrames = 0;
    this.trackingLossStartTime = 0;
    this.sustainedLookingAwayStartTime = 0;
    this.resolveCondition('PHONE_DETECTED');
    this.resolveCondition('NO_FACE');
    this.resolveCondition('MULTIPLE_FACES');
    this.resolveCondition('LOOKING_AWAY');
  }

  /**
   * Suppress phone detection temporarily (e.g., when candidate dismisses false positive)
   */
  public suppressPhoneDetection(durationMs: number = 15000) {
    this.phoneSuppressedUntil = Date.now() + durationMs;
    this.phoneConfidenceScore = 0;
    this.lastDetectedPhoneBox = undefined;
    (window as any).__SIMULATE_PHONE_DETECTION__ = false;
    this.resolveCondition('PHONE_DETECTED');
  }

  /**
   * Suppress multi-person detection temporarily (e.g., when candidate dismisses false positive)
   */
  public suppressMultiplePersons(durationMs: number = 20000) {
    this.multiplePersonsSuppressedUntil = Date.now() + durationMs;
    this.consecutiveMultiplePersonsFrames = 0;
    (window as any).__SIMULATE_MULTIPLE_PERSONS__ = false;
    this.resolveCondition('MULTIPLE_FACES');
  }

  public resetMultiPersonState() {
    this.multiplePersonsSuppressedUntil = 0;
    this.consecutiveMultiplePersonsFrames = 0;
    (window as any).__SIMULATE_MULTIPLE_PERSONS__ = false;
    this.resolveCondition('MULTIPLE_FACES');
  }

  public start(stream: MediaStream) {
    if (this.isRunning) this.stop();

    this.stream = stream;
    this.isRunning = true;

    if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);
    }

    if (!this.canvasElement) {
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 320;
      this.canvasElement.height = 240;
      this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });
    }

    if (typeof (window as any).FaceDetector === 'function') {
      try {
        this.nativeFaceDetector = new (window as any).FaceDetector({ fastMode: true, maxFaces: 5 });
      } catch {
        this.nativeFaceDetector = null;
      }
    }

    this.videoElement.srcObject = stream;
    this.videoElement.play().catch(() => {});

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.emitEvent('CAMERA_DISABLED', 'HIGH', { reason: 'Camera track ended' });
      };
    }

    // Run processing loop at ~4.5 FPS (every 220ms) to conserve CPU
    this.checkIntervalId = setInterval(() => {
      this.processFrame();
    }, 220);
  }

  private processFrame() {
    if (!this.isRunning || !this.videoElement || !this.canvasCtx || !this.canvasElement || !this.stream) {
      return;
    }

    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live' || !videoTrack.enabled) {
      this.triggerCondition('CAMERA_DISABLED', 'HIGH', { detail: 'Camera track disabled or disconnected' });
      return;
    } else {
      this.resolveCondition('CAMERA_DISABLED');
    }

    if (this.videoElement.readyState < 2) {
      return;
    }

    const width = 320;
    const height = 240;
    this.canvasCtx.drawImage(this.videoElement, 0, 0, width, height);

    if (this.nativeFaceDetector && this.canvasElement) {
      this.nativeFaceDetector
        .detect(this.canvasElement)
        .then((faces: any[]) => {
          if (faces && Array.isArray(faces)) {
            this.latestNativeFaces = faces.map((f: any) => ({
              box: {
                x: Math.round(f.boundingBox.x),
                y: Math.round(f.boundingBox.y),
                width: Math.round(f.boundingBox.width),
                height: Math.round(f.boundingBox.height),
                confidence: 0.96,
              },
              landmarks: f.landmarks,
            }));
            this.latestNativeDetectionAt = Date.now();
          }
        })
        .catch(() => {});
    }

    let frameData: ImageData;
    try {
      frameData = this.canvasCtx.getImageData(0, 0, width, height);
    } catch {
      return;
    }

    this.analyzeFrameData(frameData.data, width, height, Date.now());
  }

  /**
   * Deterministic frame analysis pipeline suitable for both live camera feed and test harnesses
   */
  public analyzeFrameData(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    now: number = Date.now()
  ): FrameTelemetry {
    const totalPixels = width * height;

    // 1. LUMINANCE & OBSTRUCTION DETECTION (Rate-controlled)
    let totalLuminance = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const avgLuminance = totalLuminance / (totalPixels / 4);

    if (avgLuminance < 12) {
      this.consecutiveObstructedFrames++;
      const obstructedDurationMs = this.consecutiveObstructedFrames * 220;
      if (obstructedDurationMs >= this.thresholds.cameraObstructionDurationMs) {
        this.triggerCondition('CAMERA_OBSTRUCTED', 'HIGH', {
          avgLuminance: Math.round(avgLuminance),
          isAdvisory: true,
        });
      }
    } else {
      this.consecutiveObstructedFrames = 0;
      this.resolveCondition('CAMERA_OBSTRUCTED');
    }

    // 2. VIDEO FREEZE DETECTION
    if (this.lastFrameBuffer) {
      let diff = 0;
      const step = 64;
      for (let i = 0; i < pixels.length; i += step) {
        diff += Math.abs(pixels[i] - this.lastFrameBuffer[i]);
      }
      if (diff < 50) {
        this.consecutiveFrozenFrames++;
        const freezeDurationMs = this.consecutiveFrozenFrames * 220;
        if (freezeDurationMs >= this.thresholds.videoFreezeDurationMs) {
          this.triggerCondition('VIDEO_FROZEN', 'MEDIUM', {
            freezeDurationSec: Math.round(freezeDurationMs / 1000),
            isAdvisory: true,
          });
        }
      } else {
        this.consecutiveFrozenFrames = 0;
        this.resolveCondition('VIDEO_FROZEN');
      }
    }
    this.lastFrameBuffer = new Uint8ClampedArray(pixels);

    // 3. FACE & HEAD-POSE DETECTION
    const rawFaceResult = this.detectFacesFromFrame(pixels, width, height);
    const rawFaceCount = rawFaceResult.count;
    const rawBox = rawFaceResult.box;

    let rawYaw = 0;
    let rawPitch = 0;
    let rawRoll = 0;
    let rawConfidence = rawBox ? rawBox.confidence : 0;

    // Simulation override if active
    if (this.simulatedLookingAway.enabled) {
      rawYaw = this.simulatedLookingAway.yaw;
      rawPitch = this.simulatedLookingAway.pitch;
      rawConfidence = 0.95;
    } else if (rawBox && rawFaceCount === 1) {
      // Estimate scale-invariant head pose
      const pose = this.estimateHeadPose(pixels, width, height, rawBox);
      rawYaw = pose.yaw;
      rawPitch = pose.pitch;
      rawRoll = pose.roll;
      rawConfidence = pose.confidence;
    }

    // 4. TEMPORAL SMOOTHING VIA ROLLING BUFFER
    const normalizedBox = rawBox
      ? {
          x: Number((rawBox.x / width).toFixed(4)),
          y: Number((rawBox.y / height).toFixed(4)),
          width: Number((rawBox.width / width).toFixed(4)),
          height: Number((rawBox.height / height).toFixed(4)),
        }
      : undefined;

    this.rollingBuffer.push({
      timestamp: now,
      rawFaceCount,
      yaw: rawYaw,
      pitch: rawPitch,
      roll: rawRoll,
      confidence: rawConfidence,
      box: rawBox,
      normalizedBox,
    });

    if (this.rollingBuffer.length > this.thresholds.temporalWindowSize) {
      this.rollingBuffer.shift();
    }

    // Calculate moving averages across buffer
    const validSamples = this.rollingBuffer.filter((s) => s.rawFaceCount > 0);
    const hasValidRecentFace = validSamples.length > 0;

    const smoothedYaw = hasValidRecentFace
      ? Math.round(validSamples.reduce((sum, s) => sum + s.yaw, 0) / validSamples.length)
      : rawYaw;

    const smoothedPitch = hasValidRecentFace
      ? Math.round(validSamples.reduce((sum, s) => sum + s.pitch, 0) / validSamples.length)
      : rawPitch;

    const smoothedRoll = hasValidRecentFace
      ? Math.round(validSamples.reduce((sum, s) => sum + s.roll, 0) / validSamples.length)
      : rawRoll;

    const smoothedConfidence = hasValidRecentFace
      ? Number((validSamples.reduce((sum, s) => sum + s.confidence, 0) / validSamples.length).toFixed(2))
      : 0;

    // Smooth bounding box to reduce jitter
    let smoothedBox: BoundingBox | undefined = rawBox;
    if (validSamples.length >= 2 && rawBox) {
      const avgX = Math.round(validSamples.reduce((acc, s) => acc + (s.box?.x || 0), 0) / validSamples.length);
      const avgY = Math.round(validSamples.reduce((acc, s) => acc + (s.box?.y || 0), 0) / validSamples.length);
      const avgW = Math.round(validSamples.reduce((acc, s) => acc + (s.box?.width || 0), 0) / validSamples.length);
      const avgH = Math.round(validSamples.reduce((acc, s) => acc + (s.box?.height || 0), 0) / validSamples.length);
      smoothedBox = {
        x: avgX,
        y: avgY,
        width: avgW,
        height: avgH,
        confidence: smoothedConfidence,
      };
    }
    if (smoothedBox) {
      this.lastSmoothedFaceBox = smoothedBox;
    }

    // 5. HYSTERESIS & GRACE PERIOD LOGIC
    let stabilizedFaceCount = 1;
    let tier: 'NORMAL' | 'WARNING' | 'REVIEW' = 'NORMAL';

    if (rawFaceCount === 0) {
      if (this.trackingLossStartTime === 0) {
        this.trackingLossStartTime = now;
      }
      const lossDurationMs = now - this.trackingLossStartTime;

      if (lossDurationMs < this.thresholds.trackingLossGraceMs) {
        // Within grace period (e.g. blinking, sneezing, looking down at keyboard/notes)
        // Maintain last known face presence without penalizing candidate
        stabilizedFaceCount = 1;
        this.currentHeadPoseState = 'NORMAL';
        tier = 'NORMAL';
      } else {
        // Sustained absence past grace period
        stabilizedFaceCount = 0;
        this.currentHeadPoseState = 'TRACKING_LOST';
        this.consecutiveNoPersonFrames++;
        this.consecutiveMultiplePersonsFrames = 0;
        this.resolveCondition('MULTIPLE_FACES');
        this.resolveCondition('LOOKING_AWAY');

        const sustainedSec = Math.round(lossDurationMs / 1000);
        tier = sustainedSec >= 10 ? 'REVIEW' : 'WARNING';

        // Emit rate-controlled advisory/review event
        this.emitTieredCondition('NO_FACE', tier, {
          personCount: 0,
          noFaceDurationSec: sustainedSec,
          isAdvisory: true,
          isWarningStrike: false,
          advisoryMessage: 'Please ensure your face is visible and centered in the camera frame.',
        });
      }
    } else if (rawFaceCount >= 2) {
      // Multiple persons detected
      this.trackingLossStartTime = 0;
      this.consecutiveNoPersonFrames = 0;
      this.consecutiveMultiplePersonsFrames++;
      this.resolveCondition('NO_FACE');
      this.resolveCondition('LOOKING_AWAY');

      stabilizedFaceCount = rawFaceCount;
      const multiDurationMs = this.consecutiveMultiplePersonsFrames * 220;

      if (multiDurationMs >= this.thresholds.multipleFacesDurationMs) {
        tier = multiDurationMs >= 8000 ? 'REVIEW' : 'WARNING';
        this.emitTieredCondition('MULTIPLE_FACES', tier, {
          personCount: rawFaceCount,
          confidence: 0.95,
          isAdvisory: true,
          isWarningStrike: false,
          advisoryMessage: 'Multiple people detected in camera feed. The exam requires you to be alone.',
        });
      }
    } else {
      // Exactly 1 person detected
      this.trackingLossStartTime = 0;
      this.consecutiveNoPersonFrames = 0;
      this.consecutiveMultiplePersonsFrames = 0;
      stabilizedFaceCount = 1;
      this.resolveCondition('NO_FACE');
      this.resolveCondition('MULTIPLE_FACES');

      // 6. EVALUATE HEAD POSE DEVIATION (YAW / PITCH) WITH HYSTERESIS
      const margin = this.thresholds.hysteresisMargin;
      const enterYawThresh = this.thresholds.maxYawDeg * (1 + margin);
      const exitYawThresh = this.thresholds.maxYawDeg * (1 - margin);
      const enterPitchThresh = this.thresholds.maxPitchDeg * (1 + margin);
      const exitPitchThresh = this.thresholds.maxPitchDeg * (1 - margin);

      const isExceedingEnter =
        Math.abs(smoothedYaw) > enterYawThresh ||
        smoothedPitch > enterPitchThresh ||
        smoothedPitch < -enterPitchThresh;

      const isWithinExit =
        Math.abs(smoothedYaw) < exitYawThresh &&
        Math.abs(smoothedPitch) < exitPitchThresh;

      if (isExceedingEnter) {
        if (this.sustainedLookingAwayStartTime === 0) {
          this.sustainedLookingAwayStartTime = now;
        }

        const lookingAwayDurationMs = now - this.sustainedLookingAwayStartTime;
        if (lookingAwayDurationMs >= this.thresholds.lookingAwayDurationMs) {
          this.currentHeadPoseState = 'LOOKING_AWAY';
          const sustainedSec = Math.round(lookingAwayDurationMs / 1000);
          tier = sustainedSec >= 12 ? 'REVIEW' : 'WARNING';

          this.emitTieredCondition('LOOKING_AWAY', tier, {
            yaw: smoothedYaw,
            pitch: smoothedPitch,
            durationSeconds: sustainedSec,
            isAdvisory: true,
            isWarningStrike: false,
            advisoryMessage: 'Please face the camera and keep your focus on the test screen.',
          });
        } else {
          // Looking away has not yet met the sustained duration requirement
          this.currentHeadPoseState = 'NORMAL';
          tier = 'NORMAL';
        }
      } else if (isWithinExit) {
        this.sustainedLookingAwayStartTime = 0;
        this.currentHeadPoseState = 'NORMAL';
        this.resolveCondition('LOOKING_AWAY');
        tier = 'NORMAL';
      } else {
        // In the hysteresis deadband: maintain current state
        if (this.currentHeadPoseState === 'LOOKING_AWAY') {
          tier = 'WARNING';
        } else {
          tier = 'NORMAL';
        }
      }
    }

    // 7. PHONE / MOBILE DEVICE DETECTION
    const phoneResult = this.detectPhoneInFrame(pixels, width, height, rawBox || this.lastSmoothedFaceBox);
    if (phoneResult.detected) {
      this.lastDetectedPhoneBox = phoneResult.box;
      this.phoneConfidenceScore = Math.min(12, this.phoneConfidenceScore + 2);
    } else {
      this.phoneConfidenceScore = Math.max(0, this.phoneConfidenceScore - 1);
      if (this.phoneConfidenceScore === 0) {
        this.lastDetectedPhoneBox = undefined;
      }
    }

    const isPhoneActive = this.phoneConfidenceScore >= 6;
    if (isPhoneActive) {
      this.triggerCondition('PHONE_DETECTED', 'HIGH', {
        confidence: phoneResult.confidence || 0.95,
        object: 'Mobile Phone / Smartphone',
        box: this.lastDetectedPhoneBox,
        isAdvisory: false,
        isWarningStrike: true,
      });
      tier = 'WARNING';
    } else {
      this.resolveCondition('PHONE_DETECTED');
    }

    // 8. COMPOSE TELEMETRY
    const isWithinAngleThresholds =
      Math.abs(smoothedYaw) <= this.thresholds.maxYawDeg &&
      Math.abs(smoothedPitch) <= this.thresholds.maxPitchDeg;

    const headPose: HeadPoseTelemetry = {
      yaw: smoothedYaw,
      pitch: smoothedPitch,
      roll: smoothedRoll,
      confidence: smoothedConfidence,
      state: this.currentHeadPoseState,
      isWithinThresholds: isWithinAngleThresholds,
      normalizedCoords: normalizedBox,
    };

    const telemetry: FrameTelemetry = {
      faceCount: stabilizedFaceCount,
      phoneDetected: isPhoneActive,
      phoneBox: isPhoneActive ? this.lastDetectedPhoneBox : undefined,
      faceBox: stabilizedFaceCount === 1 ? smoothedBox || this.lastSmoothedFaceBox : undefined,
      faceBoxes:
        stabilizedFaceCount >= 2
          ? rawFaceResult.boxes || (rawBox ? [rawBox] : undefined)
          : stabilizedFaceCount === 1 && (smoothedBox || this.lastSmoothedFaceBox)
          ? [smoothedBox || this.lastSmoothedFaceBox!]
          : undefined,
      avgLuminance: Math.round(avgLuminance),
      isObstructed: avgLuminance < 12,
      isFrozen: this.consecutiveFrozenFrames >= 20,
      headPose,
      tier,
    };

    if (this.options.onFrameAnalyzed) {
      this.options.onFrameAnalyzed(telemetry);
    }

    return telemetry;
  }

  /**
   * Scale-invariant head pose estimation using facial feature luminance distribution & landmarks
   */
  private estimateHeadPose(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    faceBox: BoundingBox
  ): { yaw: number; pitch: number; roll: number; confidence: number } {
    // Check if fresh native landmarks are available
    if (
      this.latestNativeFaces.length > 0 &&
      Date.now() - this.latestNativeDetectionAt <= 750
    ) {
      const primaryNative = this.latestNativeFaces[0];
      if (primaryNative.landmarks && primaryNative.landmarks.length >= 2) {
        const eyeLandmarks = primaryNative.landmarks.filter((l) => l.type === 'eye');
        const noseLandmark = primaryNative.landmarks.find((l) => l.type === 'nose');

        if (eyeLandmarks.length >= 2 && noseLandmark && eyeLandmarks[0].locations[0] && eyeLandmarks[1].locations[0]) {
          const loc1 = eyeLandmarks[0].locations[0];
          const loc2 = eyeLandmarks[1].locations[0];
          const leftEye = loc1.x < loc2.x ? loc1 : loc2;
          const rightEye = loc1.x < loc2.x ? loc2 : loc1;
          const nose = noseLandmark.locations[0];

          const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
          const eyeMidX = (leftEye.x + rightEye.x) / 2;
          const eyeMidY = (leftEye.y + rightEye.y) / 2;

          if (eyeDist > 5) {
            const rawYawNorm = (nose.x - eyeMidX) / (eyeDist * 0.5);
            const yaw = Math.max(-80, Math.min(80, Math.round(rawYawNorm * 42)));

            const rawPitchNorm = (nose.y - eyeMidY) / Math.max(1, faceBox.height * 0.35) - 0.7;
            const pitch = Math.max(-55, Math.min(55, Math.round(rawPitchNorm * 45)));

            const roll = Math.round(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI));

            return { yaw, pitch, roll, confidence: 0.95 };
          }
        }
      }
    }

    // Computer vision fallback: normalized feature distribution inside face bounding box
    const startX = Math.max(0, faceBox.x);
    const startY = Math.max(0, faceBox.y);
    const boxW = Math.min(width - startX, faceBox.width);
    const boxH = Math.min(height - startY, faceBox.height);

    if (boxW < 10 || boxH < 10) {
      return { yaw: 0, pitch: 0, roll: 0, confidence: 0.5 };
    }

    // Examine eye socket / nasal bridge horizontal balance (top 20% to 50% of face)
    const upperY = Math.round(startY + boxH * 0.18);
    const lowerY = Math.round(startY + boxH * 0.52);
    let weightedXSum = 0;
    let weightedYSum = 0;
    let totalDarkness = 0;

    for (let y = upperY; y <= lowerY; y += 2) {
      for (let x = startX; x <= startX + boxW; x += 2) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Dark facial features (eyes, pupils, brows, bridge shadow)
        const darkness = Math.max(0, 180 - lum);
        if (darkness > 35) {
          const relX = (x - startX) / boxW; // 0 to 1
          const relY = (y - startY) / boxH; // 0 to 1
          weightedXSum += relX * darkness;
          weightedYSum += relY * darkness;
          totalDarkness += darkness;
        }
      }
    }

    if (totalDarkness < 50) {
      return { yaw: 0, pitch: 0, roll: 0, confidence: 0.7 };
    }

    const featureCenterX = weightedXSum / totalDarkness; // 0.5 is centered
    const featureCenterY = weightedYSum / totalDarkness; // ~0.35 is neutral

    // Invariant yaw: deviation from horizontal midpoint
    const yaw = Math.max(-75, Math.min(75, Math.round((featureCenterX - 0.5) * 85)));

    // Invariant pitch: deviation from vertical feature midline
    const pitch = Math.max(-50, Math.min(50, Math.round((featureCenterY - 0.35) * 80)));

    return { yaw, pitch, roll: 0, confidence: 0.88 };
  }

  /**
   * Smartphone detection: Comprehensive visual detector
   */
  private detectPhoneInFrame(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    faceBox?: BoundingBox
  ): { detected: boolean; box?: BoundingBox; confidence: number } {
    if (Date.now() < this.phoneSuppressedUntil) {
      return { detected: false, confidence: 0 };
    }

    if ((window as any).__SIMULATE_PHONE_DETECTION__) {
      return {
        detected: true,
        box: {
          x: Math.round(width * 0.55),
          y: Math.round(height * 0.45),
          width: Math.round(width * 0.35),
          height: Math.round(height * 0.28),
          confidence: 0.98,
        },
        confidence: 0.98,
      };
    }

    const blockW = 10;
    const blockH = 10;
    const cols = Math.floor(width / blockW);
    const rows = Math.floor(height / blockH);

    const isPhoneCandidate = new Uint8Array(cols * rows);
    const isSkinBlock = new Uint8Array(cols * rows);

    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        let blockLuminance = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let skinSamples = 0;
        const totalSamples = 9;

        for (let dy = 2; dy <= 8; dy += 3) {
          for (let dx = 2; dx <= 8; dx += 3) {
            const px = c * blockW + dx;
            const py = r * blockH + dy;
            const idx = (py * width + px) * 4;
            const red = pixels[idx];
            const grn = pixels[idx + 1];
            const blu = pixels[idx + 2];
            const lum = 0.299 * red + 0.587 * grn + 0.114 * blu;
            blockLuminance += lum;
            rSum += red;
            gSum += grn;
            bSum += blu;

            if (
              red > 55 &&
              grn > 35 &&
              blu > 20 &&
              red > grn &&
              grn > blu &&
              red - grn > 10 &&
              red - blu > 14
            ) {
              skinSamples++;
            }
          }
        }

        const avgLum = blockLuminance / totalSamples;
        const avgR = rSum / totalSamples;
        const avgG = gSum / totalSamples;
        const avgB = bSum / totalSamples;
        const cellIdx = r * cols + c;

        if (skinSamples >= 4) {
          isSkinBlock[cellIdx] = 1;
        } else {
          const isDarkPhoneBody =
            avgLum >= 8 &&
            avgLum <= 115 &&
            Math.abs(avgR - avgG) < 32 &&
            Math.abs(avgG - avgB) < 32 &&
            Math.abs(avgR - avgB) < 36 &&
            !(avgR > 130 && avgG < 80);

          const isIlluminatedScreen =
            avgLum >= 125 &&
            (avgLum > 160 || (avgB >= avgR - 15 && avgB >= avgG - 20));

          const isPhoneCase =
            avgLum >= 15 &&
            avgLum <= 150 &&
            Math.abs(avgR - avgG) < 65 &&
            Math.abs(avgG - avgB) < 65;

          if (isDarkPhoneBody || isIlluminatedScreen || isPhoneCase) {
            isPhoneCandidate[cellIdx] = 1;
          }
        }
      }
    }

    let bestCluster: {
      minC: number;
      maxC: number;
      minR: number;
      maxR: number;
      count: number;
      hasSkinGrip: boolean;
    } | null = null;

    const visited = new Uint8Array(cols * rows);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const startIdx = r * cols + c;
        if (isPhoneCandidate[startIdx] && !visited[startIdx]) {
          let minC = c;
          let maxC = c;
          let minR = r;
          let maxR = r;
          let count = 0;
          let skinTouching = false;
          let skinNearbyCount = 0;

          const queue = [startIdx];
          visited[startIdx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop()!;
            const currR = Math.floor(curr / cols);
            const currC = curr % cols;
            count++;

            minC = Math.min(minC, currC);
            maxC = Math.max(maxC, currC);
            minR = Math.min(minR, currR);
            maxR = Math.max(maxR, currR);

            const neighbors = [
              [currR - 1, currC],
              [currR + 1, currC],
              [currR, currC - 1],
              [currR, currC + 1],
            ];

            for (const [nr, nc] of neighbors) {
              if (nr >= 1 && nr < rows - 1 && nc >= 0 && nc < cols) {
                const nIdx = nr * cols + nc;
                if (isSkinBlock[nIdx]) {
                  skinTouching = true;
                  skinNearbyCount++;
                }
                if (isPhoneCandidate[nIdx] && !visited[nIdx]) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                }
              }
            }
          }

          const clusterW = maxC - minC + 1;
          const clusterH = maxR - minR + 1;
          const maxDim = Math.max(clusterW, clusterH);
          const minDim = Math.max(1, Math.min(clusterW, clusterH));
          const aspect = maxDim / minDim;
          const density = count / (clusterW * clusterH);

          const isClothingExtendingOffscreen = maxR >= rows - 1;
          const isLowerDeskOrTorso = maxR >= rows - 2 && !skinTouching;
          const isExcessiveSize = count > cols * rows * 0.3;

          let overlapsFace = false;
          if (faceBox) {
            const fbLeft = Math.floor(faceBox.x / blockW);
            const fbRight = Math.ceil((faceBox.x + faceBox.width) / blockW);
            const fbTop = Math.floor(faceBox.y / blockH);
            const fbBottom = Math.ceil((faceBox.y + faceBox.height) / blockH);
            if (minC <= fbRight && maxC >= fbLeft && minR <= fbBottom && maxR >= fbTop) {
              overlapsFace = true;
            }
          }

          const isPhoneAspectRatio = aspect >= 1.55 && aspect <= 2.65;
          const isPhoneSize =
            maxDim >= 8 &&
            maxDim <= 24 &&
            minDim >= 4 &&
            minDim <= 14 &&
            count >= 18;

          const isSolidShape = density >= 0.58;
          const hasSkinGrip = skinTouching && skinNearbyCount >= 2;

          if (
            !isClothingExtendingOffscreen &&
            !isLowerDeskOrTorso &&
            !overlapsFace &&
            !isExcessiveSize &&
            isPhoneAspectRatio &&
            isPhoneSize &&
            isSolidShape &&
            hasSkinGrip
          ) {
            const score = count * (hasSkinGrip ? 2 : 1);
            const bestScore = bestCluster ? bestCluster.count * (bestCluster.hasSkinGrip ? 2 : 1) : 0;

            if (!bestCluster || score > bestScore) {
              bestCluster = { minC, maxC, minR, maxR, count, hasSkinGrip };
            }
          }
        }
      }
    }

    if (bestCluster) {
      const boxW = (bestCluster.maxC - bestCluster.minC + 1) * blockW;
      const boxH = (bestCluster.maxR - bestCluster.minR + 1) * blockH;
      const boxX = bestCluster.minC * blockW;
      const boxY = bestCluster.minR * blockH;

      return {
        detected: true,
        box: {
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
          confidence: bestCluster.hasSkinGrip ? 0.96 : 0.88,
        },
        confidence: bestCluster.hasSkinGrip ? 0.96 : 0.88,
      };
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Spatial head/face cluster detection for 0, 1, or 2+ persons in frame
   */
  private detectFacesFromFrame(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
  ): { count: number; box?: BoundingBox; boxes?: BoundingBox[] } {
    if ((window as any).__SIMULATE_NO_FACE__) {
      return { count: 0 };
    }

    if ((window as any).__SIMULATE_MULTIPLE_PERSONS__) {
      const b1: BoundingBox = {
        x: Math.round(width * 0.15),
        y: Math.round(height * 0.22),
        width: Math.round(width * 0.35),
        height: Math.round(height * 0.48),
        confidence: 0.98,
      };
      const b2: BoundingBox = {
        x: Math.round(width * 0.55),
        y: Math.round(height * 0.18),
        width: Math.round(width * 0.32),
        height: Math.round(height * 0.46),
        confidence: 0.95,
      };
      return {
        count: 2,
        box: b1,
        boxes: [b1, b2],
      };
    }

    const hasFreshNativeResult = Date.now() - this.latestNativeDetectionAt <= 750;
    if (hasFreshNativeResult) {
      if (Date.now() < this.multiplePersonsSuppressedUntil && this.latestNativeFaces.length > 1) {
        return {
          count: 1,
          box: this.latestNativeFaces[0].box,
          boxes: [this.latestNativeFaces[0].box],
        };
      }
      return {
        count: this.latestNativeFaces.length,
        box: this.latestNativeFaces[0]?.box,
        boxes: this.latestNativeFaces.map((f) => f.box),
      };
    }

    const gridCols = 16;
    const gridRows = 12;
    const cellWidth = width / gridCols;
    const cellHeight = height / gridRows;

    const cellSkin = new Uint16Array(gridCols * gridRows);
    let totalSkinCount = 0;

    for (let y = 0; y < height; y += 2) {
      const row = Math.floor(y / cellHeight);
      for (let x = 0; x < width; x += 2) {
        const col = Math.floor(x / cellWidth);
        const cellIdx = row * gridCols + col;
        const i = (y * width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        const rgbSum = r + g + b;
        const normR = rgbSum > 0 ? r / rgbSum : 0;
        const normG = rgbSum > 0 ? g / rgbSum : 0;

        const isSkinYCbCr = Y >= 20 && Cb >= 72 && Cb <= 140 && Cr >= 126 && Cr <= 186;
        const isSkinRGB =
          r > 35 &&
          g > 20 &&
          b > 15 &&
          r >= g &&
          r - g >= 3 &&
          r - b >= 6 &&
          normR >= 0.32 &&
          normR <= 0.62 &&
          normG >= 0.2 &&
          normG <= 0.4;

        if (isSkinYCbCr || isSkinRGB) {
          cellSkin[cellIdx]++;
          totalSkinCount++;
        }
      }
    }

    if (totalSkinCount < 40) {
      return { count: 0 };
    }

    const visited = new Uint8Array(gridCols * gridRows);
    interface FaceCluster {
      skinMass: number;
      centroidC: number;
      centroidR: number;
      box: BoundingBox;
    }
    const clusters: FaceCluster[] = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const idx = r * gridCols + c;
        if (visited[idx] || cellSkin[idx] < 5) continue;

        const queue = [{ r, c }];
        visited[idx] = 1;
        let cellCount = 0;
        let minC = c,
          maxC = c,
          minR = r,
          maxR = r;
        let skinMass = 0;
        let weightedC = 0,
          weightedR = 0;

        let qIdx = 0;
        while (qIdx < queue.length) {
          const curr = queue[qIdx++];
          cellCount++;
          const s = cellSkin[curr.r * gridCols + curr.c];
          skinMass += s;
          weightedC += curr.c * s;
          weightedR += curr.r * s;

          if (curr.c < minC) minC = curr.c;
          if (curr.c > maxC) maxC = curr.c;
          if (curr.r < minR) minR = curr.r;
          if (curr.r > maxR) maxR = curr.r;

          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = curr.r + dr;
              const nc = curr.c + dc;
              if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols) {
                const nIdx = nr * gridCols + nc;
                if (!visited[nIdx] && cellSkin[nIdx] >= 4) {
                  visited[nIdx] = 1;
                  queue.push({ r: nr, c: nc });
                }
              }
            }
          }
        }

        if (cellCount >= 2 && skinMass >= 18) {
          const centroidC = weightedC / skinMass;
          const centroidR = weightedR / skinMass;

          if (minR >= gridRows - 2 && skinMass < 40) {
            continue;
          }

          const boxW = Math.round((maxC - minC + 1.2) * cellWidth);
          const boxH = Math.round((maxR - minR + 1.5) * cellHeight);
          const boxX = Math.max(0, Math.round((minC - 0.2) * cellWidth));
          const boxY = Math.max(0, Math.round((minR - 0.5) * cellHeight));

          const box: BoundingBox = {
            x: boxX,
            y: boxY,
            width: Math.min(width - boxX, boxW),
            height: Math.min(height - boxY, boxH),
            confidence: 0.94,
          };

          clusters.push({ skinMass, centroidC, centroidR, box });
        }
      }
    }

    clusters.sort((a, b) => b.skinMass - a.skinMass);

    if (clusters.length === 0) {
      return { count: 0 };
    }

    if (Date.now() < this.multiplePersonsSuppressedUntil) {
      return {
        count: 1,
        box: clusters[0].box,
        boxes: [clusters[0].box],
      };
    }

    if (clusters.length >= 2) {
      const c1 = clusters[0];
      const c2 = clusters[1];
      const colSeparation = Math.abs(c1.centroidC - c2.centroidC) * cellWidth;
      const rowSeparation = Math.abs(c1.centroidR - c2.centroidR) * cellHeight;
      const spatialDist = Math.hypot(colSeparation, rowSeparation);

      const isSecondPerson =
        spatialDist >= 45 &&
        c2.skinMass >= 25 &&
        c2.skinMass >= c1.skinMass * 0.18 &&
        c2.centroidR <= gridRows * 0.88 &&
        c2.box.width >= 30 &&
        c2.box.height >= 35;

      if (isSecondPerson) {
        return {
          count: 2,
          box: c1.box,
          boxes: [c1.box, c2.box],
        };
      }
    }

    return {
      count: 1,
      box: clusters[0].box,
      boxes: [clusters[0].box],
    };
  }

  /**
   * Rate-limited tiered condition emitter: separates Normal, Advisory Warning, and Review Events
   */
  private emitTieredCondition(
    type: ProctoringEventType,
    tier: 'NORMAL' | 'WARNING' | 'REVIEW',
    metadata?: Record<string, any>
  ) {
    if (tier === 'NORMAL') return;

    const now = Date.now();
    const eventKey = `${type}_${tier}`;

    if (tier === 'WARNING') {
      const lastWarn = this.lastWarningEmitTime.get(type) || 0;
      if (now - lastWarn < this.thresholds.warningCooldownMs) {
        return; // Suppressed by warning cooldown
      }
      this.lastWarningEmitTime.set(type, now);
      this.triggerCondition(type, 'LOW', {
        ...metadata,
        isAdvisory: true,
        isWarningStrike: false,
        tier: 'WARNING',
      });
    } else if (tier === 'REVIEW') {
      const lastRev = this.lastReviewEventEmitTime.get(type) || 0;
      if (now - lastRev < this.thresholds.reviewEventMinIntervalMs) {
        return; // Suppressed by review event rate-limit
      }
      this.lastReviewEventEmitTime.set(type, now);
      this.triggerCondition(type, 'MEDIUM', {
        ...metadata,
        isReviewEvent: true,
        isWarningStrike: false,
        reviewStatus: 'NEEDS_INVESTIGATION',
        tier: 'REVIEW',
      });
    }
  }

  private triggerCondition(
    type: ProctoringEventType,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    metadata?: Record<string, any>
  ) {
    const sec = this.options.securitySettings;
    if (sec) {
      if (sec.enableCamera === false) return;
      if (type === 'CAMERA_DISABLED' && sec.detectCameraDisabled === false) return;
      if (type === 'CAMERA_OBSTRUCTED' && sec.detectCameraObstruction === false) return;
      if (type === 'VIDEO_FROZEN' && sec.detectVideoFreeze === false) return;
      if (type === 'NO_FACE' && sec.detectNoFace === false) return;
      if (type === 'MULTIPLE_FACES' && sec.detectMultipleFaces === false) return;
      if (type === 'LOOKING_AWAY' && sec.detectLookingAway === false) return;
    }

    const existing = this.activeConditions.get(type);
    const now = Date.now();

    if (!existing) {
      this.activeConditions.set(type, { startTime: now, durationSeconds: 0 });
      this.emitEvent(type, severity, { ...metadata, conditionState: 'STARTED' });
    } else {
      const duration = Math.round((now - existing.startTime) / 1000);
      existing.durationSeconds = duration;
      if (duration > 0 && duration % 10 === 0) {
        this.emitEvent(type, severity, { ...metadata, durationSeconds: duration, conditionState: 'CONTINUING' });
      }
    }
  }

  private resolveCondition(type: ProctoringEventType) {
    const existing = this.activeConditions.get(type);
    if (existing) {
      const duration = Math.round((Date.now() - existing.startTime) / 1000);
      this.activeConditions.delete(type);
      if (this.options.onEventResolved) {
        this.options.onEventResolved(type);
      }
      this.emitEvent(type, 'LOW', { durationSeconds: duration, conditionState: 'RESOLVED' });
    }
  }

  private emitEvent(
    type: ProctoringEventType,
    severity: 'LOW' | 'MEDIUM' | 'HIGH',
    metadata?: Record<string, any>
  ) {
    this.options.onEventDetected({
      sessionId: this.options.sessionId,
      assessmentId: this.options.assessmentId,
      candidateId: this.options.candidateId,
      candidateName: this.options.candidateName,
      type,
      severity,
      metadata,
    });
  }

  public stop() {
    this.isRunning = false;

    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }

    this.canvasElement = null;
    this.canvasCtx = null;
    this.stream = null;
    this.activeConditions.clear();
    this.rollingBuffer = [];
  }
}
