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
          const unpackedData = data.map((row) => {
            const base = row.data && typeof row.data === 'object' ? { ...row.data, ...row } : { ...row };
            if (base.faculty_id && !base.facultyId) base.facultyId = base.faculty_id;
            if (base.facultyId && !base.faculty_id) base.faculty_id = base.facultyId;
            if (base.class_id && !base.classId) base.classId = base.class_id;
            if (base.classId && !base.class_id) base.class_id = base.classId;
            if (base.duration_minutes && !base.durationMinutes) base.durationMinutes = base.duration_minutes;
            if (base.durationMinutes && !base.duration_minutes) base.duration_minutes = base.durationMinutes;
            return base;
          });
          return {
            data: unpackedData,
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
    const paginated = tests.slice(startIndex, startIndex + limit).map((row) => {
      const base = row.data && typeof row.data === 'object' ? { ...row.data, ...row } : { ...row };
      if (base.faculty_id && !base.facultyId) base.facultyId = base.faculty_id;
      if (base.facultyId && !base.faculty_id) base.faculty_id = base.facultyId;
      if (base.class_id && !base.classId) base.classId = base.class_id;
      if (base.classId && !base.class_id) base.class_id = base.classId;
      if (base.duration_minutes && !base.durationMinutes) base.durationMinutes = base.duration_minutes;
      if (base.durationMinutes && !base.duration_minutes) base.duration_minutes = base.durationMinutes;
      return base;
    });

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
    let test = memoryStore.tests.find((t) => t.id === id && !t.is_deleted);
    if (!test && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.from('assessments').select('*').eq('id', id).maybeSingle();
        if (data) {
          test = data.data && typeof data.data === 'object' ? { ...data.data, ...data } : data;
          if (test.faculty_id && !test.facultyId) test.facultyId = test.faculty_id;
          if (test.facultyId && !test.faculty_id) test.faculty_id = test.facultyId;
          if (test.class_id && !test.classId) test.classId = test.class_id;
          if (test.classId && !test.class_id) test.class_id = test.classId;
          if (test.duration_minutes && !test.durationMinutes) test.durationMinutes = test.duration_minutes;
          if (test.durationMinutes && !test.duration_minutes) test.duration_minutes = test.durationMinutes;
          memoryStore.tests.push(test);
        }
      } catch {}
    }
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
      const dbRow = {
        id: newTest.id,
        title: newTest.title,
        description: newTest.description || '',
        instructions: newTest.instructions || '',
        duration_minutes: Number(newTest.duration_minutes || newTest.durationMinutes || 60),
        start_time: newTest.start_time || newTest.startTime || new Date().toISOString(),
        end_time: newTest.end_time || newTest.endTime || null,
        maximum_marks: Number(newTest.total_marks || newTest.totalMarks || 100),
        status: newTest.status || 'ACTIVE',
        faculty_id: newTest.faculty_id || 'usr-faculty-01',
        allowed_languages: newTest.allowed_languages || ['javascript', 'python', 'cpp', 'java'],
        data: newTest,
        updated_at: new Date().toISOString(),
      };
      try {
        await supabase.from('assessments').upsert(dbRow);
      } catch (err) {
        logger.warn('Supabase create assessment fallback:', err.message);
      }
      try {
        await supabase.from('tests').upsert(newTest);
      } catch {}
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
      const dbRow = {
        id,
        title: updated.title,
        description: updated.description || '',
        instructions: updated.instructions || '',
        duration_minutes: Number(updated.duration_minutes || updated.durationMinutes || 60),
        start_time: updated.start_time || updated.startTime || null,
        end_time: updated.end_time || updated.endTime || null,
        maximum_marks: Number(updated.total_marks || updated.totalMarks || 100),
        status: updated.status || 'ACTIVE',
        faculty_id: updated.faculty_id || 'usr-faculty-01',
        allowed_languages: updated.allowed_languages || ['javascript', 'python', 'cpp', 'java'],
        data: updated,
        updated_at: new Date().toISOString(),
      };
      try {
        await supabase.from('assessments').update(dbRow).eq('id', id);
      } catch (err) {
        logger.warn('Supabase update assessment fallback:', err.message);
      }
      try {
        await supabase.from('tests').update(updated).eq('id', id);
      } catch {}
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
