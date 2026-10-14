import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalProctorDetector } from '../proctorDetector';
import { DEFAULT_PROCTORING_THRESHOLDS, getProctoringThresholds } from '../proctorConfig';

function createSyntheticFrame(
  width: number = 320,
  height: number = 240,
  opts?: {
    skinPresent?: boolean;
    faceCenterRatioX?: number; // 0.5 is center, 0.3 is turned left, 0.7 is turned right
    faceCenterRatioY?: number; // 0.35 is neutral, 0.6 is looking down
    multipleFaces?: boolean;
    darkObstruction?: boolean;
  }
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);

  if (opts?.darkObstruction) {
    // Fill completely black / dark
    return pixels;
  }

  // Neutral background: grey
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 120;
    pixels[i + 1] = 120;
    pixels[i + 2] = 120;
    pixels[i + 3] = 255;
  }

  if (opts?.skinPresent !== false) {
    const faceW = 80;
    const faceH = 100;
    const centerX = Math.round(width * (opts?.faceCenterRatioX ?? 0.5));
    const centerY = Math.round(height * (opts?.faceCenterRatioY ?? 0.38));
    const startX = Math.max(0, centerX - faceW / 2);
    const startY = Math.max(0, centerY - faceH / 2);

    for (let y = startY; y < startY + faceH && y < height; y++) {
      for (let x = startX; x < startX + faceW && x < width; x++) {
        const idx = (y * width + x) * 4;
        // Typical skin tone (RGB: 210, 160, 130)
        pixels[idx] = 210;
        pixels[idx + 1] = 160;
        pixels[idx + 2] = 130;
        pixels[idx + 3] = 255;
      }
    }
  }

  return pixels;
}

test('Proctoring Thresholds Configuration', () => {
  const defaultThresholds = getProctoringThresholds();
  assert.equal(defaultThresholds.maxYawDeg, 35);
  assert.equal(defaultThresholds.maxPitchDeg, 28);
  assert.equal(defaultThresholds.trackingLossGraceMs, 3500);
  assert.equal(defaultThresholds.lookingAwayDurationMs, 4000);
  assert.equal(defaultThresholds.temporalWindowSize, 10);
  assert.equal(defaultThresholds.hysteresisMargin, 0.15);

  const customThresholds = getProctoringThresholds({
    proctoringThresholds: {
      maxYawDeg: 40,
      lookingAwayDurationMs: 5000,
    },
  });
  assert.equal(customThresholds.maxYawDeg, 40);
  assert.equal(customThresholds.lookingAwayDurationMs, 5000);
  assert.equal(customThresholds.trackingLossGraceMs, 3500); // Retains default
});

test('Scenario 1: Normal movements, slight head tilting, blinking, resting chin', () => {
  const detectedEvents: any[] = [];
  const analyzedTelemetry: any[] = [];

  const detector = new LocalProctorDetector({
    sessionId: 'sess-test-1',
    assessmentId: 'asm-test-1',
    candidateId: 'cand-test-1',
    candidateName: 'Test Student',
    onEventDetected: (evt) => detectedEvents.push(evt),
    onFrameAnalyzed: (t) => analyzedTelemetry.push(t),
  });

  const frameWidth = 320;
  const frameHeight = 240;
  const normalFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: true });

  let now = 10000;
  // 1. Process 10 normal centered frames
  for (let i = 0; i < 10; i++) {
    now += 220;
    const t = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
    assert.equal(t.faceCount, 1);
    assert.equal(t.tier, 'NORMAL');
  }

  // 2. Simulate momentary blink or brief tracking drop (< 1000ms < 3500ms grace period)
  const emptyFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: false });
  for (let i = 0; i < 4; i++) {
    now += 220;
    const t = detector.analyzeFrameData(emptyFrame, frameWidth, frameHeight, now);
    // In grace period, candidate presence is stabilized and NOT flagged as NO_FACE
    assert.equal(t.faceCount, 1);
    assert.equal(t.tier, 'NORMAL');
  }

  // 3. Normal face returns
  for (let i = 0; i < 5; i++) {
    now += 220;
    const t = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
    assert.equal(t.faceCount, 1);
    assert.equal(t.tier, 'NORMAL');
  }

  // 4. Zero warning strikes or malpractice events emitted for normal movements!
  const strikes = detectedEvents.filter((e) => e.metadata?.isWarningStrike);
  assert.equal(strikes.length, 0, 'No warning strikes should be registered for normal head movements');
  assert.equal(detectedEvents.length, 0, 'No malpractice events should be emitted for normal movement');
});

test('Scenario 2: Temporal smoothing ignores single-frame noise spikes', () => {
  const detectedEvents: any[] = [];
  const detector = new LocalProctorDetector({
    sessionId: 'sess-test-2',
    assessmentId: 'asm-test-2',
    candidateId: 'cand-test-2',
    candidateName: 'Test Student',
    onEventDetected: (evt) => detectedEvents.push(evt),
  });

  const frameWidth = 320;
  const frameHeight = 240;
  const normalFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: true });
  const emptyFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: false });

  let now = 20000;
  // Establish baseline
  for (let i = 0; i < 10; i++) {
    now += 220;
    detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  }

  // An isolated single frame drops face tracking (e.g. camera glitch or light flicker)
  now += 220;
  const glitchTelemetry = detector.analyzeFrameData(emptyFrame, frameWidth, frameHeight, now);
  assert.equal(glitchTelemetry.tier, 'NORMAL');
  assert.equal(glitchTelemetry.faceCount, 1);

  // Normal returns on next frame
  now += 220;
  const recoveredTelemetry = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  assert.equal(recoveredTelemetry.tier, 'NORMAL');
  assert.equal(recoveredTelemetry.faceCount, 1);

  assert.equal(detectedEvents.length, 0, 'Single-frame noise spike must not generate alerts');
});

