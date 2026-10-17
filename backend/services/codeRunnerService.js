import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { cpus } from 'os';
import {
  LANGUAGE_REGISTRY,
  normalizeLanguage,
  getLanguageSpec,
  resolveExecutable,
  testExecutable,
  detectJavaMainClass,
  normalizeOutput,
} from './compilerRegistry.js';
import { logger } from '../utils/logger.js';

export { LANGUAGE_REGISTRY, normalizeLanguage, getLanguageSpec };

// Backward compatibility export matching old LANGUAGE_CONFIG structure
export const LANGUAGE_CONFIG = Object.freeze(
  Object.fromEntries(
    Object.entries(LANGUAGE_REGISTRY).map(([id, spec]) => [
      id,
      Object.freeze({
        extension: spec.extension,
        compiler: spec.compilerCommand,
        compilerArgs: spec.getCompilerArgs,
        runtime: spec.getRuntimeArgs,
      }),
    ])
  )
);

export function getLanguageConfig(language) {
  const spec = getLanguageSpec(language);
  return { language: spec.id, config: spec };
}

const MAX_CONCURRENT_TESTS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_TESTS || Math.min(cpus().length, 4))
);
const MAX_OUTPUT_BYTES = 500000;

/**
 * Spawns a process with strict timeouts, process tree killing, and separate stdio capture
 */
function spawnProcess(command, args, options, input, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let stdout = '';
    let stderr = '';
    let outputLimitExceeded = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, executionTime: Date.now() - startedAt });
    };

    const timer = setTimeout(() => {
      try {
        if (child && !child.killed) {
          child.kill('SIGKILL');
        }
      } catch {}
      finish({
        success: false,
        status: 'time_limit_exceeded',
        stdout: stdout.trim(),
        stderr: `Time Limit Exceeded: Execution took longer than ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        ...options,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return finish({
          success: false,
          status: 'compiler_unavailable',
          stdout: '',
          stderr: `Executable not found: ${command} (${err.message})`,
          isMissingExecutable: true,
        });
      }
      return finish({
        success: false,
        status: 'runtime_error',
        stdout: '',
        stderr: err.message,
      });
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_BYTES && !outputLimitExceeded) {
        outputLimitExceeded = true;
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {}
        finish({
          success: false,
          status: 'output_limit_exceeded',
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES).trim(),
          stderr: `Output Limit Exceeded: Output exceeded ${Math.round(MAX_OUTPUT_BYTES / 1024)}KB limit. Check for infinite loops with print statements.`,
        });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        finish({
          success: false,
          status: 'compiler_unavailable',
          stdout: '',
          stderr: `Executable not found: ${command} (${err.message})`,
          isMissingExecutable: true,
        });
      } else {
        finish({
          success: false,
          status: 'runtime_error',
          stdout: stdout.trim(),
          stderr: err.message,
        });
      }
    });

    child.on('close', (exitCode, signal) => {
      if (settled || outputLimitExceeded) return;
      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        finish({
          success: false,
          status: 'time_limit_exceeded',
          stdout: stdout.trim(),
          stderr: 'Process terminated due to timeout or signal.',
        });
        return;
      }

      finish({
        success: exitCode === 0,
        status: exitCode === 0 ? 'passed' : 'runtime_error',
        stdout: stdout.trim(),
        stderr: exitCode === 0 ? '' : (stderr.trim() || `Process exited with error code ${exitCode}`),
        exitCode,
      });
    });

    try {
      child.stdin.end(input == null ? '' : String(input));
    } catch {
      // Stream could already be closed if process errored immediately
    }
  });
}

/**
 * Sandboxed Cloud Execution Fallback via Judge0 API
 * Invoked if a local compiler or runtime is missing on the host.
 */
async function executeViaCloudSandbox(spec, code, testCases = [], timeoutMs = 5000) {
  if (!spec.judge0Id) {
    throw new Error(`Cloud sandbox has no language mapping for ${spec.id}`);
  }

  // Adjust Java code for single-class execution if necessary
  let sourceToSubmit = code;
  if (spec.id === 'java') {
    const mainClass = detectJavaMainClass(code);
    if (mainClass !== 'Main') {
      // If code declares 'public class CustomName', replace it with 'public class Main'
      sourceToSubmit = code.replace(
        new RegExp(`public\\s+(?:final\\s+|abstract\\s+)*class\\s+${mainClass}\\b`),
        'public class Main'
      );
    }
  }

  const results = [];
  const startedAt = Date.now();

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const inputStr = tc?.input == null ? '' : String(tc.input);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs + 3000, 8000));

      const response = await fetch('https://ce.judge0.com/submissions?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_id: spec.judge0Id,
          source_code: sourceToSubmit,
          stdin: inputStr,
          cpu_time_limit: Math.min(Math.ceil(timeoutMs / 1000), 5),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Judge0 responded with HTTP ${response.status}`);
      }

      const data = await response.json();
      const statusId = data.status?.id;
      const execTime = data.time ? Math.round(parseFloat(data.time) * 1000) : 50;

      if (statusId === 6 || data.compile_output) {
        results.push({
          success: false,
          status: 'compilation_error',
          stdout: '',
          stderr: data.compile_output || data.stderr || 'Compilation Error',
          executionTime: execTime,
        });
      } else if (statusId === 5) {
        results.push({
          success: false,
          status: 'time_limit_exceeded',
          stdout: (data.stdout || '').trim(),
          stderr: 'Time Limit Exceeded: Process exceeded time limit.',
          executionTime: execTime,
        });
      } else if (statusId >= 7) {
        results.push({
          success: false,
          status: 'runtime_error',
          stdout: (data.stdout || '').trim(),
          stderr: data.stderr || data.message || `Runtime Error (Status ${statusId})`,
          executionTime: execTime,
        });
      } else {
        results.push({
          success: true,
          status: 'passed',
          stdout: (data.stdout || '').trim(),
          stderr: '',
          executionTime: execTime,
        });
      }
    } catch (err) {
      logger.warn(`[CloudSandbox] Error executing testcase ${i} for ${spec.id}: ${err.message}`);
      results.push({
        success: false,
        status: 'compiler_unavailable',
        stdout: '',
        stderr: `Execution service error: ${err.message}`,
      });
    }
  }

  return {
    results,
    language: spec.id,
    metrics: {
      workerCount: 1,
      compileTime: 0,
      executionTime: Date.now() - startedAt,
      totalTime: Date.now() - startedAt,
      executionEngine: 'judge0_sandbox',
    },
  };
}

