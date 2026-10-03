import { ProctoringEvent, ProctoringEventType, RiskCategory, RiskIndicator, RiskWeights } from '../types';

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  TAB_SWITCH: 10,
  WINDOW_BLUR: 5,
  FULLSCREEN_EXIT: 10,
  COPY: 5,
  PASTE: 5,
  CUT: 5,
  CAMERA_DISABLED: 15,
  NO_FACE: 5,
  MULTIPLE_FACES: 35,
  SUSPICIOUS_PASTE: 15,
  PHONE_DETECTED: 40,
};

export function calculateRiskScore(events: ProctoringEvent[], weights: RiskWeights = DEFAULT_RISK_WEIGHTS): RiskIndicator {
  const breakdown: Record<string, number> = {};
  let totalScore = 0;

  for (const event of events) {
    if (event.reviewStatus === 'FALSE_POSITIVE') {
      continue; // Skip false positive events from risk calculation
    }

    const eventType = event.type;
    const weight = weights[eventType as keyof RiskWeights] || 5;

    breakdown[eventType] = (breakdown[eventType] || 0) + weight;
    totalScore += weight;
  }

  let category: RiskCategory = 'NORMAL';
  if (totalScore >= 60) {
    category = 'MANUAL_REVIEW_REQUIRED';
  } else if (totalScore >= 40) {
    category = 'HIGH_ATTENTION';
  } else if (totalScore >= 20) {
    category = 'REVIEW';
  } else {
    category = 'NORMAL';
  }

  return {
    score: Math.min(totalScore, 100), // capped at 100
    category,
    breakdown,
  };
}

export function getSeverityForEvent(type: ProctoringEventType): 'LOW' | 'MEDIUM' | 'HIGH' {
  switch (type) {
    case 'MULTIPLE_FACES':
    case 'PHONE_DETECTED':
    case 'CAMERA_DISABLED':
    case 'CAMERA_OBSTRUCTED':
    case 'SUSPICIOUS_PASTE':
      return 'HIGH';
    case 'TAB_SWITCH':
    case 'FULLSCREEN_EXIT':
    case 'NO_FACE':
    case 'VIDEO_FROZEN':
    case 'MIC_DISABLED':
      return 'MEDIUM';
    case 'WINDOW_BLUR':
    case 'COPY':
    case 'PASTE':
    case 'CUT':
    case 'RIGHT_CLICK':
    case 'WINDOW_FOCUS':
    case 'FULLSCREEN_ENTER':
    case 'FACE_OUT_OF_FRAME':
    case 'WEBSOCKET_DISCONNECTED':
    default:
      return 'LOW';
  }
}

export function getRiskCategoryBadge(category: RiskCategory): { label: string; bg: string; text: string; border: string } {
  switch (category) {
    case 'MANUAL_REVIEW_REQUIRED':
      return { label: 'Manual Review Required', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' };
    case 'MALPRACTICE_TERMINATED':
      return { label: 'Malpractice Terminated', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40' };
    case 'HIGH_ATTENTION':
      return { label: 'High Attention', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' };
    case 'REVIEW':
      return { label: 'Review Needed', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'NORMAL':
    default:
      return { label: 'Normal', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  }
}
