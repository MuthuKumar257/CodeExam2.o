/**
 * Demo Camera Video Stream Generator
 * Provides an interactive simulated proctoring camera stream with realistic candidate
 * movements, face tracking landmarks, and toggleable smartphone presence.
 */

export interface DemoStreamController {
  stream: MediaStream;
  setPhoneVisible: (visible: boolean) => void;
  isPhoneVisible: () => boolean;
  setCandidatePresent: (present: boolean) => void;
  setMultipleCandidates: (multiple: boolean) => void;
  destroy: () => void;
}

export function createDemoCameraStream(initialWithPhone = false): DemoStreamController {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let phoneVisible = initialWithPhone;
  let candidatePresent = true;
  let multipleCandidates = false;
  let animationFrameId: number | null = null;
  let frameCount = 0;

  let phoneTransition = initialWithPhone ? 1 : 0; // 0 = out of frame, 1 = fully in frame

  function render() {
    if (!ctx) return;
    frameCount++;

    // Smooth phone transition animation
    const targetTransition = phoneVisible ? 1 : 0;
    phoneTransition += (targetTransition - phoneTransition) * 0.15;

    // 1. Room Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 480);
    bgGradient.addColorStop(0, '#16161B'); // background surface
    bgGradient.addColorStop(0.7, '#1e293b'); // slate-800
    bgGradient.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 640, 480);

    // Ambient room bookshelf/wall lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 320);
    ctx.lineTo(640, 320);
    ctx.stroke();

    // Bookshelf / poster background details
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 100, 100, 160);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(40, 100, 100, 160);

    // Soft lighting glow
    const lightGlow = ctx.createRadialGradient(320, 120, 20, 320, 120, 260);
    lightGlow.addColorStop(0, 'rgba(148, 163, 184, 0.18)');
    lightGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = lightGlow;
    ctx.fillRect(0, 0, 640, 480);

    // Slight natural micro-sway for realistic camera
    const swayX = Math.sin(frameCount * 0.04) * 3;
    const swayY = Math.cos(frameCount * 0.03) * 2;

    // 2. Main Candidate
    if (candidatePresent) {
      drawCandidate(ctx, 320 + swayX, 250 + swayY, frameCount, false);
    }

    // 3. Second Candidate (if multiple requested)
    if (multipleCandidates) {
      drawCandidate(ctx, 120, 270, frameCount, true);
    }

    // 4. Smartphone held by hand (moves into lower-right/center frame)
    if (phoneTransition > 0.02) {
      drawPhoneWithHand(ctx, phoneTransition, frameCount);
    }

    // 5. Watermark timestamp & Demo tag
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.fillRect(16, 16, 230, 28);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.strokeRect(16, 16, 230, 28);

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(28, 30, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '11px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`DEMO STREAM • ${new Date().toLocaleTimeString()}`, 38, 34);

    animationFrameId = requestAnimationFrame(render);
  }

  function drawCandidate(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    frame: number,
    isSecondary: boolean
  ) {
    // Torso / shoulders (Dark clothing)
    c.fillStyle = isSecondary ? '#334155' : '#1e3a8a'; // dark navy hoodie
    c.beginPath();
    c.ellipse(x, y + 160, isSecondary ? 100 : 130, 90, 0, 0, Math.PI * 2);
    c.fill();

    // Neck
    c.fillStyle = '#f8c798'; // Skin tone
    c.fillRect(x - 22, y + 55, 44, 45);

    // Head / Face
    c.beginPath();
    c.ellipse(x, y + 10, 52, 68, 0, 0, Math.PI * 2);
    c.fillStyle = '#fed7aa'; // Natural skin tone
    c.fill();
    c.strokeStyle = '#fba46b';
    c.lineWidth = 1;
    c.stroke();

    // Hair
    c.fillStyle = '#292524';
    c.beginPath();
    c.ellipse(x, y - 35, 54, 38, 0, 0, Math.PI, true);
    c.fill();

    // Eyes (with occasional natural blinking)
    const isBlinking = frame % 120 > 114;
    c.fillStyle = '#1e293b';
    if (isBlinking) {
      c.fillRect(x - 24, y + 4, 14, 2);
      c.fillRect(x + 10, y + 4, 14, 2);
    } else {
      c.beginPath();
      c.arc(x - 17, y + 4, 4, 0, Math.PI * 2);
      c.arc(x + 17, y + 4, 4, 0, Math.PI * 2);
      c.fill();
    }

    // Eyebrows
    c.strokeStyle = '#44403c';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x - 28, y - 6);
    c.lineTo(x - 8, y - 8);
    c.moveTo(x + 8, y - 8);
    c.lineTo(x + 28, y - 6);
    c.stroke();

    // Nose
    c.strokeStyle = '#e29a65';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y + 8);
    c.lineTo(x - 2, y + 22);
    c.lineTo(x + 4, y + 22);
    c.stroke();

    // Mouth
    c.strokeStyle = '#d97706';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y + 36, 10, 0.1 * Math.PI, 0.9 * Math.PI);
    c.stroke();
  }

  function drawPhoneWithHand(c: CanvasRenderingContext2D, progress: number, frame: number) {
    // Progress translates phone from offscreen bottom right into position
    const startY = 490;
    const endY = 270 + Math.sin(frame * 0.06) * 4;
    const currentY = startY - (startY - endY) * progress;

    const startX = 540;
    const endX = 390 + Math.cos(frame * 0.05) * 3;
    const currentX = startX - (startX - endX) * progress;

    const phoneW = 95;
    const phoneH = 175;

    // Hand holding the phone (realistic skin fingers curled around phone)
    c.fillStyle = '#f8c798';
    c.strokeStyle = '#ea580c';
    c.lineWidth = 1;

    // Palm / wrist
    c.beginPath();
    c.ellipse(currentX + phoneW * 0.5, currentY + phoneH + 15, 45, 35, 0, 0, Math.PI * 2);
    c.fill();

    // Smartphone Outer Bezel / Body (Dark matte metallic chassis)
    c.fillStyle = '#16161B';
    c.beginPath();
    c.roundRect(currentX, currentY, phoneW, phoneH, 14);
    c.fill();
    c.strokeStyle = '#64748b';
    c.lineWidth = 3;
    c.stroke();

    // Smartphone Screen (Illuminated bright touchscreen with messages/search)
    c.fillStyle = '#f8fafc'; // Bright white/light blue illuminated display
    c.beginPath();
    c.roundRect(currentX + 6, currentY + 12, phoneW - 12, phoneH - 24, 6);
    c.fill();

    // Smartphone screen content (Simulated search / chat app)
    c.fillStyle = '#2563eb'; // App top bar
    c.fillRect(currentX + 6, currentY + 12, phoneW - 12, 18);

    // Screen text lines
    c.fillStyle = '#94a3b8';
    c.fillRect(currentX + 12, currentY + 38, phoneW - 24, 6);
    c.fillRect(currentX + 12, currentY + 50, phoneW - 32, 6);
    c.fillRect(currentX + 12, currentY + 62, phoneW - 20, 6);
    c.fillRect(currentX + 12, currentY + 80, phoneW - 28, 6);

    // Screen keyboard / action buttons
    c.fillStyle = '#cbd5e1';
    c.fillRect(currentX + 10, currentY + phoneH - 52, phoneW - 20, 24);

    // Dynamic screen glow reflection onto frame
    const screenGlow = c.createRadialGradient(
      currentX + phoneW / 2,
      currentY + phoneH / 2,
      20,
      currentX + phoneW / 2,
      currentY + phoneH / 2,
      120
    );
    screenGlow.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    screenGlow.addColorStop(1, 'rgba(59, 130, 246, 0)');
    c.fillStyle = screenGlow;
    c.fillRect(currentX - 30, currentY - 30, phoneW + 60, phoneH + 60);

    // Fingers gripping sides of the phone (Skin tone over phone edge)
    c.fillStyle = '#f8c798';
    c.beginPath();
    c.roundRect(currentX - 8, currentY + 50, 16, 18, 6);
    c.roundRect(currentX - 8, currentY + 75, 16, 18, 6);
    c.roundRect(currentX - 8, currentY + 100, 16, 18, 6);
    c.fill();

    // Thumb resting on front edge
    c.beginPath();
    c.ellipse(currentX + phoneW - 4, currentY + 110, 10, 16, -0.3, 0, Math.PI * 2);
    c.fill();
  }

  // Start rendering loop
  render();

  const stream = canvas.captureStream(30);

  return {
    stream,
    setPhoneVisible: (visible: boolean) => {
      phoneVisible = visible;
      (window as any).__SIMULATE_PHONE_DETECTION__ = visible;
    },
    isPhoneVisible: () => phoneVisible,
    setCandidatePresent: (present: boolean) => {
      candidatePresent = present;
    },
    setMultipleCandidates: (multiple: boolean) => {
      multipleCandidates = multiple;
      (window as any).__SIMULATE_MULTIPLE_PERSONS__ = multiple;
    },
    destroy: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * Creates a simulated live candidate desktop stream when browser Screen Capture API
 * is restricted by iframe sandbox permissions policy or denied.
 */
export function createDemoScreenStream(candidateName = 'Candidate', assessmentTitle = 'Examination'): DemoStreamController {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  let animationFrameId: number | null = null;
  let frameCount = 0;
  let codeLineOffset = 0;

  const sampleCode = [
    '// Institutional Secure Coding Assessment Sandbox',
    '#include <iostream>',
    '#include <vector>',
    '#include <string>',
    '',
    'class Solution {',
    'public:',
    '    int calculateOptimalSubsequence(std::vector<int>& nums) {',
    '        int n = nums.size();',
    '        if (n <= 1) return n;',
    '        std::vector<int> dp(n, 1);',
    '        int maxLen = 1;',
    '        for (int i = 1; i < n; ++i) {',
    '            for (int j = 0; j < i; ++j) {',
    '                if (nums[i] > nums[j]) {',
    '                    dp[i] = std::max(dp[i], dp[j] + 1);',
    '                }',
    '            }',
    '            maxLen = std::max(maxLen, dp[i]);',
    '        }',
    '        return maxLen;',
    '    }',
    '};',
  ];

  function render() {
    if (!ctx) return;
    frameCount++;

    // 1. Desktop background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1280, 720);

    // 2. Window Frame
    ctx.fillStyle = '#16161B';
    ctx.fillRect(40, 30, 1200, 660);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 30, 1200, 660);

    // Window Title Bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 30, 1200, 44);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(65, 52, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(85, 52, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(105, 52, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText(`${assessmentTitle} — CodeExam Proctoring Monitor [${candidateName}]`, 130, 56);

    // Right side watermark / recording indicator
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(1140, 52, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('REC SCREEN LIVE', 1152, 56);

    // Left Editor Panel
    ctx.fillStyle = '#090d16';
    ctx.fillRect(50, 84, 800, 595);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(50, 84, 800, 595);

    // Code lines
    ctx.font = '13px "Fira Code", monospace';
    sampleCode.forEach((line, idx) => {
      const y = 115 + idx * 22;
      ctx.fillStyle = '#475569';
      ctx.fillText(`${(idx + 1).toString().padStart(2, ' ')} `, 65, y);

      if (line.startsWith('//')) {
        ctx.fillStyle = '#64748b';
      } else if (line.startsWith('#') || line.startsWith('class') || line.startsWith('public:')) {
        ctx.fillStyle = '#818cf8';
      } else if (line.includes('return') || line.includes('for') || line.includes('if')) {
        ctx.fillStyle = '#f43f5e';
      } else if (line.includes('int') || line.includes('vector')) {
        ctx.fillStyle = '#38bdf8';
      } else {
        ctx.fillStyle = '#e2e8f0';
      }
      ctx.fillText(line, 100, y);
    });

    // Blinking cursor
    if (Math.floor(frameCount / 25) % 2 === 0) {
      ctx.fillStyle = '#a5b4fc';
      ctx.fillRect(360, 485, 8, 16);
    }

    // Right Test Panel
    ctx.fillStyle = '#16161B';
    ctx.fillRect(860, 84, 370, 595);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(860, 84, 370, 595);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Automated Execution Console', 880, 115);

    ctx.fillStyle = '#10b981';
    ctx.font = '12px monospace';
    ctx.fillText('✓ Test Case 1: PASSED (3ms)', 880, 150);
    ctx.fillText('✓ Test Case 2: PASSED (4ms)', 880, 175);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Running Test Case 3...', 880, 200);

    // Clock & Status footer
    ctx.fillStyle = '#334155';
    ctx.fillRect(880, 620, 330, 40);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px monospace';
    ctx.fillText(`Live Sync: ${new Date().toLocaleTimeString()}`, 895, 644);

    animationFrameId = requestAnimationFrame(render);
  }

  render();

  const stream = canvas.captureStream(20);

  return {
    stream,
    setPhoneVisible: () => {},
    isPhoneVisible: () => false,
    setCandidatePresent: () => {},
    setMultipleCandidates: () => {},
    destroy: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

