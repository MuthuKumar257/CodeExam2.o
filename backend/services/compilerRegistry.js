import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

// Cache for resolved executable paths so filesystem lookups happen once
const executablePathCache = new Map();

/**
 * Normalizes output string for comparison (standard trim and \r\n -> \n)
 */
export function normalizeOutput(output) {
  if (output === null || output === undefined) return '';
  return String(output)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Detects Java main/public class name from source code.
 * Ensures the source file is named correctly (e.g. Solution.java or Main.java)
 */
export function detectJavaMainClass(code) {
  if (!code || typeof code !== 'string') return 'Main';
  
  // Strip single-line and block comments to avoid matching comments like "// class here"
  const cleanedCode = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*/g, ' ');

  // 1. Look for public class Name
  const publicClassMatch = cleanedCode.match(/public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z0-9_$]+)/);
  if (publicClassMatch && publicClassMatch[1]) {
    return publicClassMatch[1];
  }

  // 2. Look for class containing public static void main
  const mainClassMatches = [...cleanedCode.matchAll(/class\s+([A-Za-z0-9_$]+)[^{]*\{[\s\S]*?public\s+static\s+void\s+main/g)];
  if (mainClassMatches.length > 0 && mainClassMatches[0][1]) {
    return mainClassMatches[0][1];
  }

  // 3. Look for any class definition
  const genericClassMatch = cleanedCode.match(/\bclass\s+([A-Za-z0-9_$]+)/);
  if (genericClassMatch && genericClassMatch[1]) {
    return genericClassMatch[1];
  }

  return 'Main';
}

/**
 * Searches system PATH and known directories to resolve exact binary path
 */
export async function resolveExecutable(command, envVarOverride, fallbackCandidates = []) {
  const cacheKey = `${command}_${envVarOverride || ''}`;
  if (executablePathCache.has(cacheKey)) {
    return executablePathCache.get(cacheKey);
  }

  // 1. Check custom environment variable
  if (envVarOverride && process.env[envVarOverride]) {
    const custom = process.env[envVarOverride].trim();
    if (fs.existsSync(custom)) {
      executablePathCache.set(cacheKey, custom);
      return custom;
    }
  }

  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];

  // 2. Check candidate directories
  const searchDirs = [
    ...(process.env.PATH || '').split(path.delimiter),
    ...(isWin ? [
      process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : null,
      'C:\\Program Files\\Common Files\\Oracle\\Java\\javapath',
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      'C:\\MinGW\\bin',
      'C:\\msys64\\ucrt64\\bin',
      'C:\\msys64\\mingw64\\bin',
      'C:\\Program Files\\Git\\mingw64\\bin',
      'C:\\Program Files\\nodejs',
      path.join(os.homedir(), '.cargo', 'bin'),
      path.join(os.homedir(), 'go', 'bin'),
    ] : [
      process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : null,
      '/usr/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/lib/jvm/default-java/bin',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin',
      '/usr/lib/jvm/java-17-openjdk/bin',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin',
      '/usr/lib/jvm/java-11-openjdk-amd64/bin',
      path.join(os.homedir(), '.cargo', 'bin'),
      path.join(os.homedir(), 'go', 'bin'),
    ]),
    ...fallbackCandidates,
  ].filter(Boolean);

  for (const dir of searchDirs) {
    for (const ext of exts) {
      const fullPath = path.isAbsolute(command) ? command : path.join(dir, `${command}${ext}`);
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            executablePathCache.set(cacheKey, fullPath);
            return fullPath;
          }
        }
      } catch {}
    }
  }

  // 3. Fallback to raw command name
  executablePathCache.set(cacheKey, command);
  return command;
}

/**
 * Tests if an executable can run and reports version/status
 */
