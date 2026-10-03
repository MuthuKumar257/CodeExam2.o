import { memoryStore } from './supabaseService.js';

export class RankingService {
  /**
   * Get finalized rankings across all tests or for a specific test.
   * Excludes deleted tests!
   */
  static async getRankings(testId = null) {
    const validTestIds = new Set(
      memoryStore.tests
        .filter((t) => !t.is_deleted && t.status !== 'DELETED')
        .map((t) => t.id)
    );

    let candidateSessions = memoryStore.sessions.filter((s) => {
      // Must belong to a valid non-deleted test
      if (!validTestIds.has(s.test_id)) return false;
      // Filter by testId if provided
      if (testId && s.test_id !== testId) return false;
      // Must be finalized or completed
      return s.status === 'SUBMITTED' || s.status === 'EXPIRED';
    });

    const studentMap = new Map();

    for (const session of candidateSessions) {
      const studentId = session.student_id;
      const test = memoryStore.tests.find((t) => t.id === session.test_id);
      const testMaxMarks = test?.total_marks || 100;

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          student_name: session.student_name || 'Student',
          total_score: 0,
          total_max_marks: 0,
          tests_completed: 0,
        });
      }

      const rec = studentMap.get(studentId);
      rec.total_score += Number(session.score || 0);
      rec.total_max_marks += Number(testMaxMarks);
      rec.tests_completed += 1;
    }

    const rankings = Array.from(studentMap.values()).map((item) => {
      const percentage = item.total_max_marks > 0
        ? Math.round((item.total_score / item.total_max_marks) * 10000) / 100
        : 0;
      return {
        ...item,
        total_score: Math.round(item.total_score * 100) / 100,
        score: Math.round(item.total_score * 100) / 100,
        percentage,
      };
    });


    rankings.sort((a, b) => b.percentage - a.percentage || b.total_score - a.total_score);

    return rankings.map((r, index) => ({
      rank: index + 1,
      ...r,
    }));
  }

  static async getStudentRank(studentId) {
    const allRanks = await this.getRankings();
    return allRanks.find((r) => r.student_id === studentId) || null;
  }
}
