import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCodeInSandbox, executeCodeBatchInSandbox, normalizeLanguage, LANGUAGE_CONFIG } from '../services/codeRunnerService.js';
import { detectJavaMainClass, resolveExecutable, auditToolchains } from '../services/compilerRegistry.js';
import { evaluateOutput, normalizeOutputLines, calculateQuestionScore, calculateTestCaseBasedScore } from '../services/scoringService.js';
import { SubmissionService } from '../services/submissionService.js';
import { memoryStore } from '../services/supabaseService.js';

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
  assert.equal(report.javascript.readyLocally, true);
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

test('Output Evaluation: Handles trailing newline differences safely', () => {
  assert.equal(evaluateOutput('Hello World\n', 'Hello World'), true);
  assert.equal(evaluateOutput('Hello World\n\n\n', 'Hello World'), true);
  assert.equal(evaluateOutput('Line 1  \nLine 2  \n', 'Line 1\nLine 2'), true);
});

test('Output Evaluation: Handles Windows vs Unix line endings safely', () => {
  assert.equal(evaluateOutput('Line 1\r\nLine 2\r\n', 'Line 1\nLine 2\n'), true);
  assert.equal(evaluateOutput('Line 1\r\nLine 2', 'Line 1\nLine 2'), true);
});

test('Output Evaluation: Preserves meaningful internal characters and rejects incorrect output', () => {
  assert.equal(evaluateOutput('Hello World', 'Hello world'), false); // Case sensitive
  assert.equal(evaluateOutput('12 34', '12  34'), false); // Internal spacing
  assert.equal(evaluateOutput('Wrong', 'Expected'), false);
});

test('Output Evaluation: Handles empty input and empty output correctly', () => {
  assert.equal(evaluateOutput('', ''), true);
  assert.equal(evaluateOutput('\n\r\n', ''), true);
  assert.equal(evaluateOutput('', 'some expected'), false);
  assert.equal(evaluateOutput('some actual', ''), false);
});

test('Submission Workflow: Evaluates and grades question submission end-to-end', async () => {
  const testQuestionId = `test-q-${Date.now()}`;
  memoryStore.questions.push({
    id: testQuestionId,
    title: 'Sum Problem',
    marks: 20,
    testcases: [
      { id: 'tc-1', question_id: testQuestionId, input: '2 3', expected_output: '5', is_hidden: false },
      { id: 'tc-2', question_id: testQuestionId, input: '10 20', expected_output: '30', is_hidden: true },
    ],
  });

  const correctCode = `
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) process.exit(0);
    const [a, b] = input.split(/\\s+/).map(Number);
    console.log(a + b);
  `;

  const subResult = await SubmissionService.submitQuestionCode({
    studentId: 'test-student-1',
    studentName: 'Alice',
    testId: 'test-asm-1',
    questionId: testQuestionId,
    code: correctCode,
    language: 'javascript',
  });

  assert.equal(subResult.resultStatus, 'ACCEPTED');
  assert.equal(subResult.passed_count, 2);
  assert.equal(subResult.total_testcases, 2);
  assert.equal(subResult.score, 20);
  assert.equal(subResult.testcase_results.length, 2);
  assert.equal(subResult.testcase_results[0].passed, true);
  assert.equal(subResult.testcase_results[1].passed, true);
});

test('Submission Workflow: Handles partial failures and incorrect answers accurately', async () => {
  const testQuestionId = `test-q-partial-${Date.now()}`;
  memoryStore.questions.push({
    id: testQuestionId,
    title: 'Condition Problem',
    marks: 20,
    testcases: [
      { id: 'tc-1', question_id: testQuestionId, input: '1', expected_output: '1', is_hidden: false },
      { id: 'tc-2', question_id: testQuestionId, input: '2', expected_output: '4', is_hidden: true },
    ],
  });

  // Code that only handles input '1' correctly
  const partialCode = `
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf-8').trim();
    console.log(1);
  `;

  const subResult = await SubmissionService.submitQuestionCode({
    studentId: 'test-student-2',
    studentName: 'Bob',
    testId: 'test-asm-1',
    questionId: testQuestionId,
    code: partialCode,
    language: 'javascript',
  });

  assert.equal(subResult.resultStatus, 'PARTIAL');
  assert.equal(subResult.passed_count, 1);
  assert.equal(subResult.total_testcases, 2);
  assert.equal(subResult.score, 10); // 1 of 2 passed on 20 marks => 10 marks
  assert.equal(subResult.testcase_results[0].passed, true);
  assert.equal(subResult.testcase_results[1].passed, false);
});