/**
 * Main batch executor: executes user code against test cases in an isolated workspace
 */
export async function executeCodeBatchInSandbox(language, code, testCases = [], timeoutMs = 5000) {
  const spec = getLanguageSpec(language);
  const cases = Array.isArray(testCases) ? testCases : [];
  const startedAt = Date.now();

  // 1. Resolve compiler and runtime executables
  let compilerBin = null;
  if (spec.compilerCommand) {
    compilerBin = await resolveExecutable(spec.compilerCommand, spec.compilerEnvVar);
  }

  let runtimeBin = null;
  if (spec.runtimeCommand) {
    runtimeBin = await resolveExecutable(spec.runtimeCommand, spec.runtimeEnvVar);
  }

  // 2. Test if local toolchain is usable on this host
  let localToolchainAvailable = true;
  if (compilerBin) {
    const compTest = await testExecutable(compilerBin, spec.id === 'java' ? ['-version'] : ['--version']);
    if (!compTest.available) localToolchainAvailable = false;
  }
  if (runtimeBin && localToolchainAvailable) {
    const runTest = await testExecutable(runtimeBin, spec.id === 'java' ? ['-version'] : ['--version']);
    if (!runTest.available) localToolchainAvailable = false;
  }

  // 3. Fallback to Cloud Sandbox if local toolchain is missing
  if (!localToolchainAvailable) {
    logger.warn(`[CodeRunner] Local toolchain for ${spec.name} is missing. Attempting sandbox fallback...`);
    try {
      const sandboxBatch = await executeViaCloudSandbox(spec, code, cases, timeoutMs);
      return sandboxBatch;
    } catch (sandboxErr) {
      logger.error(`[CodeRunner] Sandbox fallback failed for ${spec.name}: ${sandboxErr.message}`);
      const unavailableResults = cases.map(() => ({
        success: false,
        status: 'compiler_unavailable',
        stdout: '',
        stderr: `Toolchain unavailable: Compiler/Runtime for ${spec.name} is not installed on this host.`,
        executionTime: 0,
        memory: 0,
      }));
      return {
        results: unavailableResults,
        metrics: { workerCount: 0, compileTime: 0, executionTime: 0, totalTime: Date.now() - startedAt },
        language: spec.id,
        toolchainError: `Compiler for ${spec.name} is unavailable.`,
      };
    }
  }

  // 4. Local Execution in Isolated Temporary Directory
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), `codeexam-${spec.id}-`));
  const sourceName = spec.sourceFilename(code);
  const sourceFile = path.join(rootDir, sourceName);
  const outputName = spec.outputFilename ? spec.outputFilename() : null;
  const executablePath = outputName ? path.join(rootDir, outputName) : null;

  let compileTime = 0;
  const compileStarted = Date.now();

  try {
    // Write student's source code safely
    await fs.writeFile(sourceFile, String(code ?? ''), 'utf8');

    // Safe isolated environment: NEVER leak database or server credentials!
    const safeEnv = {
      PATH: process.env.PATH,
      JAVA_HOME: process.env.JAVA_HOME,
      TMPDIR: rootDir,
      TEMP: rootDir,
      TMP: rootDir,
      HOME: rootDir,
      LANG: 'en_US.UTF-8',
      NODE_ENV: 'test',
    };

    // A. Compilation Step (if language requires compilation)
    if (spec.isCompiled && compilerBin) {
      const compilerArgs = spec.getCompilerArgs(sourceFile, executablePath, rootDir, code);
      const compileResult = await spawnProcess(
        compilerBin,
        compilerArgs,
        { cwd: rootDir, env: safeEnv },
        '',
        spec.compileTimeoutMs || 10000
      );

      compileTime = Date.now() - compileStarted;

      if (!compileResult.success) {
        // If compilation failed because compiler binary was missing (ENOENT)
        if (compileResult.status === 'compiler_unavailable') {
          // Attempt sandbox fallback
          try {
            return await executeViaCloudSandbox(spec, code, cases, timeoutMs);
          } catch {
            const results = cases.map(() => ({
              success: false,
              status: 'compiler_unavailable',
              stdout: '',
              stderr: compileResult.stderr,
              executionTime: compileResult.executionTime,
            }));
            return {
              results,
              metrics: { workerCount: 0, compileTime, executionTime: 0, totalTime: Date.now() - startedAt },
              language: spec.id,
              toolchainError: compileResult.stderr,
            };
          }
        }

        // Standard student compilation error (syntax error, missing semicolon, etc.)
        const results = cases.map(() => ({
          success: false,
          status: 'compilation_error',
          stdout: '',
          stderr: compileResult.stderr || 'Compilation failed.',
          executionTime: compileResult.executionTime,
          memory: 0,
        }));

        return {
          results,
          metrics: { workerCount: 0, compileTime, executionTime: 0, totalTime: Date.now() - startedAt },
          language: spec.id,
          compileError: compileResult.stderr,
        };
      }
    }

    // B. Execution Step against all test cases
    const workerCount = Math.min(MAX_CONCURRENT_TESTS, Math.max(1, cases.length || 1));
    const executionStarted = Date.now();
    let nextIndex = 0;
    const results = new Array(cases.length);

    const runWorker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= cases.length) return;

        const currentTc = cases[index];
        const runtimeArgs = spec.getRuntimeArgs(executablePath || sourceFile, rootDir, code);
        const command = runtimeBin || executablePath;

        results[index] = await spawnProcess(
          command,
          runtimeArgs,
          { cwd: rootDir, env: safeEnv },
          currentTc?.input,
          timeoutMs
        );
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return {
      results,
      language: spec.id,
      metrics: {
        workerCount,
        compileTime,
        executionTime: Date.now() - executionStarted,
        totalTime: Date.now() - startedAt,
        executionEngine: 'local_sandbox',
      },
    };
  } finally {
    // Guaranteed cleanup of temporary workspace and generated artifacts
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Single code execution helper
 */
export async function executeCodeInSandbox(language, code, input = '', timeoutMs = 5000) {
  const batch = await executeCodeBatchInSandbox(language, code, [{ input }], timeoutMs);
  return batch.results[0] || {
    success: false,
    status: 'runtime_error',
    stdout: '',
    stderr: 'No execution result returned.',
  };
}
