import { ProctoringEvent, ProctoringEventType, SecuritySettings } from '../types';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
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
}

export interface DetectorOptions {
  sessionId: string;
  assessmentId: string;
  candidateId: string;
  candidateName: string;
  securitySettings?: Partial<SecuritySettings>;
  onEventDetected: (event: Omit<ProctoringEvent, 'id' | 'timestamp' | 'reviewStatus'>) => void;
  onEventResolved?: (eventType: ProctoringEventType) => void;
  onFrameAnalyzed?: (telemetry: FrameTelemetry) => void;
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

  // State trackers for temporal debouncing
  private activeConditions: Map<ProctoringEventType, { startTime: number; durationSeconds: number }> = new Map();
  private consecutiveNoPersonFrames: number = 0;
  private consecutiveMultiplePersonsFrames: number = 0;
  private consecutiveObstructedFrames: number = 0;
  private consecutiveFrozenFrames: number = 0;

  // Native browser FaceDetector (Shape Detection API) when available
  private nativeFaceDetector: any = null;
  private latestNativeFaces: BoundingBox[] = [];
  private latestNativeDetectionAt = 0;

  // Leaky bucket confidence score for mobile device detection
  private phoneConfidenceScore: number = 0;
  private lastDetectedPhoneBox: BoundingBox | undefined = undefined;
  private phoneSuppressedUntil: number = 0;
  private multiplePersonsSuppressedUntil: number = 0;

  private lastFrameBuffer: Uint8ClampedArray | null = null;
  private lastFrameTime: number = Date.now();

