import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { logger } from '../utils/logger.js';

const GRACE_PERIOD_MS = 0;

export class SessionService {
  static getServerTime() {
    return new Date();
  }

  static calculateRemainingSeconds(endTimeStr, currentTime = new Date()) {
    if (!endTimeStr) return 0;
    const endMs = new Date(endTimeStr).getTime();
    const nowMs = currentTime.getTime();
    return Math.max(0, Math.floor((endMs - nowMs) / 1000));
  }

  static isSessionExpired(endTimeStr, currentTime = new Date()) {
    if (!endTimeStr) return false;
    const endMs = new Date(endTimeStr).getTime();
    const nowMs = currentTime.getTime();
    return nowMs >= endMs + GRACE_PERIOD_MS;
  }

  static async getSessionById(sessionId) {
    let session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
        if (!error && data) {
          session = data.data && typeof data.data === 'object' ? { ...data.data, ...data } : data;
          memoryStore.sessions.push(session);
        }
      } catch (err) {
        logger.warn('Supabase getSessionById error:', err.message);
      }
    }
    if (!session) return null;

    const remainingTime = this.calculateRemainingSeconds(session.end_time);
    return {
      ...session,
      remaining_seconds: remainingTime,
    };
  }

  static async getStudentSessions(studentId) {
    let list = memoryStore.sessions.filter(
      (s) => s.student_id === studentId || s.candidateId === studentId
    );
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .or(`student_id.eq.${studentId},candidate_id.eq.${studentId}`);
        if (!error && Array.isArray(data)) {
          for (const s of data) {
            const unpacked = s.data && typeof s.data === 'object' ? { ...s.data, ...s } : s;
            if (!list.some((x) => x.id === unpacked.id)) {
              list.push(unpacked);
              if (!memoryStore.sessions.some((x) => x.id === unpacked.id)) {
                memoryStore.sessions.push(unpacked);
              }
            }
          }
        }
      } catch (err) {
        logger.warn('Supabase getStudentSessions error:', err.message);
      }
    }
    return list;
  }

  static async getAllCompletedSessions() {
    return memoryStore.sessions.filter(
      (s) => s.status !== 'ACTIVE' && s.state !== 'ACTIVE'
    );
  }

  static async getActiveSessions() {
    return memoryStore.sessions.filter((s) => s.status === 'ACTIVE');
  }

  static async startOrRestoreSession(testId, studentId, studentName = 'Student', currentTime = null, studentEmail = null) {
    let test = memoryStore.tests.find((t) => t.id === testId && !t.is_deleted);
    if (!test && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.from('assessments').select('*').eq('id', testId).maybeSingle();
        if (data) {
          test = data.data || data;
          memoryStore.tests.push(test);
        }
      } catch {}
    }
    if (!test) {
      throw new Error('Test not found or has been deleted.');
    }
    const now = currentTime ? new Date(currentTime) : this.getServerTime();

    // 1. Session Locking / Resuming: check for existing active session for this student + test FIRST
    const normalizedEmail = (studentEmail || '').toLowerCase();
    let existingActive = memoryStore.sessions.find(
      (s) =>
        (s.test_id === testId || s.assessmentId === testId) &&
        (s.student_id === studentId || s.candidateId === studentId || (normalizedEmail && (s.student_email?.toLowerCase() === normalizedEmail || s.candidateEmail?.toLowerCase() === normalizedEmail))) &&
        (s.status === 'ACTIVE' || s.attempt_status === 'IN_PROGRESS')
    );

    if (!existingActive && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase
          .from('sessions')
          .select('*')
          .eq('test_id', testId)
          .eq('student_id', studentId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (data) {
          existingActive = data.data && typeof data.data === 'object' ? { ...data.data, ...data } : data;
          memoryStore.sessions.push(existingActive);
        }
      } catch {}
    }

    if (existingActive) {
      // Reconnection: check if session duration has expired
      if (existingActive.end_time && now.getTime() >= new Date(existingActive.end_time).getTime()) {
        await this.autoSubmitSession(existingActive.id, now);
        const error = new Error('Assessment session duration has expired.');
        error.statusCode = 409;
        error.errorCode = 'ATTEMPT_EXPIRED';
        throw error;
      }

      existingActive.connection_status = 'connected';
      existingActive.last_heartbeat = now.toISOString();
      existingActive.last_seen_at = now.toISOString();
      existingActive.updated_at = now.toISOString();

      const remainingTime = this.calculateRemainingSeconds(existingActive.end_time, now);
      logger.info(`Restoring existing active session ${existingActive.id} for student ${studentId}. Remaining: ${remainingTime}s`);

      return {
        session: {
          ...existingActive,
          remaining_seconds: remainingTime,
          remainingSec: remainingTime,
        },
        isRestored: true,
        serverTime: now.toISOString(),
      };
    }

    // 2. Authoritative scheduling validation for NEW attempts
    const scheduledStart = test.start_time || test.startTime ? new Date(test.start_time || test.startTime).getTime() : null;
    const scheduledEnd = test.end_time || test.endTime ? new Date(test.end_time || test.endTime).getTime() : null;

    if (['DRAFT', 'CLOSED', 'DELETED'].includes(String(test.status || '').toUpperCase())) {
      const error = new Error('Assessment is not available.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_AVAILABLE';
      throw error;
    }
    if (scheduledStart && now.getTime() < scheduledStart) {
      const error = new Error('Assessment has not started yet. Please wait until scheduled start time.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_STARTED';
      throw error;
    }
    if (scheduledEnd && now.getTime() >= scheduledEnd) {
      const error = new Error('Assessment availability has ended.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_CLOSED';
      throw error;
    }

    // 3. Compute absolute server end time based on test duration
    const durationMinutes = Number(test.duration_minutes || test.durationMinutes || test.duration || 60);
    const startedAt = now.toISOString();
    const endTime = new Date(now.getTime() + durationMinutes * 60000).toISOString();
    const sessionId = `sess-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const isEqualMarks = Boolean(test.is_equal_marks ?? test.isEqualMarks ?? true);
    const testQuestionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
    let calculatedTotalMarks = Number(test.total_marks || 100);
    if (isEqualMarks) {
      const marksPerQ = Number(test.marks_per_question ?? test.marksPerQuestion ?? 20);
      if (testQuestionIds.length > 0) {
        calculatedTotalMarks = testQuestionIds.length * marksPerQ;
      }
    } else {
      let sumTcMax = 0;
      for (const qId of testQuestionIds) {
        const qObj = memoryStore.questions.find((x) => x.id === qId);
        const qTcs = memoryStore.testcases.filter((tc) => tc.question_id === qId);
        const hasCustom = qTcs.some((tc) => tc.marks !== undefined || tc.points !== undefined);
        if (hasCustom && qTcs.length > 0) {
          sumTcMax += qTcs.reduce((acc, tc) => acc + Number(tc.marks ?? tc.points ?? 0), 0);
        } else if (qObj) {
          sumTcMax += Number(qObj.marks || qObj.points || 20);
        }
      }
      if (sumTcMax > 0) calculatedTotalMarks = sumTcMax;
    }

    const newSession = {
      id: sessionId,
      student_id: studentId,
      student_name: studentName,
      student_email: studentEmail,
      candidateId: studentId,
      candidateName: studentName,
      candidateEmail: studentEmail,
      test_id: testId,
      assessmentId: testId,
      test_title: test.title,
      status: 'ACTIVE',
      attempt_status: 'IN_PROGRESS',
      assessment_status: String(test.status || 'ACTIVE').toUpperCase(),
      started_at: startedAt,
      start_time: startedAt,
      end_time: endTime,
      submitted_at: null,
      connection_status: 'connected',
      last_heartbeat: startedAt,
      last_seen_at: startedAt,
      score: 0,
      total_marks: calculatedTotalMarks,
      percentage: 0,
      warnings_count: 0,
      created_at: startedAt,
      updated_at: startedAt,
    };

    memoryStore.sessions.unshift(newSession);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('sessions').upsert({
          id: newSession.id,
          test_id: newSession.test_id,
          assessment_id: newSession.test_id,
          student_id: newSession.student_id,
          student_email: newSession.student_email,
          candidate_id: newSession.student_id,
          candidate_email: newSession.student_email,
          candidate_name: newSession.student_name,
          status: newSession.status,
          attempt_status: newSession.attempt_status,
          started_at: newSession.started_at,
          last_heartbeat: newSession.last_heartbeat,
          last_seen_at: newSession.last_seen_at,
          final_score: newSession.score,
          total_points: newSession.total_marks,
          data: newSession,
          created_at: newSession.created_at,
          updated_at: newSession.updated_at,
        });
        if (error) throw error;
      } catch (err) {
        logger.warn('Supabase create session fallback:', err.message);
        if (process.env.NODE_ENV === 'production') throw err;
      }
    }

    logger.info(`Created active session ${sessionId} for student ${studentId} on test ${testId}. End time: ${endTime}`);

    return {
      session: {
        ...newSession,
        remaining_seconds: durationMinutes * 60,
        remainingSec: durationMinutes * 60,
      },
      isRestored: false,
      serverTime: startedAt,
    };
  }

  static async recordHeartbeat(sessionId) {
    let session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
        if (data) {
          session = data;
          memoryStore.sessions.push(session);
        }
      } catch {}
    }
    if (!session) return null;

    // Heartbeats may update a live attempt or finalize it at its deadline, but
    // must never revive a submitted, terminated, or previously expired session.
    if (session.status?.toUpperCase() !== 'ACTIVE' || (session.attempt_status && session.attempt_status !== 'IN_PROGRESS')) {
      const error = new Error('This assessment session is no longer active.');
      error.statusCode = 409;
      error.errorCode = 'SESSION_NOT_ACTIVE';
      throw error;
    }

    const now = this.getServerTime();
    const nowIso = now.toISOString();
    session.last_heartbeat = nowIso;
    session.last_seen_at = nowIso;
    session.connection_status = 'connected';
    session.updated_at = nowIso;

    const remainingTime = this.calculateRemainingSeconds(session.end_time, now);
    const isExpired = this.isSessionExpired(session.end_time, now);

    if (isExpired && (session.attempt_status === 'IN_PROGRESS' || session.status === 'ACTIVE')) {
      session.status = 'EXPIRED';
      session.attempt_status = 'AUTO_SUBMITTED';
      session.submitted_at = nowIso;
      session.completed_at = nowIso;
      logger.info(`Session ${sessionId} marked EXPIRED by authoritative server clock.`);
    }

    // Asynchronously sync to Supabase without blocking the HTTP response
    if (isSupabaseConfigured && supabase) {
      supabase
        .from('sessions')
        .update({
          last_heartbeat: nowIso,
          last_seen_at: nowIso,
          updated_at: nowIso,
          data: session,
          ...(isExpired ? { status: 'EXPIRED', attempt_status: 'AUTO_SUBMITTED', submitted_at: nowIso, completed_at: nowIso } : {}),
        })
        .eq('id', sessionId)
        .eq('status', 'ACTIVE')
        .then(() => {})
        .catch((err) => logger.warn('Supabase heartbeat sync error:', err.message));
    }

    return {
      success: true,
      session,
      serverTime: nowIso,
      remaining_seconds: remainingTime,
      remainingSec: remainingTime,
      isExpired,
      status: session.status,
      connection_status: 'connected',
    };
  }

  static async updateConnectionStatus(sessionId, connectionStatus) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    session.connection_status = connectionStatus; // 'connected' or 'disconnected'
    session.updated_at = new Date().toISOString();
    return session;
  }

  static async submitSession(sessionId, submission = {}) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const nowDate = this.getServerTime();
    const now = nowDate.toISOString();
    if (session.end_time && nowDate.getTime() >= new Date(session.end_time).getTime()) {
      return this.autoSubmitSession(sessionId, nowDate);
    }
    if (session.attempt_status && session.attempt_status !== 'IN_PROGRESS') return session;

    const test = memoryStore.tests.find((t) => t.id === session.test_id);
    const studentTestSubs = memoryStore.submissions.filter(
      (s) => s.student_id === session.student_id && s.test_id === session.test_id
    );

    let totalScore = 0;
    if (studentTestSubs.length > 0) {
      const questionScoreMap = new Map();
      for (const sub of studentTestSubs) {
        const existing = questionScoreMap.get(sub.question_id) || 0;
        questionScoreMap.set(sub.question_id, Math.max(existing, Number(sub.score || 0)));
      }
      for (const sScore of questionScoreMap.values()) {
        totalScore += sScore;
      }
    } else if (submission.score !== undefined && submission.score !== null) {
      totalScore = Number(submission.score);
    }
    session.score = Math.round((totalScore + Number.EPSILON) * 100) / 100;

    let totalMarks = Number(session.total_marks || test?.total_marks || 100);
    if (test) {
      const isEqualMarks = Boolean(test.is_equal_marks ?? test.isEqualMarks ?? true);
      const testQuestionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
      if (isEqualMarks) {
        const marksPerQ = Number(test.marks_per_question ?? test.marksPerQuestion ?? 20);
        if (testQuestionIds.length > 0) {
          totalMarks = testQuestionIds.length * marksPerQ;
        }
      } else {
        let sumTcMax = 0;
        for (const qId of testQuestionIds) {
          const qObj = memoryStore.questions.find((x) => x.id === qId);
          const qTcs = memoryStore.testcases.filter((tc) => tc.question_id === qId);
          const hasCustom = qTcs.some((tc) => tc.marks !== undefined || tc.points !== undefined);
          if (hasCustom && qTcs.length > 0) {
            sumTcMax += qTcs.reduce((acc, tc) => acc + Number(tc.marks ?? tc.points ?? 0), 0);
          } else if (qObj) {
            sumTcMax += Number(qObj.marks || qObj.points || 20);
          }
        }
        if (sumTcMax > 0) totalMarks = sumTcMax;
      }
    }
    session.total_marks = Math.round((totalMarks + Number.EPSILON) * 100) / 100;
    session.percentage = session.total_marks > 0
      ? Math.round(((session.score / session.total_marks) * 100) * 100) / 100
      : 0;

    if (submission.state !== undefined) session.latest_submission = submission.state;
    session.status = 'SUBMITTED';
    session.attempt_status = 'SUBMITTED';
    session.submitted_at = now;
    session.completed_at = now;
    session.updated_at = now;

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('sessions').update({
          final_score: session.score,
          total_points: session.total_marks,
          status: 'SUBMITTED',
          attempt_status: 'SUBMITTED',
          submitted_at: now,
          completed_at: now,
          updated_at: now,
          data: session,
        }).eq('id', sessionId);
        if (error) throw error;
      } catch (err) {
        logger.warn('Supabase submit session fallback:', err.message);
        if (process.env.NODE_ENV === 'production') throw err;
      }
    }

    logger.info(`Session ${sessionId} successfully SUBMITTED. Score: ${session.score}/${session.total_marks} (${session.percentage}%)`);
    return session;
  }

  static async autoSubmitSession(sessionId, currentTime = this.getServerTime(), submission = {}) {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    if (session.attempt_status && session.attempt_status !== 'IN_PROGRESS') return session;
    if (session.end_time && currentTime.getTime() < new Date(session.end_time).getTime()) {
      const error = new Error('Assessment has not reached its end time.');
      error.statusCode = 409;
      error.errorCode = 'ASSESSMENT_NOT_EXPIRED';
      throw error;
    }
    const now = currentTime.toISOString();

    const test = memoryStore.tests.find((t) => t.id === session.test_id);
    const studentTestSubs = memoryStore.submissions.filter(
      (s) => s.student_id === session.student_id && s.test_id === session.test_id
    );

    let totalScore = 0;
    if (studentTestSubs.length > 0) {
      const questionScoreMap = new Map();
      for (const sub of studentTestSubs) {
        const existing = questionScoreMap.get(sub.question_id) || 0;
        questionScoreMap.set(sub.question_id, Math.max(existing, Number(sub.score || 0)));
      }
      for (const sScore of questionScoreMap.values()) {
        totalScore += sScore;
      }
    } else if (submission.score !== undefined && submission.score !== null) {
      totalScore = Number(submission.score);
    }
    session.score = Math.round((totalScore + Number.EPSILON) * 100) / 100;

    let totalMarks = Number(session.total_marks || test?.total_marks || 100);
    if (test) {
      const isEqualMarks = Boolean(test.is_equal_marks ?? test.isEqualMarks ?? true);
      const testQuestionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
      if (isEqualMarks) {
        const marksPerQ = Number(test.marks_per_question ?? test.marksPerQuestion ?? 20);
        if (testQuestionIds.length > 0) {
          totalMarks = testQuestionIds.length * marksPerQ;
        }
      } else {
        let sumTcMax = 0;
        for (const qId of testQuestionIds) {
          const qObj = memoryStore.questions.find((x) => x.id === qId);
          const qTcs = memoryStore.testcases.filter((tc) => tc.question_id === qId);
          const hasCustom = qTcs.some((tc) => tc.marks !== undefined || tc.points !== undefined);
          if (hasCustom && qTcs.length > 0) {
            sumTcMax += qTcs.reduce((acc, tc) => acc + Number(tc.marks ?? tc.points ?? 0), 0);
          } else if (qObj) {
            sumTcMax += Number(qObj.marks || qObj.points || 20);
          }
        }
        if (sumTcMax > 0) totalMarks = sumTcMax;
      }
    }
    session.total_marks = Math.round((totalMarks + Number.EPSILON) * 100) / 100;
    session.percentage = session.total_marks > 0
      ? Math.round(((session.score / session.total_marks) * 100) * 100) / 100
      : 0;

    if (submission.state !== undefined) session.latest_submission = submission.state;
    session.status = 'EXPIRED';
    session.attempt_status = 'AUTO_SUBMITTED';
    session.submitted_at = session.submitted_at || now;
    session.completed_at = session.completed_at || now;
    session.updated_at = now;

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('sessions').update({
          final_score: session.score,
          total_points: session.total_marks,
          status: 'EXPIRED',
          attempt_status: 'AUTO_SUBMITTED',
          submitted_at: session.submitted_at,
          completed_at: session.completed_at,
          updated_at: now,
          data: session,
        }).eq('id', sessionId);
        if (error) throw error;
      } catch (err) {
        logger.warn('Supabase auto submit session fallback:', err.message);
        if (process.env.NODE_ENV === 'production') throw err;
      }
    }
    return session;
  }

  static async getAttempt(testId, studentId) {
    const session = memoryStore.sessions.find(
      (item) => item.test_id === testId && item.student_id === studentId &&
        ['IN_PROGRESS', 'ACTIVE'].includes(item.attempt_status || item.status)
    );
    if (!session) return null;
    const serverTime = this.getServerTime();
    if (this.isSessionExpired(session.end_time, serverTime)) {
      await this.autoSubmitSession(session.id, serverTime);
    }
    return {
      ...session,
      server_time: serverTime.toISOString(),
      remaining_seconds: this.calculateRemainingSeconds(session.end_time, serverTime),
    };
  }

  static async expireDueSessions() {
    const now = this.getServerTime();
    for (const session of memoryStore.sessions) {
      if (['IN_PROGRESS', 'ACTIVE'].includes(session.attempt_status || session.status) &&
          session.end_time && new Date(session.end_time).getTime() <= now.getTime()) {
        await this.autoSubmitSession(session.id, now);
      }
    }
  }

  static async terminateSession(sessionId, reason = 'Terminated by proctor') {
    const session = memoryStore.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const now = new Date().toISOString();
    session.status = 'TERMINATED';
    session.submitted_at = now;
    session.termination_reason = reason;
    session.updated_at = now;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('sessions').update({ status: 'TERMINATED', submitted_at: now, updated_at: now }).eq('id', sessionId);
      } catch (err) {
        logger.warn('Supabase terminate session fallback:', err.message);
      }
    }

    logger.info(`Session ${sessionId} TERMINATED. Reason: ${reason}`);
    return session;
  }

  static async getSessionsByTestId(testId) {
    return memoryStore.sessions.filter((s) => s.test_id === testId || s.assessmentId === testId);
  }
}
