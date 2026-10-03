import { CodeExecutionResult, TestCase } from '../types';

export type ComparisonMode = 'EXACT' | 'TRIM_WHITESPACE' | 'TOKEN_BASED';

export interface SingleExecutionResult {
  status: 'Passed' | 'Wrong Answer' | 'Compilation Error' | 'Runtime Error' | 'Time Limit Exceeded';
  input: string;
  yourOutput: string;
  expectedOutput?: string;
  executionTimeMs: number;
  error?: string;
}

function isMissingRuntimeError(stderr?: string): boolean {
  if (!stderr) return false;
  const s = stderr.toLowerCase();
  return (
    s.includes('enoent') ||
    s.includes('spawn') ||
    s.includes('python was not found') ||
    s.includes('python3: command not found') ||
    s.includes('python: command not found') ||
    s.includes('microsoft store') ||
    s.includes('app execution aliases') ||
    s.includes('not recognized as an internal or external command') ||
    s.includes('failed to spawn process') ||
    s.includes('javac: command not found') ||
    s.includes('javac: not found') ||
    s.includes('gcc: command not found') ||
    s.includes('gcc: not found') ||
    s.includes('g++: command not found') ||
    s.includes('g++: not found') ||
    s.includes('go: command not found') ||
    s.includes('go: not found') ||
    s.includes('rustc: command not found') ||
    s.includes('rustc: not found') ||
    s.includes('node: command not found')
  );
}

async function runDirectPistonSandbox(
  language: string,
  sourceCode: string,
  inputStr: string,
  timeoutMs: number = 4000
): Promise<{ stdout: string; stderr: string; status: SingleExecutionResult['status']; executionTimeMs: number } | null> {
  try {
    const lang = language.toLowerCase();
    let languageId = 71; // Python 3 default

    if (lang === 'python' || lang === 'py' || lang === 'python3') {
      languageId = 71;
    } else if (lang === 'javascript' || lang === 'js') {
      languageId = 63;
    } else if (lang === 'typescript' || lang === 'ts') {
      languageId = 74;
    } else if (lang === 'cpp' || lang === 'c++' || lang === 'cxx') {
      languageId = 54;
    } else if (lang === 'c') {
      languageId = 50;
    } else if (lang === 'java') {
      languageId = 62;
    } else if (lang === 'go' || lang === 'golang') {
      languageId = 60;
    } else if (lang === 'rust' || lang === 'rs') {
      languageId = 73;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs + 1000, 5000));

    const response = await fetch('https://ce.judge0.com/submissions?wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language_id: languageId,
        source_code: sourceCode,
        stdin: inputStr || '',
        cpu_time_limit: Math.min(Math.ceil(timeoutMs / 1000), 5),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) return null;

    const data: any = await response.json();
    const executionTimeMs = data.time ? Math.round(parseFloat(data.time) * 1000) : Date.now() - startTime;
    const statusId = data.status?.id;

    if (statusId === 6 || data.compile_output) {
      return {
        stdout: data.stdout || '',
        stderr: data.compile_output || data.stderr || 'Compilation Error',
        status: 'Compilation Error',
        executionTimeMs,
      };
    }

    if (statusId === 5) {
      return {
        stdout: data.stdout || '',
        stderr: 'Time Limit Exceeded (Execution exceeded limit)',
        status: 'Time Limit Exceeded',
        executionTimeMs,
      };
    }

    if (statusId >= 7) {
      return {
        stdout: data.stdout || '',
        stderr: data.stderr || data.message || `Runtime Error (Status ${statusId})`,
        status: 'Runtime Error',
        executionTimeMs,
      };
    }

    return {
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      status: 'Passed',
      executionTimeMs,
    };
  } catch {
    return null;
  }
}

