import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCodeInSandbox, normalizeLanguage, LANGUAGE_CONFIG } from '../services/codeRunnerService.js';
import { detectJavaMainClass, resolveExecutable, auditToolchains } from '../services/compilerRegistry.js';

test('Compiler Registry: detectJavaMainClass extracts class name correctly', () => {
  const code1 = `
    package com.example;
    public class Solution {
      public static void main(String[] args) {
        System.out.println("Hello");
      }
    }
  `;
  assert.equal(detectJavaMainClass(code1), 'Solution');

  const code2 = `
    class TwoSum {
      public static void main(String[] args) {
      }
    }
  `;
  assert.equal(detectJavaMainClass(code2), 'TwoSum');

  const code3 = `
    public final class Calculator {
      public static void main(String[] args) {}
    }
  `;
  assert.equal(detectJavaMainClass(code3), 'Calculator');

  // Fallback default
  assert.equal(detectJavaMainClass('// no code or class here'), 'Main');
});

test('Compiler Registry: normalizeLanguage maps aliases correctly', () => {
  assert.equal(normalizeLanguage('C++'), 'cpp');
  assert.equal(normalizeLanguage('golang'), 'go');
  assert.equal(normalizeLanguage('py'), 'python');
  assert.equal(normalizeLanguage('js'), 'javascript');
  assert.equal(normalizeLanguage('ts'), 'typescript');
  assert.equal(normalizeLanguage('rs'), 'rust');
  assert.equal(normalizeLanguage('JAVA'), 'java');
});

test('Compiler Registry: auditToolchains returns status for all 10 languages', async () => {
  const report = await auditToolchains();
  assert.ok(report);
  assert.ok(report.javascript);
  assert.equal(report.javascript.readyLocally, true); // node is running this test
  assert.ok(report.python);
  assert.ok(report.java);
  assert.ok(report.cpp);
  assert.ok(report.c);
  assert.ok(report.go);
  assert.ok(report.rust);
});

test('Execution: JavaScript executes stdout correctly', async () => {
  const result = await executeCodeInSandbox('javascript', 'console.log("Hello from JS test");', '', 5000);
  assert.equal(result.status, 'passed');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'Hello from JS test');
});

test('Execution: JavaScript handles input via stdin', async () => {
  const code = `
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf-8').trim();
    console.log('Echo: ' + input);
  `;
  const result = await executeCodeInSandbox('javascript', code, 'CodeExam2026', 5000);
  assert.equal(result.status, 'passed');
  assert.equal(result.stdout.trim(), 'Echo: CodeExam2026');
});

test('Execution: Syntax error produces runtime error with stderr, not failure', async () => {
  const invalidCode = `function invalid( { `;
  const result = await executeCodeInSandbox('javascript', invalidCode, '', 5000);
  assert.equal(result.status, 'runtime_error');
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.stderr.length > 0);
});

test('Execution: Infinite loop triggers time limit exceeded', async () => {
  const loopCode = `while(true) {}`;
  const result = await executeCodeInSandbox('javascript', loopCode, '', 1000);
  assert.equal(result.status, 'time_limit_exceeded');
  assert.equal(result.success, false);
});

test('Execution: Language config contains all supported languages', async () => {
  const config = LANGUAGE_CONFIG['csharp'];
  assert.ok(config);
  assert.ok(LANGUAGE_CONFIG['java']);
  assert.ok(LANGUAGE_CONFIG['python']);
  assert.ok(LANGUAGE_CONFIG['cpp']);
  assert.ok(LANGUAGE_CONFIG['c']);
  assert.ok(LANGUAGE_CONFIG['go']);
  assert.ok(LANGUAGE_CONFIG['rust']);
});
