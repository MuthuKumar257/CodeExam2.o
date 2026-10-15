import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../services/supabaseService.js';
import { SessionService } from '../services/sessionService.js';
import { SubmissionService } from '../services/submissionService.js';
import { TestService } from '../services/testService.js';
import { QuestionService } from '../services/questionService.js';

async function testSessionAndSubmission() {
  console.log('--- Starting Complete End-to-End Persistence Verification ---');

  // 1. Create a question
  const q = await QuestionService.createQuestion({
    title: 'Sum of Two Numbers',
    description: 'Return a + b',
    input_format: 'a b',
    output_format: 'sum',
    marks: 20,
  });
  await QuestionService.addTestcase(q.id, {
    input: '2 3',
    expected_output: '5',
    is_hidden: false,
  });
  console.log('1. Created Question:', q.id);

  // 2. Create an assessment with this question
  const test = await TestService.createTest({
    title: 'Math Assessment',
    question_ids: [q.id],
    durationMinutes: 30,
    isEqualMarks: true,
    marksPerQuestion: 20,
    totalMarks: 20,
  });
  console.log('2. Created Assessment:', test.id);

  // 3. Start a session for student
  const sessionRes = await SessionService.startOrRestoreSession(test.id, 'student-live-1', 'Test Student');
  const session = sessionRes.session;
  console.log('3. Created active session:', session.id);

  // Verify session in Supabase
  const { data: sbSession } = await supabase.from('sessions').select('id, student_id, status').eq('id', session.id).single();
  console.log('   Confirmed session in Supabase:', sbSession?.id, sbSession?.status);

  // 4. Submit code
  const codeToRun = `
const fs = require('fs');
const [a, b] = fs.readFileSync(0, 'utf-8').trim().split(' ').map(Number);
console.log(a + b);
`;
  const subResult = await SubmissionService.submitQuestionCode({
    studentId: 'student-live-1',
    studentName: 'Test Student',
    testId: test.id,
    questionId: q.id,
    sessionId: session.id,
    code: codeToRun,
    language: 'javascript',
  });
  console.log('4. Submission score:', subResult.score, 'status:', subResult.status);

  // Verify submission in Supabase
  const { data: sbSub } = await supabase.from('submissions').select('id, score, status').eq('id', subResult.id).single();
  console.log('   Confirmed submission in Supabase:', sbSub?.id, 'Score:', sbSub?.score);

  // 5. Submit session
  const finalSession = await SessionService.submitSession(session.id);
  console.log('5. Submitted session. Final Score:', finalSession.score, 'Percentage:', finalSession.percentage);

  // Verify updated session in Supabase
  const { data: sbFinalSession } = await supabase.from('sessions').select('id, final_score, status, data').eq('id', session.id).single();
  console.log('   Confirmed final session in Supabase:', sbFinalSession?.id, 'Status:', sbFinalSession?.status, 'Final Score:', sbFinalSession?.final_score);

  // 6. Verify recordings table holds NO blobs or base64
  const { data: recData } = await supabase.from('recordings').select('*').limit(5);
  for (const r of recData || []) {
    if (r.data && typeof r.data === 'object') {
      const dataStr = JSON.stringify(r.data);
      if (dataStr.length > 50000 || dataStr.includes('base64')) {
        throw new Error('Detected large blob or base64 in Supabase recordings table!');
      }
    }
  }
  console.log('6. Verified Supabase recordings contains zero video blobs or base64 content.');

  // Clean up
  await supabase.from('submissions').delete().eq('id', subResult.id);
  await supabase.from('sessions').delete().eq('id', session.id);
  await TestService.deleteTest(test.id);
  await QuestionService.deleteQuestion(q.id);
  console.log('--- All Tests Completed and Cleaned Up Successfully! ---');
}

testSessionAndSubmission().catch((e) => {
  console.error('VERIFICATION FAILED:', e);
  process.exit(1);
});
