import bcrypt from 'bcryptjs';
import { memoryStore, supabase, isSupabaseConfigured, savePersistentStore } from './supabaseService.js';
import { logger } from '../utils/logger.js';

// Concurrency lock to prevent race conditions during simultaneous user creation
const inFlightRegistrations = new Set();

export class UserService {
  static normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';
    return email.trim().toLowerCase();
  }

  static normalizeRegisterNumber(val) {
    if (val === undefined || val === null) return '';
    return String(val).trim();
  }

  /**
   * Find user by registration number.
   */
  static async findUserByRegisterNumber(regNumber) {
    const normalized = this.normalizeRegisterNumber(regNumber);
    if (!normalized) return null;

    let user = memoryStore.users.find((u) => {
      const raw = u.register_number ?? u.registerNumber ?? u.registerNo ?? u.rollNumber;
      return this.normalizeRegisterNumber(raw).toUpperCase() === normalized.toUpperCase();
    });

    if (!user && isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase
          .from('users')
          .select('*')
          .or(`register_number.ilike.${normalized},registerNumber.ilike.${normalized}`)
          .limit(1)
          .maybeSingle();

        if (data) {
          user = data.data || data;
          memoryStore.users.push(user);
        }
      } catch (err) {
        try {
          const { data: pData } = await supabase
            .from('profiles')
            .select('*')
            .or(`register_number.ilike.${normalized},registerNumber.ilike.${normalized}`)
            .limit(1)
            .maybeSingle();
          if (pData) {
            user = pData.data || pData;
            memoryStore.users.push(user);
          }
        } catch {}
      }
    }

    return user || null;
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
    registerNumber,
    registerNo,
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

      const rawReg = register_number !== undefined
        ? register_number
        : (registerNumber !== undefined
            ? registerNumber
            : (registerNo !== undefined
                ? registerNo
                : (extraFields?.registerNumber !== undefined ? extraFields.registerNumber : extraFields?.registerNo)));
      const regStr = rawReg !== undefined && rawReg !== null ? String(rawReg).trim() : '';

      if (regStr) {
        const existingReg = await this.findUserByRegisterNumber(regStr);
        if (existingReg) {
          const error = new Error(`Register number ${regStr} is already assigned to ${existingReg.name || existingReg.email}.`);
          error.statusCode = 409;
          error.errorCode = 'REGISTER_NUMBER_ALREADY_EXISTS';
          throw error;
        }
      }

      const defaultPass = role === 'FACULTY' ? 'Faculty@123' : role === 'ADMIN' ? 'Admin@123' : 'Student@123';
      const hashedPassword = await bcrypt.hash(password || defaultPass, 10);
      const userId = `usr-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newUser = {
        ...extraFields,
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        email_normalized: normalizedEmail,
        password: hashedPassword,
        role: role.toUpperCase(),
        register_number: regStr,
        registerNumber: regStr,
        registerNo: regStr,
        department: department || 'Computer Science & Engineering',
        institution_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      memoryStore.users.push(newUser);

      if (isSupabaseConfigured && supabase) {
        try {
          const { error: sbError } = await supabase.from('users').upsert(newUser, { onConflict: 'email' });
          if (sbError) {
            if (sbError.code === 'PGRST205') {
              try {
                await supabase.from('profiles').upsert(newUser, { onConflict: 'email' });
              } catch {}
            } else if (sbError.code === '23505' || sbError.message?.includes('duplicate key') || sbError.message?.includes('unique constraint')) {
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

      savePersistentStore();

      const { password: _, ...safeUser } = newUser;
      return safeUser;
    } finally {
      inFlightRegistrations.delete(normalizedEmail);
    }
  }

  /**
   * Bulk import students with in-file and database duplicate detection,
   * safe batching, and permanent database persistence.
   */
  static async bulkImportStudents(studentsList = []) {
    if (!Array.isArray(studentsList) || studentsList.length === 0) {
      return {
        success: true,
        imported: [],
        importedCount: 0,
        skippedCount: 0,
        duplicatesInFile: 0,
        duplicatesInFileList: [],
        duplicatesInDatabase: 0,
        alreadyRegistered: [],
        failuresCount: 0,
        failures: [],
        totalProcessed: 0,
      };
    }

    const seenEmailsInFile = new Set();
    const seenRegsInFile = new Set();
    const duplicatesInFile = [];
    const failures = [];
    const validCandidates = [];
    const alreadyRegistered = [];
    const imported = [];

    // 1. Identify in-file duplicates and validate required fields
    for (const item of studentsList) {
      if (!item || typeof item !== 'object') {
        failures.push({ item, reason: 'Invalid record format' });
        continue;
      }

      const email = this.normalizeEmail(item.email);
      const name = (item.name || '').trim();
      const rawReg = item.register_number ?? item.registerNumber ?? item.registerNo ?? item.rollNumber;
      const reg = this.normalizeRegisterNumber(rawReg);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failures.push({ name: name || 'Unknown', email: item.email || '', reason: 'Invalid or missing email address' });
        continue;
      }

      if (!name) {
        failures.push({ name: '', email, reason: 'Name is required' });
        continue;
      }

      const isEmailDupInFile = seenEmailsInFile.has(email);
      const isRegDupInFile = reg ? seenRegsInFile.has(reg.toUpperCase()) : false;

      if (isEmailDupInFile || isRegDupInFile) {
        duplicatesInFile.push({
          email,
          name,
          registerNumber: reg,
          reason: isEmailDupInFile ? 'Duplicate email within file' : 'Duplicate register number within file',
        });
      } else {
        seenEmailsInFile.add(email);
        if (reg) seenRegsInFile.add(reg.toUpperCase());
        validCandidates.push({
          ...item,
          name,
          email,
          email_normalized: email,
          registerNumber: reg,
          register_number: reg,
          registerNo: reg,
        });
      }
    }

    // 2. Identify database duplicates efficiently in batch
    const candidateEmails = validCandidates.map((c) => c.email);
    const candidateRegs = validCandidates.map((c) => c.registerNumber).filter(Boolean);

    // Build fast in-memory lookup maps from memoryStore
    const existingEmailMap = new Map();
    const existingRegMap = new Map();

    for (const u of memoryStore.users) {
      const normEmail = this.normalizeEmail(u.email);
      if (normEmail) existingEmailMap.set(normEmail, u);
      const rawReg = u.register_number || u.registerNumber || u.registerNo;
      const normReg = this.normalizeRegisterNumber(rawReg);
      if (normReg) existingRegMap.set(normReg.toUpperCase(), u);
    }

    // Single batch query to Supabase for any uncached emails
    if (isSupabaseConfigured && supabase) {
      const uncachedEmails = candidateEmails.filter((e) => !existingEmailMap.has(e));
      if (uncachedEmails.length > 0) {
        try {
          let { data, error } = await supabase.from('users').select('*').in('email', uncachedEmails);
          if (error && error.code === 'PGRST205') {
            const pRes = await supabase.from('profiles').select('*').in('email', uncachedEmails);
            data = pRes.data;
            error = pRes.error;
          }
          if (Array.isArray(data)) {
            for (const u of data) {
              const unpacked = u.data && typeof u.data === 'object' ? { ...u.data, ...u } : u;
              const normEmail = this.normalizeEmail(unpacked.email);
              if (normEmail) {
                existingEmailMap.set(normEmail, unpacked);
                if (!memoryStore.users.some((x) => x.id === unpacked.id)) memoryStore.users.push(unpacked);
              }
            }
          }
        } catch (e) {
          logger.warn('[UserService] Supabase batch email check warning:', e.message);
        }
      }

      // Single batch query to Supabase for any uncached register numbers
      const uncachedRegs = candidateRegs.filter((r) => !existingRegMap.has(r.toUpperCase()));
      if (uncachedRegs.length > 0) {
        try {
          let { data, error } = await supabase.from('users').select('*').in('register_number', uncachedRegs);
          if (error && error.code === 'PGRST205') {
            const pRes = await supabase.from('profiles').select('*').in('register_number', uncachedRegs);
            data = pRes.data;
            error = pRes.error;
          }
          if (Array.isArray(data)) {
            for (const u of data) {
              const unpacked = u.data && typeof u.data === 'object' ? { ...u.data, ...u } : u;
              const rawReg = unpacked.register_number || unpacked.registerNumber || unpacked.registerNo;
              const normReg = this.normalizeRegisterNumber(rawReg);
              if (normReg) {
                existingRegMap.set(normReg.toUpperCase(), unpacked);
                if (!memoryStore.users.some((x) => x.id === unpacked.id)) memoryStore.users.push(unpacked);
              }
            }
          }
        } catch (e) {
          logger.warn('[UserService] Supabase batch register_number check warning:', e.message);
        }
      }
    }

    const candidatesToInsert = [];
    for (const candidate of validCandidates) {
      const existingEmail = existingEmailMap.get(candidate.email);
      if (existingEmail) {
        alreadyRegistered.push({
          email: candidate.email,
          name: candidate.name,
          registerNumber: candidate.registerNumber,
          existingId: existingEmail.id,
          reason: 'Email already registered in database',
        });
        continue;
      }

      if (candidate.registerNumber) {
        const existingReg = existingRegMap.get(candidate.registerNumber.toUpperCase());
        if (existingReg) {
          alreadyRegistered.push({
            email: candidate.email,
            name: candidate.name,
            registerNumber: candidate.registerNumber,
            existingId: existingReg.id,
            reason: `Register number ${candidate.registerNumber} already registered in database`,
          });
          continue;
        }
      }

      candidatesToInsert.push(candidate);
    }

    // 3. Batch process valid candidates in safe chunks of 50
    const BATCH_SIZE = 50;
    const defaultPassword = 'Student@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    for (let i = 0; i < candidatesToInsert.length; i += BATCH_SIZE) {
      const batch = candidatesToInsert.slice(i, i + BATCH_SIZE);
      const preparedBatch = [];

      for (const item of batch) {
        const userId = `usr-student-${Date.now()}-${Math.floor(Math.random() * 100000)}-${preparedBatch.length}`;
        const itemPassword = (item.password && item.password !== defaultPassword)
          ? await bcrypt.hash(item.password, 10)
          : hashedPassword;

        const studentRecord = {
          ...item,
          id: userId,
          name: item.name.trim(),
          email: item.email,
          email_normalized: item.email,
          password: itemPassword,
          role: 'STUDENT',
          register_number: item.registerNumber || '',
          registerNumber: item.registerNumber || '',
          registerNo: item.registerNumber || '',
          department: item.department || 'Computer Science & Engineering',
          institution_id: item.institution_id || item.institutionId || 'inst-01',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        preparedBatch.push(studentRecord);
        memoryStore.users.push(studentRecord);

        const { password: _, ...safeStudent } = studentRecord;
        imported.push(safeStudent);
      }

      // Persist batch to Supabase PostgreSQL safely
      if (isSupabaseConfigured && supabase && preparedBatch.length > 0) {
        try {
          const { error: upsertErr } = await supabase
            .from('users')
            .upsert(preparedBatch, { onConflict: 'email' });

          if (upsertErr) {
            if (upsertErr.code === 'PGRST205') {
              try {
                await supabase
                  .from('profiles')
                  .upsert(preparedBatch, { onConflict: 'email' });
              } catch {}
            } else {
              logger.warn('[UserService] Supabase bulk upsert warning:', upsertErr.message);
            }
          }
        } catch (sbErr) {
          logger.warn('[UserService] Supabase bulk upsert error:', sbErr.message);
        }
      }
    }

    // Persist memoryStore state to disk
    if (imported.length > 0) {
      savePersistentStore(true);
    }

    return {
      success: true,
      imported,
      importedCount: imported.length,
      skippedCount: duplicatesInFile.length + alreadyRegistered.length + failures.length,
      duplicatesInFile: duplicatesInFile.length,
      duplicatesInFileList: duplicatesInFile,
      duplicatesInDatabase: alreadyRegistered.length,
      alreadyRegistered,
      failuresCount: failures.length,
      failures,
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
      const rUpper = String(role).toUpperCase();
      if (rUpper === 'STUDENT' || rUpper === 'CANDIDATE') {
        users = users.filter((u) => ['STUDENT', 'CANDIDATE'].includes(String(u.role).toUpperCase()));
      } else {
        users = users.filter((u) => String(u.role).toUpperCase() === rUpper);
      }
    }
    if (department) {
      users = users.filter((u) => u.department === department);
    }

    // Helper to normalize user fields
    const normalizeUser = (u) => {
      const unpacked = u.data && typeof u.data === 'object' ? { ...u.data, ...u } : u;
      const { password: _, ...safe } = unpacked;
      const rawReg = safe.register_number ?? safe.registerNumber ?? safe.registerNo ?? safe.rollNumber;
      const reg = rawReg !== undefined && rawReg !== null ? String(rawReg).trim() : '';
      const cIds = Array.isArray(safe.classIds)
        ? safe.classIds
        : Array.isArray(safe.class_ids)
        ? safe.class_ids
        : [];
      return {
        ...safe,
        register_number: reg,
        registerNumber: reg,
        registerNo: reg,
        class_ids: cIds,
        classIds: cIds,
      };
    };

    // If Supabase is available and has users table, query it with pagination
    if (isSupabaseConfigured && supabase) {
      try {
        let query = supabase.from('users').select('*', { count: 'exact' });
        if (role) {
          const rUpper = String(role).toUpperCase();
          if (rUpper === 'STUDENT' || rUpper === 'CANDIDATE') {
            query = query.in('role', ['STUDENT', 'CANDIDATE', 'student', 'candidate']);
          } else {
            query = query.eq('role', rUpper);
          }
        }
        if (department) query = query.eq('department', department);

        const from = (p - 1) * l;
        const to = from + l - 1;
        let { data, count, error } = await query.range(from, to);

        if (error && error.code === 'PGRST205') {
          let profQuery = supabase.from('profiles').select('*', { count: 'exact' });
          if (role) {
            const rUpper = String(role).toUpperCase();
            if (rUpper === 'STUDENT' || rUpper === 'CANDIDATE') {
              profQuery = profQuery.in('role', ['STUDENT', 'CANDIDATE', 'student', 'candidate']);
            } else {
              profQuery = profQuery.eq('role', rUpper);
            }
          }
          if (department) profQuery = profQuery.eq('department', department);
          const profRes = await profQuery.range(from, to);
          if (!profRes.error && Array.isArray(profRes.data)) {
            data = profRes.data;
            count = profRes.count;
            error = null;
          }
        }

        if (!error && Array.isArray(data) && data.length > 0) {
          const safeData = data.map(normalizeUser);
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
    const paginated = users.slice(startIndex, startIndex + l).map(normalizeUser);

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
