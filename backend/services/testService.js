import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { QuestionService } from './questionService.js';
import { logger } from '../utils/logger.js';

export class TestService {
  static async listTests(filter = {}) {
    const page = Math.max(1, Number(filter.page || 1));
    const limit = Math.max(1, Number(filter.limit || 50));

    let tests = memoryStore.tests.filter((t) => !t.is_deleted && t.status !== 'DELETED');

    if (filter.facultyId) {
      tests = tests.filter((t) => t.faculty_id === filter.facultyId);
    }
    if (filter.status) {
      tests = tests.filter((t) => t.status?.toUpperCase() === filter.status?.toUpperCase());
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('assessments').select('*', { count: 'exact' }).eq('is_deleted', false);
        if (filter.facultyId) query = query.eq('faculty_id', filter.facultyId);
        if (filter.status) query = query.eq('status', filter.status.toUpperCase());
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const { data, count, error } = await query.range(from, to);
        if (!error && Array.isArray(data) && data.length > 0) {
          const total = count ?? data.length;
          return {
            data,
            pagination: {
              page,
              limit,
              total,
              hasMore: page * limit < total,
            },
          };
        }
      } catch (err) {
        logger.warn('Supabase list tests fallback:', err.message);
      }
    }

    const total = tests.length;
    const startIndex = (page - 1) * limit;
    const paginated = tests.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  static async getTestById(id) {
    const test = memoryStore.tests.find((t) => t.id === id && !t.is_deleted);
    if (!test) return null;

    // Load full question objects for this test
    const allQuestions = await QuestionService.listQuestions('STUDENT');
    const questionIds = Array.isArray(test.question_ids) ? test.question_ids : [];
    const questions = allQuestions.filter((q) => questionIds.includes(q.id));

    return {
      ...test,
      questions,
    };
  }

  static async createTest(data, facultyId = 'usr-faculty-01', facultyName = 'Faculty Member') {
    const id = data.id || `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const questionIds = Array.isArray(data.question_ids)
      ? data.question_ids
      : (Array.isArray(data.questions) ? data.questions.map((q) => typeof q === 'string' ? q : q.id) : []);

    const isEqualMarks = Boolean(data.is_equal_marks ?? data.isEqualMarks ?? true);
    const marksPerQuestion = data.marks_per_question ?? data.marksPerQuestion ?? (isEqualMarks ? 20 : null);

    // Calculate total marks based on isEqualMarks
    let totalMarks = 0;
    if (isEqualMarks && marksPerQuestion) {
      totalMarks = (questionIds.length || 1) * Number(marksPerQuestion);
    } else {
      for (const qId of questionIds) {
        const q = memoryStore.questions.find((x) => x.id === qId);
        if (q) {
          const tcs = memoryStore.testcases.filter((tc) => tc.question_id === qId);
          const hasCustom = tcs.some((tc) => tc.marks !== undefined || tc.points !== undefined);
          if (hasCustom && tcs.length > 0) {
            totalMarks += tcs.reduce((acc, tc) => acc + Number(tc.marks ?? tc.points ?? 0), 0);
          } else {
            totalMarks += Number(q.marks || q.points || 20);
          }
        }
      }
    }
    if (totalMarks <= 0) totalMarks = Number(data.total_marks || data.totalMarks || 100);

    const durationMinutes = Number(data.duration_minutes || data.durationMinutes || data.duration || 60);
    const startTime = data.start_time || data.startTime || new Date().toISOString();
    const endTime = data.end_time || data.endTime || new Date(Date.now() + 7 * 86400000).toISOString();

    const newTest = {
      id,
      title: data.title || 'Untitled Assessment',
      description: data.description || '',
      instructions: data.instructions || 'Read all instructions carefully before starting.',
      duration_minutes: durationMinutes,
      durationMinutes,
      start_time: startTime,
      startTime,
      end_time: endTime,
      endTime,
      is_equal_marks: isEqualMarks,
      isEqualMarks,
      marks_per_question: marksPerQuestion,
      marksPerQuestion,
      total_marks: totalMarks,
      totalMarks,
      passing_marks: Number(data.passing_marks || Math.round(totalMarks * 0.4)),
      faculty_id: facultyId,
      faculty_name: data.faculty_name || facultyName,
      status: data.status || 'ACTIVE',
      question_ids: questionIds,
      questions: questionIds,
      allowed_languages: data.allowed_languages || ['javascript', 'python', 'cpp', 'java'],
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    memoryStore.tests.unshift(newTest);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('tests').upsert(newTest);
      } catch (err) {
        logger.warn('Supabase create test fallback:', err.message);
      }
    }

    return newTest;
  }

  static async updateTest(id, data) {
    const index = memoryStore.tests.findIndex((t) => t.id === id && !t.is_deleted);
    if (index === -1) return null;

    const current = memoryStore.tests[index];
    const startTime = data.start_time || data.startTime || current.start_time || current.startTime;
    const endTime = data.end_time || data.endTime || current.end_time || current.endTime;
    const isEqualMarks = Boolean(data.is_equal_marks ?? data.isEqualMarks ?? current.is_equal_marks ?? current.isEqualMarks ?? true);
    const marksPerQuestion = data.marks_per_question ?? data.marksPerQuestion ?? current.marks_per_question ?? current.marksPerQuestion;

    const updated = {
      ...current,
      ...data,
      id,
      start_time: startTime,
      startTime,
      end_time: endTime,
      endTime,
      is_equal_marks: isEqualMarks,
      isEqualMarks,
      marks_per_question: marksPerQuestion,
      marksPerQuestion,
      updated_at: new Date().toISOString(),
    };
    memoryStore.tests[index] = updated;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('tests').update(updated).eq('id', id);
      } catch (err) {
        logger.warn('Supabase update test fallback:', err.message);
      }
    }

    return updated;
  }

  static async deleteTest(id) {
    if (!memoryStore.deletedAssessmentIds) memoryStore.deletedAssessmentIds = new Set();
    if (memoryStore.deletedAssessmentIds.has(id)) return true;
    memoryStore.deletedAssessmentIds.add(id);

    const index = memoryStore.tests.findIndex((t) => t.id === id);
    if (index !== -1) {
      memoryStore.tests.splice(index, 1);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('assessments').delete().eq('id', id);
        await supabase.from('tests').delete().eq('id', id);
      } catch (err) {
        logger.warn('Supabase delete test fallback:', err.message);
      }
    }

    return true;
  }
}
