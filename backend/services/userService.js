import bcrypt from 'bcryptjs';
import { memoryStore, supabase, isSupabaseConfigured } from './supabaseService.js';
import { logger } from '../utils/logger.js';

// Concurrency lock to prevent race conditions during simultaneous user creation
const inFlightRegistrations = new Set();

export class UserService {
  static normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';
    return email.trim().toLowerCase();
  }

  /**
   * Scans for existing duplicate emails in the database, merges associations
   * (sessions, attempts, submissions, history) into a single primary record,
   * and ensures email_normalized is populated on all users.
   */
  static async auditAndMergeDuplicateEmails() {
    logger.info('[UserService] Auditing users for duplicate emails...');
    const emailGroups = new Map();

    // 1. Group in-memory users by normalized email
    for (const user of memoryStore.users) {
      const normalized = this.normalizeEmail(user.email || user.email_normalized);
      if (!normalized) continue;
      user.email_normalized = normalized;
      user.email = normalized;

      if (!emailGroups.has(normalized)) {
        emailGroups.set(normalized, []);
      }
      emailGroups.get(normalized).push(user);
    }

    let mergedDuplicatesCount = 0;

    // 2. Safely merge any duplicates without losing data
    for (const [normalizedEmail, users] of emailGroups.entries()) {
      if (users.length > 1) {
        logger.warn(`[UserService] Found ${users.length} duplicate records for ${normalizedEmail}. Merging...`);

        // Select primary record: priority ADMIN > FACULTY > STUDENT, then oldest created_at
        users.sort((a, b) => {
          const roleScore = (r) => (r === 'ADMIN' ? 3 : r === 'FACULTY' ? 2 : 1);
          const scoreDiff = roleScore(b.role) - roleScore(a.role);
          if (scoreDiff !== 0) return scoreDiff;
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        });

        const primary = users[0];
        const duplicates = users.slice(1);

        for (const duplicate of duplicates) {
          mergedDuplicatesCount++;
          logger.info(`[UserService] Merging duplicate user ${duplicate.id} into primary ${primary.id}`);

          // Re-point sessions & attempts
          memoryStore.sessions.forEach((s) => {
            if (s.student_id === duplicate.id || s.candidateId === duplicate.id) {
              s.student_id = primary.id;
              s.candidateId = primary.id;
              s.student_name = primary.name;
              s.student_email = primary.email;
            }
          });

          // Re-point submissions
          memoryStore.submissions.forEach((sub) => {
            if (sub.student_id === duplicate.id || sub.studentId === duplicate.id) {
              sub.student_id = primary.id;
              sub.studentId = primary.id;
              sub.student_name = primary.name;
            }
          });

          // Remove the duplicate from memoryStore
          const dupIdx = memoryStore.users.findIndex((u) => u.id === duplicate.id);
          if (dupIdx !== -1) {
            memoryStore.users.splice(dupIdx, 1);
          }
        }
      }
    }

    logger.info(`[UserService] Audit complete. ${memoryStore.users.length} unique user records active.`);
    return {
      mergedDuplicatesCount,
      uniqueUsersCount: memoryStore.users.length,
    };
  }

  /**
   * Find exactly one user by normalized email.
   * Checks memoryStore and Supabase.
   */
  static async findUserByNormalizedEmail(email) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;

    let user = memoryStore.users.find(
      (u) => (u.email_normalized || this.normalizeEmail(u.email)) === normalized
    );

    if (!user && isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .or(`email_normalized.eq.${normalized},email.ilike.${normalized}`)
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          user = data.data || data;
          user.email_normalized = normalized;
          user.email = normalized;
          memoryStore.users.push(user);
        }
      } catch (err) {
        logger.warn('[UserService] Supabase user lookup error:', err.message);
      }
    }

    return user || null;
  }

  /**
   * Find user by unique ID.
   */
  static async findUserById(id) {
    if (!id) return null;
    let user = memoryStore.users.find((u) => u.id === id);
    if (!user && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (data) {
          user = data.data || data;
          memoryStore.users.push(user);
        }
      } catch {}
    }
    return user || null;
  }

  /**
   * Create a user with race-condition protection and guaranteed email uniqueness.
   */
  static async createUser({
    name,
    email,
    password,
    role = 'STUDENT',
    register_number,
    department,
    institution_id = 'inst-01',
    extraFields = {},
  }) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      const error = new Error('Valid email address is required.');
      error.statusCode = 400;
      error.errorCode = 'INVALID_EMAIL';
      throw error;
    }
    if (!name || !name.trim()) {
      const error = new Error('Name is required.');
      error.statusCode = 400;
      error.errorCode = 'MISSING_FIELDS';
      throw error;
    }

    // Race-condition guard: check in-flight creations
    if (inFlightRegistrations.has(normalizedEmail)) {
      const error = new Error('A registration with this email is currently being processed.');
      error.statusCode = 409;
      error.errorCode = 'EMAIL_ALREADY_EXISTS';
      throw error;
    }

    inFlightRegistrations.add(normalizedEmail);

    try {
      // Check existing user in database / cache
      const existing = await this.findUserByNormalizedEmail(normalizedEmail);
      if (existing) {
        const error = new Error('This email is already registered to another person.');
        error.statusCode = 409;
        error.errorCode = 'EMAIL_ALREADY_EXISTS';
        throw error;
      }

      const defaultPass = role === 'FACULTY' ? 'Faculty@123' : role === 'ADMIN' ? 'Admin@123' : 'Student@123';
      const hashedPassword = await bcrypt.hash(password || defaultPass, 10);
      const userId = `usr-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newUser = {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        email_normalized: normalizedEmail,
        password: hashedPassword,
        role: role.toUpperCase(),
        register_number: register_number || `REG-${Date.now().toString().slice(-4)}`,
        department: department || 'Computer Science & Engineering',
        institution_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...extraFields,
      };

      memoryStore.users.push(newUser);

      if (isSupabaseConfigured && supabase) {
        try {
          const { error: sbError } = await supabase.from('users').upsert(newUser);
          if (sbError) {
            // Check for database unique constraint violation
            if (sbError.code === '23505' || sbError.message?.includes('duplicate key') || sbError.message?.includes('unique constraint')) {
              // Roll back memoryStore insertion
              const idx = memoryStore.users.findIndex((u) => u.id === userId);
              if (idx !== -1) memoryStore.users.splice(idx, 1);

              const error = new Error('This email is already registered to another person.');
              error.statusCode = 409;
              error.errorCode = 'EMAIL_ALREADY_EXISTS';
              throw error;
            }
          }
        } catch (err) {
          if (err.errorCode === 'EMAIL_ALREADY_EXISTS') throw err;
          logger.warn('[UserService] Supabase user insert fallback:', err.message);
        }
      }

      const { password: _, ...safeUser } = newUser;
      return safeUser;
    } finally {
      inFlightRegistrations.delete(normalizedEmail);
    }
  }

  /**
   * Bulk import students with in-file and database duplicate detection.
   */
  static async bulkImportStudents(studentsList = []) {
    if (!Array.isArray(studentsList) || studentsList.length === 0) {
      return {
        imported: [],
        duplicatesInFile: [],
        alreadyRegistered: [],
        totalProcessed: 0,
      };
    }

    const seenInFile = new Set();
    const duplicatesInFile = [];
    const validCandidates = [];
    const alreadyRegistered = [];
    const imported = [];

    // 1. Identify in-file duplicates
    for (const item of studentsList) {
      const email = this.normalizeEmail(item.email);
      if (!email) continue;

      if (seenInFile.has(email)) {
        duplicatesInFile.push({ email, name: item.name });
      } else {
        seenInFile.add(email);
        validCandidates.push({ ...item, email, email_normalized: email });
      }
    }

    // 2. Process valid candidates
    for (const candidate of validCandidates) {
      const existing = await this.findUserByNormalizedEmail(candidate.email);
      if (existing) {
        alreadyRegistered.push({ email: candidate.email, name: candidate.name, existingId: existing.id });
      } else {
        try {
          const created = await this.createUser({
            name: candidate.name || 'Student',
            email: candidate.email,
            password: candidate.password,
            role: 'STUDENT',
            register_number: candidate.register_number || candidate.registerNumber,
            department: candidate.department,
            institution_id: candidate.institution_id || candidate.institutionId || 'inst-01',
          });
          imported.push(created);
        } catch (err) {
          if (err.errorCode === 'EMAIL_ALREADY_EXISTS') {
            alreadyRegistered.push({ email: candidate.email, name: candidate.name });
          } else {
            logger.error(`[UserService] Error importing student ${candidate.email}:`, err);
          }
        }
      }
    }

    return {
      success: true,
      imported,
      importedCount: imported.length,
      skippedCount: duplicatesInFile.length + alreadyRegistered.length,
      duplicatesInFile: duplicatesInFile.length,
      duplicatesInFileList: duplicatesInFile,
      duplicatesInDatabase: alreadyRegistered.length,
      alreadyRegistered,
      totalProcessed: studentsList.length,
    };
  }

  /**
   * Paginated list of users with proper pagination metadata.
   */
  static async listUsers({ role, department, page = 1, limit = 50 }) {
    const p = Math.max(1, Number(page));
    const l = Math.max(1, Number(limit));

    let users = memoryStore.users;
    if (role) {
      users = users.filter((u) => String(u.role).toUpperCase() === String(role).toUpperCase());
    }
    if (department) {
      users = users.filter((u) => u.department === department);
    }

    // If Supabase is available and has users table, query it with pagination
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('users').select('*', { count: 'exact' });
        if (role) query = query.eq('role', role.toUpperCase());
        if (department) query = query.eq('department', department);

        const from = (p - 1) * l;
        const to = from + l - 1;
        const { data, count, error } = await query.range(from, to);

        if (!error && Array.isArray(data)) {
          const safeData = data.map(({ password: _, ...u }) => u);
          const total = count ?? safeData.length;
          return {
            data: safeData,
            pagination: {
              page: p,
              limit: l,
              total,
              hasMore: p * l < total,
            },
          };
        }
      } catch (err) {
        logger.warn('[UserService] Supabase listUsers error, falling back to memoryStore:', err.message);
      }
    }

    const total = users.length;
    const startIndex = (p - 1) * l;
    const paginated = users.slice(startIndex, startIndex + l).map(({ password: _, ...u }) => u);

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
}

// Automatically audit on import
UserService.auditAndMergeDuplicateEmails().catch((err) => {
  logger.warn('[UserService] Initial duplicate email audit error:', err.message);
});