test('Scenario 3: Hysteresis prevents flapping near threshold boundaries', () => {
  const detectedEvents: any[] = [];
  const detector = new LocalProctorDetector({
    sessionId: 'sess-test-3',
    assessmentId: 'asm-test-3',
    candidateId: 'cand-test-3',
    candidateName: 'Test Student',
    onEventDetected: (evt) => detectedEvents.push(evt),
  });

  const frameWidth = 320;
  const frameHeight = 240;
  const normalFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: true });

  let now = 30000;
  // Initialize detector
  for (let i = 0; i < 10; i++) {
    now += 220;
    detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  }

  // Simulate yaw hovering near the 35° threshold: alternating between 34° and 37°
  // Hysteresis enter threshold is 35 * 1.15 = 40.25°, so 36-37° stays NORMAL without flapping!
  for (let i = 0; i < 15; i++) {
    now += 220;
    const testYaw = i % 2 === 0 ? 34 : 37;
    detector.simulateLookingAway(true, testYaw, 0);
    const t = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
    assert.equal(t.headPose?.state, 'NORMAL', `Hovering at ${testYaw}° must stay NORMAL due to hysteresis buffer`);
    assert.equal(t.tier, 'NORMAL');
  }

  assert.equal(detectedEvents.length, 0, 'No state flapping near threshold boundaries');
});

test('Scenario 4: Sustained looking away (>4s) triggers Tier 2 Advisory without auto-fail strike', () => {
  const detectedEvents: any[] = [];
  const detector = new LocalProctorDetector({
    sessionId: 'sess-test-4',
    assessmentId: 'asm-test-4',
    candidateId: 'cand-test-4',
    candidateName: 'Test Student',
    onEventDetected: (evt) => detectedEvents.push(evt),
  });

  const frameWidth = 320;
  const frameHeight = 240;
  const normalFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: true });

  let now = 40000;
  // Initialize
  for (let i = 0; i < 10; i++) {
    now += 220;
    detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  }

  // Turn head significantly (> 45° > 40.25° enter threshold)
  detector.simulateLookingAway(true, 50, 0);

  // Looking away for 2.0s (< 4000ms duration threshold) -> stays NORMAL
  for (let i = 0; i < 9; i++) {
    now += 220;
    const t = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
    assert.equal(t.headPose?.state, 'NORMAL');
    assert.equal(t.tier, 'NORMAL');
  }
  assert.equal(detectedEvents.length, 0, 'Brief looking away < 4s does not trigger warning');

  // Continue looking away past 4000ms threshold (total ~5 seconds)
  for (let i = 0; i < 15; i++) {
    now += 220;
    const t = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
    if (i >= 10) {
      assert.equal(t.headPose?.state, 'LOOKING_AWAY');
      assert.equal(t.tier, 'WARNING');
    }
  }

  // Exactly 1 advisory event emitted (rate-controlled, non-punitive)
  assert.ok(detectedEvents.length >= 1, 'Should emit an advisory event when sustained past 4s');
  const lookingAwayEvent = detectedEvents.find((e) => e.type === 'LOOKING_AWAY');
  assert.ok(lookingAwayEvent, 'Should find LOOKING_AWAY event');
  assert.equal(lookingAwayEvent.metadata?.isAdvisory, true, 'Event must be marked as advisory');
  assert.equal(lookingAwayEvent.metadata?.isWarningStrike, false, 'Looking away must not be a termination strike');

  // Candidate looks back towards screen (yaw returns to 0)
  detector.simulateLookingAway(false);
  now += 220;
  const recoveredTelemetry = detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  assert.equal(recoveredTelemetry.headPose?.state, 'NORMAL', 'Immediately recovers to NORMAL state');
});

test('Scenario 5: Prolonged tracking loss (> 3.5s grace) transitions cleanly to NO_FACE Advisory', () => {
  const detectedEvents: any[] = [];
  const detector = new LocalProctorDetector({
    sessionId: 'sess-test-5',
    assessmentId: 'asm-test-5',
    candidateId: 'cand-test-5',
    candidateName: 'Test Student',
    onEventDetected: (evt) => detectedEvents.push(evt),
  });

  const frameWidth = 320;
  const frameHeight = 240;
  const normalFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: true });
  const emptyFrame = createSyntheticFrame(frameWidth, frameHeight, { skinPresent: false });

  let now = 50000;
  // Initialize
  for (let i = 0; i < 10; i++) {
    now += 220;
    detector.analyzeFrameData(normalFrame, frameWidth, frameHeight, now);
  }

  // Face disappears for 2.0s (< 3.5s grace period)
  for (let i = 0; i < 9; i++) {
    now += 220;
    const t = detector.analyzeFrameData(emptyFrame, frameWidth, frameHeight, now);
    assert.equal(t.faceCount, 1, 'In grace period, face presence is stabilized');
  }
  assert.equal(detectedEvents.length, 0, 'No event within 3.5s grace period');

  // Face continues to be missing past 3.5s (up to 5s total)
  for (let i = 0; i < 15; i++) {
    now += 220;
    const t = detector.analyzeFrameData(emptyFrame, frameWidth, frameHeight, now);
    if (i >= 8) {
      assert.equal(t.faceCount, 0);
      assert.equal(t.headPose?.state, 'TRACKING_LOST');
    }
  }

  const noFaceEvent = detectedEvents.find((e) => e.type === 'NO_FACE');
  assert.ok(noFaceEvent, 'Should emit NO_FACE event after grace period');
  assert.equal(noFaceEvent.metadata?.isAdvisory, true);
  assert.equal(noFaceEvent.metadata?.isWarningStrike, false);
});