export async function testExecutable(resolvedPath, args = ['--version']) {
  if (!resolvedPath) return { available: false, version: '' };
  try {
    const { stdout, stderr } = await execFileAsync(resolvedPath, args, {
      timeout: 2000,
      env: { PATH: process.env.PATH },
    });
    const output = (stdout || stderr || '').trim().split('\n')[0] || 'Available';
    return { available: true, version: output };
  } catch (err) {
    // If the error code was ENOENT, it really does not exist
    if (err.code === 'ENOENT') {
      return { available: false, version: 'Not found (ENOENT)' };
    }
    // Some commands like java/python return non-zero exit or stderr for --version, but are available
    if (err.stdout || err.stderr) {
      const output = (err.stdout || err.stderr || '').trim().split('\n')[0];
      return { available: true, version: output };
    }
    return { available: false, version: err.message };
  }
}

/**
 * Centralized Language Registry definition
 */
export const LANGUAGE_REGISTRY = {
  c: {
    id: 'c',
    name: 'C',
    aliases: ['c'],
    extension: '.c',
    isCompiled: true,
    judge0Id: 50, // GCC 9.2.0
    compilerCommand: 'gcc',
    compilerEnvVar: 'C_COMPILER',
    runtimeCommand: null, // Executable output directly
    sourceFilename: () => 'solution.c',
    outputFilename: () => (process.platform === 'win32' ? 'program.exe' : 'program'),
    getCompilerArgs: (sourcePath, outputPath) => [sourcePath, '-O2', '-o', outputPath, '-lm'],
    getRuntimeArgs: (outputPath) => [outputPath],
    compileTimeoutMs: 10000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  cpp: {
    id: 'cpp',
    name: 'C++',
    aliases: ['cpp', 'c++', 'cxx', 'cc'],
    extension: '.cpp',
    isCompiled: true,
    judge0Id: 54, // GCC 9.2.0 C++17
    compilerCommand: 'g++',
    compilerEnvVar: 'CPP_COMPILER',
    runtimeCommand: null,
    sourceFilename: () => 'solution.cpp',
    outputFilename: () => (process.platform === 'win32' ? 'program.exe' : 'program'),
    getCompilerArgs: (sourcePath, outputPath) => [sourcePath, '-O2', '-std=c++17', '-o', outputPath],
    getRuntimeArgs: (outputPath) => [outputPath],
    compileTimeoutMs: 12000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  java: {
    id: 'java',
    name: 'Java',
    aliases: ['java'],
    extension: '.java',
    isCompiled: true,
    judge0Id: 62, // OpenJDK 13
    compilerCommand: 'javac',
    compilerEnvVar: 'JAVA_COMPILER',
    runtimeCommand: 'java',
    runtimeEnvVar: 'JAVA_RUNTIME',
    sourceFilename: (code) => `${detectJavaMainClass(code)}.java`,
    outputFilename: () => null,
    getCompilerArgs: (sourcePath) => ['-encoding', 'UTF-8', sourcePath],
    getRuntimeArgs: (_targetPath, workDir, code) => [
      '-Xmx256m',
      '-Xss64m',
      '-cp',
      workDir,
      detectJavaMainClass(code),
    ],
    compileTimeoutMs: 15000,
    executionTimeoutMs: 6000,
    memoryLimitMb: 512,
  },

  python: {
    id: 'python',
    name: 'Python 3',
    aliases: ['python', 'py', 'python3'],
    extension: '.py',
    isCompiled: false,
    judge0Id: 71, // Python 3.8.1
    compilerCommand: null,
    runtimeCommand: process.platform === 'win32' ? 'python' : 'python3',
    runtimeEnvVar: 'PYTHON_RUNTIME',
    sourceFilename: () => 'solution.py',
    outputFilename: () => null,
    getCompilerArgs: () => [],
    getRuntimeArgs: (sourcePath) => ['-u', sourcePath],
    compileTimeoutMs: 0,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  javascript: {
    id: 'javascript',
    name: 'JavaScript (Node.js)',
    aliases: ['javascript', 'js', 'node'],
    extension: '.js',
    isCompiled: false,
    judge0Id: 63, // Node.js 12.14.0
    compilerCommand: null,
    runtimeCommand: process.execPath || 'node',
    runtimeEnvVar: 'NODE_RUNTIME',
    sourceFilename: () => 'solution.js',
    outputFilename: () => null,
    getCompilerArgs: () => [],
    getRuntimeArgs: (sourcePath) => ['--max-old-space-size=128', '--no-warnings', sourcePath],
    compileTimeoutMs: 0,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    aliases: ['typescript', 'ts'],
    extension: '.ts',
    isCompiled: true,
    judge0Id: 74, // TypeScript 3.7.4
    compilerCommand: 'tsc',
    compilerEnvVar: 'TSC_COMPILER',
    runtimeCommand: process.execPath || 'node',
    runtimeEnvVar: 'NODE_RUNTIME',
    sourceFilename: () => 'solution.ts',
    outputFilename: () => 'solution.js',
    getCompilerArgs: (sourcePath, _outputPath, workDir) => [
      sourcePath,
      '--target',
      'es2020',
      '--module',
      'commonjs',
      '--outDir',
      workDir,
      '--skipLibCheck',
    ],
    getRuntimeArgs: (_targetPath, workDir) => [
      '--max-old-space-size=128',
      '--no-warnings',
      path.join(workDir, 'solution.js'),
    ],
    compileTimeoutMs: 12000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  go: {
    id: 'go',
    name: 'Go',
    aliases: ['go', 'golang'],
    extension: '.go',
    isCompiled: true,
    judge0Id: 60, // Go 1.13.5
    compilerCommand: 'go',
    compilerEnvVar: 'GO_COMPILER',
    runtimeCommand: null,
    sourceFilename: () => 'main.go',
    outputFilename: () => (process.platform === 'win32' ? 'program.exe' : 'program'),
    getCompilerArgs: (sourcePath, outputPath) => ['build', '-o', outputPath, sourcePath],
    getRuntimeArgs: (outputPath) => [outputPath],
    compileTimeoutMs: 12000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  rust: {
    id: 'rust',
    name: 'Rust',
    aliases: ['rust', 'rs'],
    extension: '.rs',
    isCompiled: true,
    judge0Id: 73, // Rust 1.40.0
    compilerCommand: 'rustc',
    compilerEnvVar: 'RUST_COMPILER',
    runtimeCommand: null,
    sourceFilename: () => 'solution.rs',
    outputFilename: () => (process.platform === 'win32' ? 'program.exe' : 'program'),
    getCompilerArgs: (sourcePath, outputPath) => [sourcePath, '-O', '-o', outputPath],
    getRuntimeArgs: (outputPath) => [outputPath],
    compileTimeoutMs: 15000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  csharp: {
    id: 'csharp',
    name: 'C#',
    aliases: ['csharp', 'cs', 'c#'],
    extension: '.cs',
    isCompiled: true,
    judge0Id: 51, // Mono C#
    compilerCommand: 'dotnet',
    compilerEnvVar: 'DOTNET_COMPILER',
    runtimeCommand: null,
    sourceFilename: () => 'Program.cs',
    outputFilename: () => 'Program.dll',
    getCompilerArgs: (sourcePath, outputPath) => ['build', sourcePath, '-o', path.dirname(outputPath)],
    getRuntimeArgs: (outputPath) => ['dotnet', outputPath],
    compileTimeoutMs: 15000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 256,
  },

  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    aliases: ['kotlin', 'kt'],
    extension: '.kt',
    isCompiled: true,
    judge0Id: 78, // Kotlin 1.3.70
    compilerCommand: 'kotlinc',
    compilerEnvVar: 'KOTLIN_COMPILER',
    runtimeCommand: 'java',
    runtimeEnvVar: 'JAVA_RUNTIME',
    sourceFilename: () => 'solution.kt',
    outputFilename: () => 'program.jar',
    getCompilerArgs: (sourcePath, outputPath) => [sourcePath, '-include-runtime', '-d', outputPath],
    getRuntimeArgs: (outputPath) => ['-Xmx256m', '-jar', outputPath],
    compileTimeoutMs: 15000,
    executionTimeoutMs: 5000,
    memoryLimitMb: 512,
  },
};

// Aliases lookup map
const ALIAS_LOOKUP = new Map();
Object.values(LANGUAGE_REGISTRY).forEach((spec) => {
  spec.aliases.forEach((alias) => ALIAS_LOOKUP.set(alias.toLowerCase(), spec.id));
});

export function normalizeLanguage(lang) {
  const cleaned = String(lang || '').trim().toLowerCase();
  return ALIAS_LOOKUP.get(cleaned) || cleaned;
}

export function getLanguageSpec(lang) {
  const normalized = normalizeLanguage(lang);
  const spec = LANGUAGE_REGISTRY[normalized];
  if (!spec) {
    const error = new Error(`Unsupported programming language: ${lang || 'unspecified'}`);
    error.statusCode = 400;
    error.errorCode = 'UNSUPPORTED_LANGUAGE';
    throw error;
  }
  return spec;
}

/**
 * Checks availability of all registered toolchains on current host
 */
export async function auditToolchains() {
  const report = {};
  for (const [id, spec] of Object.entries(LANGUAGE_REGISTRY)) {
    let compilerAvailable = true;
    let compilerPath = null;
    let compilerVersion = null;

    if (spec.compilerCommand) {
      compilerPath = await resolveExecutable(spec.compilerCommand, spec.compilerEnvVar);
      const test = await testExecutable(compilerPath, spec.id === 'java' ? ['-version'] : ['--version']);
      compilerAvailable = test.available;
      compilerVersion = test.version;
    }

    let runtimeAvailable = true;
    let runtimePath = null;
    let runtimeVersion = null;

    if (spec.runtimeCommand) {
      runtimePath = await resolveExecutable(spec.runtimeCommand, spec.runtimeEnvVar);
      const test = await testExecutable(runtimePath, spec.id === 'java' ? ['-version'] : ['--version']);
      runtimeAvailable = test.available;
      runtimeVersion = test.version;
    }

    const readyLocally = compilerAvailable && runtimeAvailable;

    report[id] = {
      id,
      name: spec.name,
      isCompiled: spec.isCompiled,
      readyLocally,
      compiler: spec.compilerCommand ? {
        command: spec.compilerCommand,
        resolvedPath: compilerPath,
        available: compilerAvailable,
        version: compilerVersion,
      } : null,
      runtime: spec.runtimeCommand ? {
        command: spec.runtimeCommand,
        resolvedPath: runtimePath,
        available: runtimeAvailable,
        version: runtimeVersion,
      } : null,
      sandboxFallbackAvailable: Boolean(spec.judge0Id),
    };
  }
  return report;
}

/**
 * Startup diagnostic logger for backend console
 */
export async function logStartupDiagnostics() {
  try {
    const report = await auditToolchains();
    logger.info('========================================================================');
    logger.info('🛠️   CODEEXAM COMPILER & RUNTIME TOOLCHAIN AUDIT');
    logger.info('========================================================================');
    for (const item of Object.values(report)) {
      const statusIcon = item.readyLocally ? '✅ READY (Local)' : (item.sandboxFallbackAvailable ? '🌐 ACTIVE (Sandbox Fallback)' : '⚠️  UNAVAILABLE');
      logger.info(`  • [${item.id.toUpperCase().padEnd(10)}] ${item.name.padEnd(24)} -> ${statusIcon}`);
      if (item.compiler && !item.compiler.available) {
        logger.warn(`      Missing compiler: ${item.compiler.command} (Path: ${item.compiler.resolvedPath})`);
      }
      if (item.runtime && !item.runtime.available) {
        logger.warn(`      Missing runtime: ${item.runtime.command} (Path: ${item.runtime.resolvedPath})`);
      }
    }
    logger.info('========================================================================');
  } catch (err) {
    logger.warn('Error running compiler startup diagnostics:', err.message);
  }
}

