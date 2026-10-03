import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { cpus } from 'os';

export const LANGUAGE_CONFIG = Object.freeze({
  c: Object.freeze({ extension: '.c', compiler: process.env.C_COMPILER || 'gcc', compilerArgs: (source, output) => [source, '-O2', '-o', output], runtime: (output) => [output] }),
  cpp: Object.freeze({ extension: '.cpp', compiler: process.env.CPP_COMPILER || 'g++', compilerArgs: (source, output) => [source, '-O2', '-std=c++17', '-o', output], runtime: (output) => [output] }),
  java: Object.freeze({ extension: '.java', compiler: process.env.JAVA_COMPILER || 'javac', compilerArgs: (source) => [source], runtime: (root) => ['-cp', root, 'Main'] }),
  python: Object.freeze({ extension: '.py', runtime: (source) => [source] }),
  javascript: Object.freeze({ extension: '.js', runtime: (source) => ['--max-old-space-size=128', '--no-warnings', source] }),
});

const LANGUAGE_ALIASES = Object.freeze({
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  js: 'javascript',
  node: 'javascript',
  py: 'python',
});

const MAX_CONCURRENT_TESTS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_TESTS || Math.min(cpus().length, 4))
);
const MAX_OUTPUT_BYTES = 500000;

export function normalizeLanguage(language) {
  const normalized = String(language || '').trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

export function getLanguageConfig(language) {
  const normalized = normalizeLanguage(language);
  const config = LANGUAGE_CONFIG[normalized];
  if (!config) {
    const error = new Error(`Unsupported language: ${language || 'unspecified'}`);
    error.statusCode = 400;
    error.errorCode = 'UNSUPPORTED_LANGUAGE';
    throw error;
  }
  return { language: normalized, config };
}

function spawnProcess(command, args, options, input, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let outputLimitExceeded = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, executionTime: Date.now() - startedAt });
    };
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      finish({ success: false, status: 'time_limit_exceeded', stdout, stderr: `Execution exceeded ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_BYTES && !outputLimitExceeded) {
        outputLimitExceeded = true;
        if (!child.killed) child.kill('SIGKILL');
        finish({ success: false, status: 'output_limit_exceeded', stdout, stderr: 'Output exceeded the allowed limit.' });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ success: false, status: 'runtime_error', stdout, stderr: error.message }));
    child.on('close', (exitCode) => {
      if (settled || outputLimitExceeded) return;
      finish({
        success: exitCode === 0,
        status: exitCode === 0 ? 'passed' : 'runtime_error',
        stdout: stdout.trim(),
        stderr: exitCode === 0 ? '' : stderr,
      });
    });
    child.stdin.end(input == null ? '' : String(input));
  });
}

export async function executeCodeBatchInSandbox(language, code, testCases = [], timeoutMs = 5000) {
  const { language: normalizedLanguage, config } = getLanguageConfig(language);
  const cases = Array.isArray(testCases) ? testCases : [];
  const startedAt = Date.now();
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codeexam-submission-'));
  const sourceName = normalizedLanguage === 'java' ? 'Main.java' : `solution${config.extension}`;
  const sourceFile = path.join(rootDir, sourceName);
  const compileStarted = Date.now();
  let executablePath = null;
  let compileTime = 0;

  try {
    await fs.writeFile(sourceFile, String(code ?? ''), 'utf8');

    if (config.compiler) {
      executablePath = path.join(rootDir, process.platform === 'win32' ? 'program.exe' : 'program');
      const compile = await spawnProcess(
        config.compiler,
        config.compilerArgs(sourceFile, executablePath),
        { cwd: rootDir, env: { PATH: process.env.PATH, NODE_ENV: 'compile' } },
        '',
        Math.min(timeoutMs, 10000)
      );
      compileTime = Date.now() - compileStarted;
      if (!compile.success) {
        const results = cases.map(() => ({
          success: false,
          status: 'compilation_error',
          stdout: '',
          stderr: compile.stderr || 'Compilation failed.',
          executionTime: compile.executionTime,
          memory: 0,
        }));
        return {
          results,
          metrics: { workerCount: 0, compileTime: Date.now() - compileStarted, executionTime: 0, totalTime: Date.now() - startedAt },
          language: normalizedLanguage,
          compileError: compile.stderr,
        };
      }
    }

    const workerCount = Math.min(MAX_CONCURRENT_TESTS, Math.max(1, cases.length || 1));
    const executionStarted = Date.now();
    let nextIndex = 0;
    const results = new Array(cases.length);
    const runWorker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= cases.length) return;
        const runtimeArgs = normalizedLanguage === 'java'
          ? config.runtime(rootDir)
          : config.runtime(executablePath || sourceFile);
        const command = normalizedLanguage === 'python'
          ? (process.platform === 'win32' ? 'python' : 'python3')
          : normalizedLanguage === 'javascript'
            ? process.execPath
            : normalizedLanguage === 'java'
              ? 'java'
              : executablePath;
        results[index] = await spawnProcess(
          command,
          runtimeArgs,
          { cwd: rootDir, env: { PATH: process.env.PATH, NODE_ENV: 'test' } },
          cases[index]?.input,
          timeoutMs
        );
      }
    };
    await Promise.all(Array.from({ length: workerCount }, runWorker));

    return {
      results,
      language: normalizedLanguage,
      metrics: {
        workerCount,
        compileTime,
        executionTime: Date.now() - executionStarted,
        totalTime: Date.now() - startedAt,
      },
    };
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeCodeInSandbox(language, code, input = '', timeoutMs = 5000) {
  const batch = await executeCodeBatchInSandbox(language, code, [{ input }], timeoutMs);
  return batch.results[0];
}