function executeJSFallback(
  sourceCode: string,
  inputStr: string
): { stdout: string; stderr: string; status: SingleExecutionResult['status']; executionTimeMs: number } {
  const startTime = Date.now();
  const logs: string[] = [];
  try {
    const captureLog = (...args: any[]) => {
      logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    const fn = new Function('input', 'console', `
      let result;
      try {
        ${sourceCode}
      } catch(e) {
        throw e;
      }
      return result;
    `);

    fn(inputStr, { ...console, log: captureLog });

    return {
      stdout: logs.join('\n'),
      stderr: '',
      status: 'Passed',
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      stdout: logs.join('\n'),
      stderr: err.message || 'Execution Error',
      status: 'Runtime Error',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export async function executeCustomInput(
  language: string,
  sourceCode: string,
  input: string,
  expectedOutput?: string
): Promise<SingleExecutionResult> {
  try {
    const response = await fetch('/api/code/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        sourceCode,
        input,
        expectedOutput,
      }),
    });

    if (response.ok) {
      const data: SingleExecutionResult = await response.json();
      if (!isMissingRuntimeError(data.error)) {
        return data;
      }
    }
  } catch {
    // Continue to client direct fallback
  }

  // Fallback to direct sandbox
  const pistonRes = await runDirectPistonSandbox(language, sourceCode, input, 4000);
  if (pistonRes) {
    let status: SingleExecutionResult['status'] = pistonRes.status;
    if (pistonRes.status === 'Passed' && expectedOutput && expectedOutput.trim()) {
      const isMatch = compareOutputs(expectedOutput, pistonRes.stdout, 'TRIM_WHITESPACE');
      if (!isMatch) {
        status = 'Wrong Answer';
      }
    }
    return {
      status,
      input,
      yourOutput: pistonRes.stdout,
      expectedOutput,
      executionTimeMs: pistonRes.executionTimeMs,
      error: pistonRes.stderr || undefined,
    };
  }

  // If language is JavaScript or TypeScript, run local JS interpreter fallback
  const langLower = (language || '').toLowerCase();
  if (['javascript', 'js', 'typescript', 'ts'].includes(langLower)) {
    const localRes = executeJSFallback(sourceCode, input);
    let status = localRes.status;
    if (status === 'Passed' && expectedOutput && expectedOutput.trim()) {
      if (!compareOutputs(expectedOutput, localRes.stdout, 'TRIM_WHITESPACE')) {
        status = 'Wrong Answer';
      }
    }
    return {
      status,
      input,
      yourOutput: localRes.stdout,
      expectedOutput,
      executionTimeMs: localRes.executionTimeMs,
      error: localRes.stderr || undefined,
    };
  }

  return {
    status: 'Runtime Error',
    input,
    yourOutput: '',
    expectedOutput,
    executionTimeMs: 0,
    error: `Execution Error: Code runner engine for ${language} is temporary unavailable. Please check your network connection.`,
  };
}

export async function executeCodeInSandbox(
  language: string,
  sourceCode: string,
  testCases: TestCase[],
  timeLimitMs: number = 3000,
  memoryLimitMb: number = 256,
  comparisonMode: ComparisonMode = 'TRIM_WHITESPACE'
): Promise<CodeExecutionResult> {
  const safeTestCases = Array.isArray(testCases) ? testCases : [];

  try {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('/api/code/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language,
        sourceCode,
        testCases: safeTestCases,
        timeLimitMs,
        memoryLimitMb,
        comparisonMode,
      }),
      signal: controller.signal,
    });
    clearTimeout(abortTimer);

    if (response.ok) {
      const payload = await response.json();
      const data: CodeExecutionResult = payload?.data || payload;
      if (!isMissingRuntimeError(data.stderr)) {
        return data;
      }
    }
  } catch {
    // Continue to client fallback
  }

  // Fast JS/TS fallback directly in browser runtime (instant execution)
  const langLower = (language || '').toLowerCase();
  const isClientJS = ['javascript', 'js', 'typescript', 'ts'].includes(langLower);

  // Parallel fallback execution
  const rawResults = await Promise.all(
    safeTestCases.map(async (tc) => {
      if (isClientJS) {
        return executeJSFallback(sourceCode, tc.input || '');
      }
      const procRes = await runDirectPistonSandbox(language, sourceCode, tc.input || '', timeLimitMs);
      return (
        procRes || {
          stdout: '',
          stderr: 'Execution service temporary unavailable.',
          status: 'Runtime Error' as const,
          executionTimeMs: 0,
        }
      );
    })
  );

  const results = [];
  let passedCount = 0;
  let totalTimeMs = 0;
  let maxTimeMs = 0;
  let firstError: string | undefined = undefined;
  let overallStatus: CodeExecutionResult['status'] = 'Accepted';

  for (let i = 0; i < safeTestCases.length; i++) {
    const tc = safeTestCases[i];
    const procRes = rawResults[i];
    const execTime = procRes?.executionTimeMs || 0;
    totalTimeMs += execTime;
    if (execTime > maxTimeMs) maxTimeMs = execTime;

    let tcPassed = false;
    const tcError: string | undefined = procRes?.stderr || undefined;

    if (procRes && procRes.status === 'Passed') {
      tcPassed = compareOutputs(tc.expectedOutput, procRes.stdout, comparisonMode);
      if (!tcPassed && overallStatus === 'Accepted') {
        overallStatus = 'Wrong Answer';
      }
    } else {
      if (!firstError) firstError = procRes?.stderr || 'Execution failed';
      if (procRes?.status === 'Time Limit Exceeded') overallStatus = 'Time Limit Exceeded';
      else if (procRes?.status === 'Compilation Error') overallStatus = 'Compilation Error';
      else if (overallStatus === 'Accepted' || overallStatus === 'Wrong Answer') overallStatus = 'Runtime Error';
    }

    if (tcPassed) {
      passedCount++;
    }

    results.push({
      id: tc.id,
      passed: tcPassed,
      input: tc.isPublic ? tc.input : '[Concealed]',
      expectedOutput: tc.isPublic ? tc.expectedOutput : '[Concealed]',
      actualOutput: tc.isPublic ? procRes?.stdout || '' : '[Concealed]',
      isPublic: tc.isPublic,
      error: tc.isPublic ? tcError : undefined,
    });
  }

  if (passedCount < safeTestCases.length && overallStatus === 'Accepted') {
    overallStatus = 'Wrong Answer';
  }

  const stdoutLogs = results
    .map((r, i) => {
      if (r.isPublic) {
        const outVal = r.error
          ? `Error: ${r.error}`
          : r.actualOutput !== undefined && r.actualOutput !== null && r.actualOutput !== '' && r.actualOutput !== '[Concealed]'
          ? r.actualOutput
          : '(no output)';
        return `[Test Case ${i + 1} - Public]\nInput:\n${r.input}\nExpected Output:\n${r.expectedOutput}\nYour Output:\n${outVal}\nResult: ${r.passed ? 'PASSED ✓' : 'FAILED ✗'}`;
      } else {
        return `[Test Case ${i + 1} - Hidden]\nResult: ${r.passed ? 'PASSED ✓' : 'FAILED ✗'} (Concealed for integrity)`;
      }
    })
    .join('\n\n');

  return {
    status: overallStatus,
    stdout: stdoutLogs,
    stderr: firstError,
    executionTimeMs: maxTimeMs || totalTimeMs,
    memoryUsageMb: 16,
    testCasesPassed: passedCount,
    totalTestCases: safeTestCases.length,
    testCaseResults: results,
  };
}

export function compareOutputs(
  expected: string,
  actual: string,
  mode: ComparisonMode = 'TRIM_WHITESPACE'
): boolean {
  const expStr = expected === null || expected === undefined ? '' : String(expected);
  const actStr = actual === null || actual === undefined ? '' : String(actual);

  if (mode === 'EXACT') {
    return expStr === actStr;
  }

  if (mode === 'TOKEN_BASED') {
    const expTokens = expStr.trim().split(/\s+/).filter(Boolean);
    const actTokens = actStr.trim().split(/\s+/).filter(Boolean);
    if (expTokens.length !== actTokens.length) return false;
    return expTokens.every((tok, idx) => tok === actTokens[idx]);
  }

  const normExp = expStr
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trimEnd();

  const normAct = actStr
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trimEnd();

  if (normExp === normAct) return true;
  if (normExp.replace(/\s+/g, '') === normAct.replace(/\s+/g, '')) return true;

  return false;
}
