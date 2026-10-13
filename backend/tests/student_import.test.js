import test from 'node:test';
import assert from 'node:assert/strict';
import { UserService } from '../services/userService.js';
import { memoryStore } from '../services/supabaseService.js';

test('Student Import and Data Persistence', async (t) => {
  const runId = Date.now().toString(36);

  await t.test('Successfully imports valid students and normalizes fields', async () => {
    const testBatch = [
      {
        name: 'Alice Johnson',
        email: `alice.${runId}@university.edu`,
        registerNumber: `REG-IMP-${runId}-1`,
        department: 'Computer Science',
      },
      {
        name: 'Bob Smith',
        email: `BOB.${runId}@UNIVERSITY.EDU`,
        register_number: `REG-IMP-${runId}-2`,
        department: 'Information Technology',
      },
    ];

    const result = await UserService.bulkImportStudents(testBatch);
    assert.equal(result.success, true);
    assert.equal(result.importedCount, 2);
    assert.equal(result.skippedCount, 0);

    const alice = await UserService.findUserByNormalizedEmail(`alice.${runId}@university.edu`);
    assert.ok(alice);
    assert.equal(alice.name, 'Alice Johnson');
    assert.equal(alice.role, 'STUDENT');
    assert.equal(alice.register_number, `REG-IMP-${runId}-1`);

    const bob = await UserService.findUserByNormalizedEmail(`bob.${runId}@university.edu`);
    assert.ok(bob);
    assert.equal(bob.name, 'Bob Smith');
    assert.equal(bob.registerNumber, `REG-IMP-${runId}-2`);
  });

  await t.test('Detects in-file duplicates for email and registration number', async () => {
    const duplicateBatch = [
      {
        name: 'Charlie Brown',
        email: `charlie.${runId}@university.edu`,
        registerNumber: `REG-IMP-${runId}-3`,
      },
      {
        name: 'Charlie Dup',
        email: `charlie.${runId}@university.edu`, // duplicate email
        registerNumber: `REG-IMP-${runId}-4`,
      },
      {
        name: 'Diana Prince',
        email: `diana.${runId}@university.edu`,
        registerNumber: `REG-IMP-${runId}-5`,
      },
      {
        name: 'Diana Dup Reg',
        email: `diana.dup.${runId}@university.edu`,
        registerNumber: `REG-IMP-${runId}-5`, // duplicate reg number
      },
    ];

    const result = await UserService.bulkImportStudents(duplicateBatch);
    assert.equal(result.success, true);
    assert.equal(result.importedCount, 2);
    assert.equal(result.duplicatesInFile, 2);
  });

  await t.test('Detects existing database duplicates and skips them', async () => {
    const existingBatch = [
      {
        name: 'Alice Johnson Again',
        email: `alice.${runId}@university.edu`, // already in DB from first subtest
        registerNumber: `REG-IMP-${runId}-999`,
      },
      {
        name: 'New Person Existing Reg',
        email: `new.person.${runId}@university.edu`,
        registerNumber: `REG-IMP-${runId}-1`, // reg number already belongs to Alice
      },
    ];

    const result = await UserService.bulkImportStudents(existingBatch);
    assert.equal(result.success, true);
    assert.equal(result.importedCount, 0);
    assert.equal(result.duplicatesInDatabase, 2);
  });

  await t.test('Identifies invalid records without crashing', async () => {
    const invalidBatch = [
      { name: 'No Email', email: '', registerNumber: 'REG-000' },
      { name: '', email: 'valid.email@test.com', registerNumber: 'REG-001' },
      { name: 'Invalid Email', email: 'notanemail', registerNumber: 'REG-002' },
    ];

    const result = await UserService.bulkImportStudents(invalidBatch);
    assert.equal(result.success, true);
    assert.equal(result.importedCount, 0);
    assert.equal(result.failuresCount, 3);
  });

  await t.test('listUsers returns students with role STUDENT and CANDIDATE', async () => {
    memoryStore.users.push({
      id: `usr-cand-${runId}`,
      name: 'Candidate User',
      email: `cand.${runId}@university.edu`,
      email_normalized: `cand.${runId}@university.edu`,
      role: 'CANDIDATE',
      registerNumber: `REG-CAND-${runId}`,
    });

    const studentsResult = await UserService.listUsers({ role: 'STUDENT', limit: 100 });
    assert.ok(studentsResult.data.length >= 3);
    const hasCandidate = studentsResult.data.some((u) => u.email === `cand.${runId}@university.edu`);
    assert.ok(hasCandidate, 'Should include CANDIDATE users in STUDENT queries');
  });
});