  constructor(options: DetectorOptions) {
    this.options = options;
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
      this.consecutiveNoPersonFrames = 9; // trigger quickly
    } else {
      this.consecutiveNoPersonFrames = 0;
      this.resolveCondition('NO_FACE');
    }
  }

  public simulateMultipleFaces(enable: boolean = true) {
    (window as any).__SIMULATE_MULTIPLE_PERSONS__ = enable;
    if (enable) {
      (window as any).__SIMULATE_NO_FACE__ = false;
      this.consecutiveMultiplePersonsFrames = 7; // trigger quickly
    } else {
      this.consecutiveMultiplePersonsFrames = 0;
      this.resolveCondition('MULTIPLE_FACES');
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
    this.phoneConfidenceScore = 0;
    this.lastDetectedPhoneBox = undefined;
    this.consecutiveNoPersonFrames = 0;
    this.consecutiveMultiplePersonsFrames = 0;
    this.resolveCondition('PHONE_DETECTED');
    this.resolveCondition('NO_FACE');
    this.resolveCondition('MULTIPLE_FACES');
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

  /**
   * Reset multi-person state
   */
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

    // Create offscreen video & canvas elements if needed
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

    // Monitor track health continuously
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.emitEvent('CAMERA_DISABLED', 'HIGH', { reason: 'Camera track ended' });
      };
    }

    // Run processing loop at ~4-5 FPS (every 220ms) to conserve CPU
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
      return; // Video not ready yet
    }

    // Draw frame to canvas at reduced resolution (320x240) for fast processing
    const width = 320;
    const height = 240;
    this.canvasCtx.drawImage(this.videoElement, 0, 0, width, height);

    // Run native browser FaceDetector asynchronously if available
    if (this.nativeFaceDetector && this.canvasElement) {
      this.nativeFaceDetector.detect(this.canvasElement).then((faces: any[]) => {
        if (faces && Array.isArray(faces)) {
          this.latestNativeFaces = faces.map((f: any) => ({
            x: Math.round(f.boundingBox.x),
            y: Math.round(f.boundingBox.y),
            width: Math.round(f.boundingBox.width),
            height: Math.round(f.boundingBox.height),
            confidence: 0.96,
          }));
          this.latestNativeDetectionAt = Date.now();
        }
      }).catch(() => {});
    }

    let frameData: ImageData;
    try {
      frameData = this.canvasCtx.getImageData(0, 0, width, height);
    } catch {
      return;
    }

    const pixels = frameData.data;
    const totalPixels = width * height;

    // 1. LUMINANCE & OBSTRUCTION DETECTION
    let totalLuminance = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
    }
    const avgLuminance = totalLuminance / (totalPixels / 4);

    if (avgLuminance < 12) {
      // Extremely dark / obstructed camera
      this.consecutiveObstructedFrames++;
      if (this.consecutiveObstructedFrames >= 6) { // ~1.5 seconds
        this.triggerCondition('CAMERA_OBSTRUCTED', 'HIGH', { avgLuminance: Math.round(avgLuminance) });
      }
    } else {
      this.consecutiveObstructedFrames = 0;
      this.resolveCondition('CAMERA_OBSTRUCTED');
    }

    // 2. VIDEO FREEZE DETECTION
    if (this.lastFrameBuffer) {
      let diff = 0;
      const step = 64; // Sample pixels for fast diffing
      for (let i = 0; i < pixels.length; i += step) {
        diff += Math.abs(pixels[i] - this.lastFrameBuffer[i]);
      }
      if (diff < 50) {
        this.consecutiveFrozenFrames++;
        if (this.consecutiveFrozenFrames >= 20) { // ~4.5 seconds
          this.triggerCondition('VIDEO_FROZEN', 'MEDIUM', { freezeDurationSec: 5 });
        }
      } else {
        this.consecutiveFrozenFrames = 0;
        this.resolveCondition('VIDEO_FROZEN');
      }
    }
    this.lastFrameBuffer = new Uint8ClampedArray(pixels);

    // 3. FACE & PERSON DETECTION (SKIN-TONE / CONTOUR / QUADRANT BLOB ANALYSIS)
    const faceResult = this.detectFacesFromFrame(pixels, width, height);
    const faceCount = faceResult.count;

    let stabilizedFaceCount = 1;

    if (faceCount === 0) {
      this.consecutiveNoPersonFrames++;
      this.consecutiveMultiplePersonsFrames = 0;
      this.resolveCondition('MULTIPLE_FACES');

      // Update telemetry within 2 frames (~440ms) of no face
      if (this.consecutiveNoPersonFrames >= 2) {
        stabilizedFaceCount = 0;
      } else {
        stabilizedFaceCount = 0;
      }

      // Trigger NO_FACE condition after sustained absence (~2.0 seconds / 9 frames)
      if (this.consecutiveNoPersonFrames >= 9) {
        const severity = this.consecutiveNoPersonFrames >= 20 ? 'HIGH' : 'MEDIUM';
        this.triggerCondition('NO_FACE', severity, {
          personCount: 0,
          noFaceDurationSec: Math.round(this.consecutiveNoPersonFrames * 0.22),
        });
      }
    } else if (faceCount >= 2) {
      this.consecutiveMultiplePersonsFrames++;
      this.consecutiveNoPersonFrames = 0;
      this.resolveCondition('NO_FACE');

      // Immediate telemetry for multi-person
      stabilizedFaceCount = faceCount;

      // Trigger MULTIPLE_FACES condition after sustained detection (~1.5s / 7 frames)
      if (this.consecutiveMultiplePersonsFrames >= 7) {
        this.triggerCondition('MULTIPLE_FACES', 'HIGH', {
          personCount: faceCount,
          confidence: 0.95,
        });
      }
    } else {
      // Exactly 1 person detected - NORMAL
      this.consecutiveNoPersonFrames = 0;
      this.consecutiveMultiplePersonsFrames = 0;
      stabilizedFaceCount = 1;
      this.resolveCondition('NO_FACE');
      this.resolveCondition('MULTIPLE_FACES');
    }

    // 4. PHONE / MOBILE DEVICE DETECTION
    const phoneResult = this.detectPhoneInFrame(pixels, width, height, faceResult.box);
    if (phoneResult.detected) {
      this.lastDetectedPhoneBox = phoneResult.box;
      this.phoneConfidenceScore = Math.min(12, this.phoneConfidenceScore + 2);
    } else {
      this.phoneConfidenceScore = Math.max(0, this.phoneConfidenceScore - 1);
      if (this.phoneConfidenceScore === 0) {
        this.lastDetectedPhoneBox = undefined;
      }
    }

    // Require sustained confidence (score >= 6, representing ~1.5s of sustained detection)
    const isPhoneActive = this.phoneConfidenceScore >= 6;
    if (isPhoneActive) {
      this.triggerCondition('PHONE_DETECTED', 'HIGH', {
        confidence: phoneResult.confidence || 0.95,
        object: 'Mobile Phone / Smartphone',
        box: this.lastDetectedPhoneBox,
      });
    } else {
      this.resolveCondition('PHONE_DETECTED');
    }

    // 5. Emit real-time frame telemetry to UI subscriber
    if (this.options.onFrameAnalyzed) {
      this.options.onFrameAnalyzed({
        faceCount: stabilizedFaceCount,
        phoneDetected: isPhoneActive,
        phoneBox: isPhoneActive ? this.lastDetectedPhoneBox : undefined,
        faceBox: stabilizedFaceCount === 1 ? faceResult.box : undefined,
        faceBoxes:
          stabilizedFaceCount >= 2
            ? faceResult.boxes || (faceResult.box ? [faceResult.box] : undefined)
            : stabilizedFaceCount === 1 && faceResult.box
            ? [faceResult.box]
            : undefined,
        avgLuminance: Math.round(avgLuminance),
        isObstructed: avgLuminance < 12,
        isFrozen: this.consecutiveFrozenFrames >= 20,
      });
    }
  }

  /**
   * Smartphone detection: Comprehensive visual detector that recognizes both dark chassis/back covers
   * (with camera modules/screen-off) and illuminated screens held horizontally or vertically in hands.
   */
  private detectPhoneInFrame(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    faceBox?: BoundingBox
  ): { detected: boolean; box?: BoundingBox; confidence: number } {
    // If phone detection is currently suppressed by user, skip
    if (Date.now() < this.phoneSuppressedUntil) {
      return { detected: false, confidence: 0 };
    }

    // 1. Explicit simulator trigger (via Test Phone button or demo stream)
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

    // 2. Real camera frame processing:
    const blockW = 10;
    const blockH = 10;
    const cols = Math.floor(width / blockW); // e.g. 32
    const rows = Math.floor(height / blockH); // e.g. 24

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

            // Skin tone validation (human hands/fingers/face)
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
          // A smartphone can be:
          // A) Dark matte black/grey phone body/chassis or turned-off screen (as held in hand)
          const isDarkPhoneBody =
            avgLum >= 8 &&
            avgLum <= 115 &&
            Math.abs(avgR - avgG) < 32 &&
            Math.abs(avgG - avgB) < 32 &&
            Math.abs(avgR - avgB) < 36 &&
            !(avgR > 130 && avgG < 80); // exclude reddish objects

          // B) Illuminated bright smartphone display
          const isIlluminatedScreen =
            avgLum >= 125 &&
            (avgLum > 160 || (avgB >= avgR - 15 && avgB >= avgG - 20));

          // C) Colored plastic/metallic phone case (e.g., navy blue, dark green, dark red)
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

    // Connected component search to find rectangular phone-like clusters
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

            // 4-connected neighbors for component expansion
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

          // Filtering rules:
          // 1. A candidate shirt/torso touches the bottom rows or candidate lap area
          const isClothingExtendingOffscreen = maxR >= rows - 1;
          const isLowerDeskOrTorso = maxR >= rows - 2 && !skinTouching;

          // 2. Reject full screen background or wall (covers too many blocks)
          const isExcessiveSize = count > cols * rows * 0.30;

          // 3. Reject if cluster overlaps with candidate's primary face box
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

          // 4. Aspect ratio validation:
          // Smartphones (horizontal or vertical) strictly have aspect ratios between 1.55 and 2.65
          const isPhoneAspectRatio = aspect >= 1.55 && aspect <= 2.65;

          // 5. Smartphone size bounds:
          // Genuine phone held in hand spans 8 to 24 blocks in major dimension (80px - 240px) and 4 to 14 in minor dimension (40px - 140px)
          const isPhoneSize =
            maxDim >= 8 &&
            maxDim <= 24 &&
            minDim >= 4 &&
            minDim <= 14 &&
            count >= 18;

          // 6. Solid density (phones are solid rectangles, density >= 0.58)
          const isSolidShape = density >= 0.58;

          // 7. Hand proximity / grip:
          // In real hand use, skin blocks touch the phone with multiple contact points
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
            // Prioritize hand-gripped clusters and larger matching clusters
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
   * High-accuracy 2D spatial head/face cluster detection for 0, 1, or 2+ persons in frame
   */
  private detectFacesFromFrame(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
  ): { count: number; box?: BoundingBox; boxes?: BoundingBox[] } {
    // 1. Simulation override for manual testing
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

    // 2. Browser native FaceDetector results if available
    const hasFreshNativeResult = Date.now() - this.latestNativeDetectionAt <= 750;
    if (hasFreshNativeResult) {
      if (Date.now() < this.multiplePersonsSuppressedUntil && this.latestNativeFaces.length > 1) {
        return {
          count: 1,
          box: this.latestNativeFaces[0],
          boxes: [this.latestNativeFaces[0]],
        };
      }
      return {
        count: this.latestNativeFaces.length,
        box: this.latestNativeFaces[0],
        boxes: this.latestNativeFaces,
      };
    }

    // 3. Robust 2D Spatial Grid & Skin / Face Contour Analysis
    // 16 cols x 12 rows on 320x240 image (cell size: 20x20 px)
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

        // Multi-color-space skin detection
        // YCbCr components
        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        // RGB Normalized components
        const rgbSum = r + g + b;
        const normR = rgbSum > 0 ? r / rgbSum : 0;
        const normG = rgbSum > 0 ? g / rgbSum : 0;

        const isSkinYCbCr =
          Y >= 20 &&
          Cb >= 72 && Cb <= 140 &&
          Cr >= 126 && Cr <= 186;

        const isSkinRGB =
          r > 35 && g > 20 && b > 15 &&
          r >= g &&
          (r - g) >= 3 &&
          (r - b) >= 6 &&
          normR >= 0.32 && normR <= 0.62 &&
          normG >= 0.20 && normG <= 0.40;

        if (isSkinYCbCr || isSkinRGB) {
          cellSkin[cellIdx]++;
          totalSkinCount++;
        }
      }
    }

    // Minimum skin area threshold for person presence
    if (totalSkinCount < 40) {
      return { count: 0 };
    }

    // 4. Connected Component Analysis to identify face/head clusters
    const visited = new Uint8Array(gridCols * gridRows);
    interface FaceCluster {
      cells: { r: number; c: number; skin: number }[];
      skinMass: number;
      minC: number;
      maxC: number;
      minR: number;
      maxR: number;
      centroidC: number;
      centroidR: number;
      box: BoundingBox;
    }
    const clusters: FaceCluster[] = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const idx = r * gridCols + c;
        if (visited[idx] || cellSkin[idx] < 5) continue;

        // BFS flood fill
        const queue = [{ r, c }];
        visited[idx] = 1;
        const compCells: { r: number; c: number; skin: number }[] = [];
        let minC = c, maxC = c, minR = r, maxR = r;
        let skinMass = 0;
        let weightedC = 0, weightedR = 0;

        let qIdx = 0;
        while (qIdx < queue.length) {
          const curr = queue[qIdx++];
          const s = cellSkin[curr.r * gridCols + curr.c];
          compCells.push({ r: curr.r, c: curr.c, skin: s });
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

        // A valid face cluster has at least 2 cells and sufficient skin mass
        if (compCells.length >= 2 && skinMass >= 18) {
          const centroidC = weightedC / skinMass;
          const centroidR = weightedR / skinMass;

          // Reject clusters located purely at the very bottom edge with no upper presence (hands / desk)
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

          clusters.push({
            cells: compCells,
            skinMass,
            minC,
            maxC,
            minR,
            maxR,
            centroidC,
            centroidR,
            box,
          });
        }
      }
    }

    // Sort clusters by skin mass descending
    clusters.sort((a, b) => b.skinMass - a.skinMass);

    if (clusters.length === 0) {
      return { count: 0 };
    }

    // If suppressed by candidate dismissal, force single-person output
    if (Date.now() < this.multiplePersonsSuppressedUntil) {
      return {
        count: 1,
        box: clusters[0].box,
        boxes: [clusters[0].box],
      };
    }

    // 5. Multiple Persons Verification
    if (clusters.length >= 2) {
      const c1 = clusters[0];
      const c2 = clusters[1];
      const colSeparation = Math.abs(c1.centroidC - c2.centroidC) * cellWidth;
      const rowSeparation = Math.abs(c1.centroidR - c2.centroidR) * cellHeight;
      const spatialDist = Math.hypot(colSeparation, rowSeparation);

      // Criteria for second person:
      // - Must have substantial skin mass
      // - Must be spatially distinct (dist >= 45px or colSeparation >= 35px)
      // - Must not be hands/lap resting at the very bottom (centroidR < gridRows * 0.88)
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

    // Exactly 1 person
    return {
      count: 1,
      box: clusters[0].box,
      boxes: [clusters[0].box],
    };
  }

  private triggerCondition(type: ProctoringEventType, severity: 'LOW' | 'MEDIUM' | 'HIGH', metadata?: Record<string, any>) {
    const sec = this.options.securitySettings;
    if (sec) {
      if (sec.enableCamera === false) return;
      if (type === 'CAMERA_DISABLED' && sec.detectCameraDisabled === false) return;
      if (type === 'CAMERA_OBSTRUCTED' && sec.detectCameraObstruction === false) return;
      if (type === 'VIDEO_FROZEN' && sec.detectVideoFreeze === false) return;
      if (type === 'NO_FACE' && sec.detectNoFace === false) return;
      if (type === 'MULTIPLE_FACES' && sec.detectMultipleFaces === false) return;
    }

    const existing = this.activeConditions.get(type);
    const now = Date.now();

    if (!existing) {
      this.activeConditions.set(type, { startTime: now, durationSeconds: 0 });
      this.emitEvent(type, severity, { ...metadata, conditionState: 'STARTED' });
    } else {
      const duration = Math.round((now - existing.startTime) / 1000);
      existing.durationSeconds = duration;
      // Emit updated event every 10s if sustained
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

  private emitEvent(type: ProctoringEventType, severity: 'LOW' | 'MEDIUM' | 'HIGH', metadata?: Record<string, any>) {
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
  }
}
