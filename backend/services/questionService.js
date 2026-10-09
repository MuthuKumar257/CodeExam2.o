import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { logger } from '../utils/logger.js';

export class QuestionService {
  static async listQuestions(role = 'STUDENT', { page = 1, limit = 50, difficulty } = {}) {
    const p = Math.max(1, Number(page));
    const l = Math.max(1, Number(limit));

    let questions = memoryStore.questions;
    if (difficulty) {
      questions = questions.filter((q) => q.difficulty?.toUpperCase() === difficulty.toUpperCase());
    }

    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('questions').select('*', { count: 'exact' }).order('created_at', { ascending: false });
        if (difficulty) query = query.eq('difficulty', difficulty.toUpperCase());
        const from = (p - 1) * l;
        const to = from + l - 1;
        const { data, count, error } = await query.range(from, to);
        if (!error && Array.isArray(data) && data.length > 0) {
          const total = count ?? data.length;
          const mapped = data.map((q) => {
            const allTestcases = memoryStore.testcases.filter((tc) => tc.question_id === q.id);
            return {
              ...q,
              total_testcases: allTestcases.length,
              public_testcases: allTestcases.filter((tc) => !tc.is_hidden),
            };
          });
          return {
            data: mapped,
            pagination: {
              page: p,
              limit: l,
              total,
              hasMore: p * l < total,
            },
          };
        }
      } catch (err) {
        logger.warn('Supabase list questions fallback:', err.message);
      }
    }

    const total = questions.length;
    const startIndex = (p - 1) * l;
    const paginated = questions.slice(startIndex, startIndex + l).map((q) => {
      const allTestcases = memoryStore.testcases.filter((tc) => tc.question_id === q.id);
      return {
        ...q,
        total_testcases: allTestcases.length,
        public_testcases: allTestcases.filter((tc) => !tc.is_hidden),
      };
    });

    return {
      data: paginated,
      pagination: {
        page: p,
        limit: l,
        total,
        hasMore: p * l < total,
      },
    };
  }

  static async getQuestionById(id, role = 'STUDENT') {
    let question = memoryStore.questions.find((q) => q.id === id);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('questions').select('*').eq('id', id).single();
        if (!error && data) {
          question = data;
        }
      } catch (err) {
        logger.warn('Supabase get question fallback:', err.message);
      }
    }

    if (!question) return null;

    const testcases = memoryStore.testcases.filter((tc) => tc.question_id === id);
    const visibleTestcases = role === 'STUDENT' ? testcases.filter((tc) => !tc.is_hidden) : testcases;

    return {
      ...question,
      testcases: visibleTestcases,
    };
  }

  static async createQuestion(data) {
    const id = data.id || `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newQuestion = {
      id,
      title: data.title || 'Untitled Question',
      description: data.description || '',
      input_format: data.input_format || '',
      output_format: data.output_format || '',
      constraints: data.constraints || '',
      difficulty: data.difficulty || 'MEDIUM',
      marks: Number(data.marks || 20),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    memoryStore.questions.unshift(newQuestion);

    // Save initial testcases if provided
    if (Array.isArray(data.testcases)) {
      for (const tc of data.testcases) {
        await this.addTestcase(id, tc);
      }
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('questions').upsert(newQuestion);
      } catch (err) {
        logger.warn('Supabase create question fallback:', err.message);
      }
    }

    return newQuestion;
  }

  static async updateQuestion(id, data) {
    const index = memoryStore.questions.findIndex((q) => q.id === id);
    if (index === -1) return null;

    const updated = {
      ...memoryStore.questions[index],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    memoryStore.questions[index] = updated;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('questions').update(updated).eq('id', id);
      } catch (err) {
        logger.warn('Supabase update question fallback:', err.message);
      }
    }

    return updated;
  }

  static async deleteQuestion(id) {
    if (!memoryStore.deletedQuestionIds) memoryStore.deletedQuestionIds = new Set();
    if (memoryStore.deletedQuestionIds.has(id)) return true;
    memoryStore.deletedQuestionIds.add(id);

    const index = memoryStore.questions.findIndex((q) => q.id === id);
    if (index !== -1) {
      memoryStore.questions.splice(index, 1);
    }
    memoryStore.testcases = memoryStore.testcases.filter((tc) => tc.question_id !== id);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('questions').delete().eq('id', id);
        await supabase.from('testcases').delete().eq('question_id', id);
      } catch (err) {
        logger.warn('Supabase delete question fallback:', err.message);
      }
    }

    return true;
  }

  static async getTestcases(questionId, role = 'STUDENT') {
    const cases = memoryStore.testcases.filter((tc) => tc.question_id === questionId);
    if (role === 'STUDENT') {
      return cases.filter((tc) => !tc.is_hidden);
    }
    return cases;
  }

  static async getAllTestcasesForEvaluation(questionId) {
    return memoryStore.testcases.filter((tc) => tc.question_id === questionId);
  }

  static async addTestcase(questionId, data) {
    const id = data.id || `tc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newTestcase = {
      id,
      question_id: questionId,
      input: String(data.input || ''),
      expected_output: String(data.expected_output || ''),
      is_hidden: Boolean(data.is_hidden),
      created_at: new Date().toISOString(),
    };

    memoryStore.testcases.push(newTestcase);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('testcases').upsert(newTestcase);
      } catch (err) {
        logger.warn('Supabase add testcase fallback:', err.message);
      }
    }

    return newTestcase;
  }

  static async updateTestcase(id, data) {
    const index = memoryStore.testcases.findIndex((tc) => tc.id === id);
    if (index === -1) return null;

    const updated = {
      ...memoryStore.testcases[index],
      ...data,
      id,
    };
    memoryStore.testcases[index] = updated;

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('testcases').update(updated).eq('id', id);
      } catch (err) {
        logger.warn('Supabase update testcase fallback:', err.message);
      }
    }

    return updated;
  }

  static async deleteTestcase(id) {
    const index = memoryStore.testcases.findIndex((tc) => tc.id === id);
    if (index === -1) return false;

    memoryStore.testcases.splice(index, 1);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('testcases').delete().eq('id', id);
      } catch (err) {
        logger.warn('Supabase delete testcase fallback:', err.message);
      }
    }

    return true;
  }
}
