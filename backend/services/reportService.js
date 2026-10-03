import { memoryStore } from './supabaseService.js';

export class ReportService {
  static async getOverviewReport() {
    const activeTests = memoryStore.tests.filter((t) => !t.is_deleted && t.status !== 'DELETED');
    const totalStudents = memoryStore.users.filter((u) => u.role === 'STUDENT').length;
    const totalFaculty = memoryStore.users.filter((u) => u.role === 'FACULTY').length;
    const totalQuestions = memoryStore.questions.length;
    const totalSessions = memoryStore.sessions.length;
    const completedSessions = memoryStore.sessions.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'EXPIRED'
    );
    const activeSessions = memoryStore.sessions.filter((s) => s.status === 'ACTIVE');

    const totalSubmissions = memoryStore.submissions.length;
    const averageScore = completedSessions.length > 0
      ? Math.round(
          (completedSessions.reduce((sum, s) => sum + Number(s.score || 0), 0) / completedSessions.length) * 100
        ) / 100
      : 0;

    return {
      total_tests: activeTests.length,
      total_students: totalStudents,
      total_faculty: totalFaculty,
      total_questions: totalQuestions,
      total_sessions: totalSessions,
      completed_sessions: completedSessions.length,
      active_sessions: activeSessions.length,
      total_submissions: totalSubmissions,
      average_score: averageScore,
    };
  }

  static async getTestReport(testId) {
    const test = memoryStore.tests.find((t) => t.id === testId && !t.is_deleted);
    if (!test) return null;

    const testSessions = memoryStore.sessions.filter((s) => s.test_id === testId);
    const completedSessions = testSessions.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'EXPIRED'
    );
    const scores = completedSessions.map((s) => Number(s.score || 0));
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

    const passingMarks = test.passing_marks || Math.round((test.total_marks || 100) * 0.4);
    const passedCount = completedSessions.filter((s) => Number(s.score || 0) >= passingMarks).length;

    return {
      test: {
        id: test.id,
        title: test.title,
        total_marks: test.total_marks,
        passing_marks: passingMarks,
        duration_minutes: test.duration_minutes,
      },
      summary: {
        total_attempted: testSessions.length,
        total_completed: completedSessions.length,
        passed_count: passedCount,
        pass_percentage: completedSessions.length > 0
          ? Math.round((passedCount / completedSessions.length) * 10000) / 100
          : 0,
        average_score: avgScore,
        highest_score: highestScore,
        lowest_score: lowestScore,
      },
      candidate_results: completedSessions.map((s) => ({
        session_id: s.id,
        student_id: s.student_id,
        student_name: s.student_name,
        score: s.score,
        total_marks: test.total_marks,
        percentage: test.total_marks > 0
          ? Math.round((s.score / test.total_marks) * 10000) / 100
          : 0,
        status: s.status,
        submitted_at: s.submitted_at || s.updated_at,
      })),
    };
  }

  static async getStudentReport(studentId) {
    const student = memoryStore.users.find((u) => u.id === studentId);
    if (!student) return null;

    const validTestIds = new Set(
      memoryStore.tests.filter((t) => !t.is_deleted).map((t) => t.id)
    );

    const studentSessions = memoryStore.sessions.filter(
      (s) => s.student_id === studentId && validTestIds.has(s.test_id)
    );

    const completed = studentSessions.filter(
      (s) => s.status === 'SUBMITTED' || s.status === 'EXPIRED'
    );

    return {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        register_number: student.register_number,
        department: student.department,
      },
      stats: {
        tests_attended: studentSessions.length,
        tests_completed: completed.length,
        total_score: completed.reduce((sum, s) => sum + Number(s.score || 0), 0),
      },
      history: studentSessions.map((s) => {
        const test = memoryStore.tests.find((t) => t.id === s.test_id);
        return {
          session_id: s.id,
          test_id: s.test_id,
          test_title: test?.title || s.test_title,
          score: s.score,
          total_marks: test?.total_marks || 100,
          status: s.status,
          started_at: s.started_at,
          submitted_at: s.submitted_at,
        };
      }),
    };
  }
}
