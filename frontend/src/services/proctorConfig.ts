import { SecuritySettings } from '../types';

export interface ProctoringThresholds {
  /** Minimum confidence score (0 to 1) for a face detection to be considered valid */
  minFaceConfidence: number;
  /** Maximum allowable yaw angle deviation in degrees before considered looking away (horizontal) */
  maxYawDeg: number;
  /** Maximum allowable pitch angle deviation in degrees before considered looking away (vertical) */
  maxPitchDeg: number;
  /** Maximum allowable roll/tilt in degrees */
  maxRollDeg: number;
  /** Duration in milliseconds that looking-away behavior must sustain before raising a warning */
  lookingAwayDurationMs: number;
  /** Grace period in milliseconds for momentary tracking loss (e.g. blinking, sneezing, looking down at keyboard) */
  trackingLossGraceMs: number;
  /** Duration in milliseconds that multiple faces must persist before raising an alert */
  multipleFacesDurationMs: number;
  /** Duration in milliseconds of darkness/obstruction before raising an alert */
  cameraObstructionDurationMs: number;
  /** Duration in milliseconds of frozen video before raising an alert */
  videoFreezeDurationMs: number;
  /** Cooldown period in milliseconds between consecutive user-facing warning banners */
  warningCooldownMs: number;
  /** Minimum interval in milliseconds between persisted review events to avoid DB flooding */
  reviewEventMinIntervalMs: number;
  /** Rolling window size (number of frames) used for temporal moving-average smoothing */
  temporalWindowSize: number;
  /** Hysteresis margin ratio (e.g. 0.15 = 15%) to prevent threshold boundary flickering */
  hysteresisMargin: number;
}

export const DEFAULT_PROCTORING_THRESHOLDS: ProctoringThresholds = {
  minFaceConfidence: 0.65,
  maxYawDeg: 35, // Allows ±30° natural head turning across screen without false positive
  maxPitchDeg: 28, // Allows looking down at keyboard, notes, or slightly up/down
  maxRollDeg: 30, // Allows normal head tilts
  lookingAwayDurationMs: 4000, // Must sustain looking away for at least 4.0 seconds
  trackingLossGraceMs: 3500, // 3.5-second grace period for blinking, itching, resting chin, posture shift
  multipleFacesDurationMs: 2200, // 2.2 seconds sustained detection before flagging
  cameraObstructionDurationMs: 2500, // 2.5 seconds sustained darkness
  videoFreezeDurationMs: 4500, // 4.5 seconds sustained freeze
  warningCooldownMs: 8000, // 8-second cooldown between warnings to avoid overwhelming candidate
  reviewEventMinIntervalMs: 10000, // At most 1 review event per 10s per condition type
  temporalWindowSize: 10, // 10-frame rolling window (~2.2s at 4.5 FPS)
  hysteresisMargin: 0.15, // 15% hysteresis buffer
};

/**
 * Resolves active proctoring thresholds by merging defaults with optional per-assessment overrides.
 */
export function getProctoringThresholds(customSettings?: Partial<SecuritySettings>): ProctoringThresholds {
  const custom = customSettings?.proctoringThresholds;
  if (!custom) {
    return { ...DEFAULT_PROCTORING_THRESHOLDS };
  }

  return {
    minFaceConfidence: custom.minFaceConfidence ?? DEFAULT_PROCTORING_THRESHOLDS.minFaceConfidence,
    maxYawDeg: custom.maxYawDeg ?? DEFAULT_PROCTORING_THRESHOLDS.maxYawDeg,
    maxPitchDeg: custom.maxPitchDeg ?? DEFAULT_PROCTORING_THRESHOLDS.maxPitchDeg,
    maxRollDeg: custom.maxRollDeg ?? DEFAULT_PROCTORING_THRESHOLDS.maxRollDeg,
    lookingAwayDurationMs: custom.lookingAwayDurationMs ?? DEFAULT_PROCTORING_THRESHOLDS.lookingAwayDurationMs,
    trackingLossGraceMs: custom.trackingLossGraceMs ?? DEFAULT_PROCTORING_THRESHOLDS.trackingLossGraceMs,
    multipleFacesDurationMs: custom.multipleFacesDurationMs ?? DEFAULT_PROCTORING_THRESHOLDS.multipleFacesDurationMs,
    cameraObstructionDurationMs: custom.cameraObstructionDurationMs ?? DEFAULT_PROCTORING_THRESHOLDS.cameraObstructionDurationMs,
    videoFreezeDurationMs: custom.videoFreezeDurationMs ?? DEFAULT_PROCTORING_THRESHOLDS.videoFreezeDurationMs,
    warningCooldownMs: custom.warningCooldownMs ?? DEFAULT_PROCTORING_THRESHOLDS.warningCooldownMs,
    reviewEventMinIntervalMs: custom.reviewEventMinIntervalMs ?? DEFAULT_PROCTORING_THRESHOLDS.reviewEventMinIntervalMs,
    temporalWindowSize: custom.temporalWindowSize ?? DEFAULT_PROCTORING_THRESHOLDS.temporalWindowSize,
    hysteresisMargin: custom.hysteresisMargin ?? DEFAULT_PROCTORING_THRESHOLDS.hysteresisMargin,
  };
}

