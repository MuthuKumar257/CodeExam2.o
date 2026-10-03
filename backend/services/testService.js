import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { QuestionService } from './questionService.js';
import { logger } from '../utils/logger.js';

export class TestService {
  static async listTests(filter = {}) {
    let tests = memoryStore.tests.filter((t) => !t.is_deleted && t.status !== 'DELETED');

    if (filter.facultyId) {
      tests = tests.filter((t) => t.faculty_id === filter.facultyId);
    }
    if (filter.status) {
      tests = tests.filter((t) => t.status?.toUpperCase() === filter.status?.toUpperCase());
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('tests').select('*').eq('is_deleted', false);
        if (filter.facultyId) query = query.eq('faculty_id', filter.facultyId);
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          tests = data;
        }
      } catch (err) {
        logger.warn('Supabase list tests fallback:', err.message);
      }
    }

    return tests;
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
    const questionIds = Array.isArray(data.question_ids) ? data.question_ids : [];

    // Calculate total marks from assigned questions or fallback to total_marks
    let totalMarks = Number(data.total_marks || 0);
    if (totalMarks <= 0) {
      for (const qId of questionIds) {
        const q = memoryStore.questions.find((x) => x.id === qId);
        if (q) totalMarks += Number(q.marks || 0);
      }
    }
    if (totalMarks <= 0) totalMarks = 100;

    const durationMinutes = Number(data.duration_minutes || 60);
    const startTime = data.start_time || new Date().toISOString();
    const endTime = data.end_time || new Date(Date.now() + 7 * 86400000).toISOString();

    const newTest = {
      id,
      title: data.title || 'Untitled Assessment',
      description: data.description || '',
      instructions: data.instructions || 'Read all instructions carefully before starting.',
      duration_minutes: durationMinutes,
      start_time: startTime,
      end_time: endTime,
      total_marks: totalMarks,
      passing_marks: Number(data.passing_marks || Math.round(totalMarks * 0.4)),
      faculty_id: facultyId,
      faculty_name: data.faculty_name || facultyName,
      status: data.status || 'ACTIVE',
      question_ids: questionIds,
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

    const updated = {
      ...memoryStore.tests[index],
      ...data,
      id,
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
    const index = memoryStore.tests.findIndex((t) => t.id === id);
    if (index === -1) return false;

    // Mark as deleted so rankings and history can cleanly ignore it
    memoryStore.tests[index].is_deleted = true;
    memoryStore.tests[index].status = 'DELETED';
    memoryStore.tests[index].updated_at = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('tests').update({ is_deleted: true, status: 'DELETED' }).eq('id', id);
      } catch (err) {
        logger.warn('Supabase delete test fallback:', err.message);
      }
    }

    return true;
  }
}
