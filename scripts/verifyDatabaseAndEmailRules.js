import http from 'http';
import { UserService } from '../backend/services/userService.js';
import { memoryStore } from '../backend/services/supabaseService.js';

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, text: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('🧪 Starting Verification: Database Fetching & Email Rules');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // TEST 1: Modular Endpoints and Pagination
  console.log('📋 Test Suite 1: Modular Endpoints & Pagination Metadata');
  const modularEndpoints = [
    { name: 'Students', path: '/api/students?page=1&limit=2' },
    { name: 'Faculty', path: '/api/faculty?page=1&limit=2' },
    { name: 'Admins', path: '/api/admins?page=1&limit=2' },
    { name: 'Classes', path: '/api/classes?page=1&limit=2' },
    { name: 'Departments', path: '/api/departments?page=1&limit=2' },
    { name: 'Institutions', path: '/api/institutions?page=1&limit=2' },
    { name: 'Tests', path: '/api/tests?page=1&limit=2' },
    { name: 'Questions', path: '/api/questions?page=1&limit=2' },
    { name: 'Attempts', path: '/api/attempts?page=1&limit=2' },
    { name: 'Submissions', path: '/api/submissions?page=1&limit=2' },
    { name: 'Rankings', path: '/api/rankings?page=1&limit=2' },
    { name: 'Reports', path: '/api/reports?page=1&limit=2' },
  ];

  for (const ep of modularEndpoints) {
    try {
      const res = await makeRequest(ep.path);
      const ok = res.status === 200 && res.data?.success === true;
      const hasPagination = res.data?.pagination &&
        typeof res.data.pagination.page === 'number' &&
        typeof res.data.pagination.limit === 'number' &&
        typeof res.data.pagination.total === 'number' &&
        typeof res.data.pagination.hasMore === 'boolean';
      assert(ok && hasPagination, `Modular endpoint [${ep.name}] ${ep.path} returned structured pagination metadata.`);
    } catch (err) {
      assert(false, `Modular endpoint [${ep.name}] failed: ${err.message}`);
    }
  }

  // TEST 2: Error Format Verification
  console.log('\n🛡️ Test Suite 2: Error Format Compliance');
  try {
    const errorRes = await makeRequest('/api/students/non-existent-student-id-99999');
    assert(
      errorRes.status === 404 &&
      errorRes.data?.success === false &&
      errorRes.data?.error?.code === 'NOT_FOUND',
      'API errors return structured { success: false, error: { code, message } } without masking.'
    );
  } catch (err) {
    assert(false, `Error format check failed: ${err.message}`);
  }

  // TEST 3: Enforce "One Email = One Person" Across All Roles
  console.log('\n🔒 Test Suite 3: Enforce "One Email = One Person" Constraint');
  const uniqueTestEmail = `verify.candidate.${Date.now()}@codeexam.edu`;
  const spacedUpperEmail = `  ${uniqueTestEmail.toUpperCase()}  `;
  const adminHeaders = { 'x-user-id': 'usr-admin-01', 'x-user-role': 'ADMIN' };

  // Step 3a: Create student
  try {
    const createRes = await makeRequest('/api/students', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'Verification Candidate',
        email: uniqueTestEmail,
        password: 'Password@123',
        department: 'Computer Science',
      },
    });
    assert(
      createRes.status === 201 && createRes.data?.success === true,
      `Successfully registered student with email ${uniqueTestEmail}.`
    );
  } catch (err) {
    assert(false, `Student registration failed: ${err.message}`);
  }

  // Step 3b: Attempt to create faculty with same email (case/whitespace variation)
  try {
    const dupFacultyRes = await makeRequest('/api/faculty', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'Duplicate Faculty',
        email: spacedUpperEmail,
        password: 'Password@123',
        department: 'Information Technology',
      },
    });
    assert(
      dupFacultyRes.status === 409 &&
      dupFacultyRes.data?.errorCode === 'EMAIL_ALREADY_EXISTS' &&
      dupFacultyRes.data?.error?.code === 'EMAIL_ALREADY_EXISTS',
      'Prevented faculty account creation with existing student email (case & whitespace insensitive).'
    );
  } catch (err) {
    assert(false, `Duplicate faculty rejection failed: ${err.message}`);
  }

  // Step 3c: Attempt to create admin with same email
  try {
    const dupAdminRes = await makeRequest('/api/admins', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name: 'Duplicate Admin',
        email: spacedUpperEmail,
        password: 'Password@123',
      },
    });
    assert(
      dupAdminRes.status === 409 &&
      dupAdminRes.data?.errorCode === 'EMAIL_ALREADY_EXISTS',
      'Prevented admin account creation with existing student email.'
    );
  } catch (err) {
    assert(false, `Duplicate admin rejection failed: ${err.message}`);
  }

  // TEST 4: Bulk Import Deduplication
  console.log('\n📦 Test Suite 4: Bulk Student Import In-File & Database Deduplication');
  try {
    const importBatch = [
      { name: 'Student One', email: `import.one.${Date.now()}@codeexam.edu`, department: 'CSE' },
      { name: 'Student One Duplicate in file', email: `import.one.${Date.now()}@codeexam.edu`, department: 'CSE' },
      { name: 'Student Existing in DB', email: uniqueTestEmail, department: 'IT' },
      { name: 'Student Two', email: `import.two.${Date.now()}@codeexam.edu`, department: 'ECE' },
    ];

    const bulkRes = await makeRequest('/api/students/bulk-import', {
      method: 'POST',
      headers: adminHeaders,
      body: { students: importBatch },
    });

    const bulkData = bulkRes.data?.data;
    assert(
      bulkRes.status === 200 &&
      bulkData?.importedCount === 2 &&
      bulkData?.duplicatesInFile === 1 &&
      bulkData?.duplicatesInDatabase === 1,
      `Bulk import successfully filtered 1 in-file duplicate and 1 existing DB duplicate (imported: ${bulkData?.importedCount}, skipped: ${bulkData?.skippedCount}).`
    );
  } catch (err) {
    assert(false, `Bulk import verification failed: ${err.message}`);
  }

  // TEST 5: Duplicate Audit & Merge History Preservation
  console.log('\n🔄 Test Suite 5: Duplicate Audit & Safe Merging Without History Loss');
  try {
    const mergeTestEmail = `merge.test.${Date.now()}@codeexam.edu`;
    const primaryId = `usr-primary-${Date.now()}`;
    const secondaryId = `usr-secondary-${Date.now()}`;

    // Seed two duplicate records in memoryStore
    memoryStore.users.push({
      id: primaryId,
      name: 'Primary Account',
      email: mergeTestEmail,
      email_normalized: mergeTestEmail,
      role: 'STUDENT',
      created_at: new Date(Date.now() - 10000).toISOString(),
    });

    memoryStore.users.push({
      id: secondaryId,
      name: 'Secondary Duplicate Account',
      email: mergeTestEmail.toUpperCase(),
      email_normalized: mergeTestEmail,
      role: 'STUDENT',
      created_at: new Date().toISOString(),
    });

    // Attach an attempt to the secondary account
    const testAttemptId = `attempt-merge-${Date.now()}`;
    memoryStore.sessions.push({
      id: testAttemptId,
      student_id: secondaryId,
      candidateId: secondaryId,
      test_id: 'test-demo-01',
      score: 85,
      status: 'SUBMITTED',
    });

    // Run audit and merge
    const mergeResult = await UserService.auditAndMergeDuplicateEmails();
    const mergedAttempt = memoryStore.sessions.find((s) => s.id === testAttemptId);
    const usersWithEmail = memoryStore.users.filter((u) => u.email_normalized === mergeTestEmail);

    assert(
      mergeResult.mergedDuplicatesCount >= 1 &&
      usersWithEmail.length === 1 &&
      mergedAttempt?.student_id === primaryId,
      `Audit and merge consolidated duplicate users and transferred attempt history to primary ID (${primaryId}) without data loss.`
    );
  } catch (err) {
    assert(false, `Duplicate audit and merge verification failed: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log(`📊 Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Unexpected error running verification:', err);
  process.exit(1);
});
