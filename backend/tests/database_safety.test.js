import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'production';
process.env.SUPABASE_EXPECTED_PROJECT_REF = 'abcdefghijklmnopqrst';
const safety = await import('../services/databaseSafety.js?production-safety-test');

test('production database identity must match the explicit project reference', () => {
  assert.equal(safety.isProduction, true);
  assert.doesNotThrow(() => safety.assertProductionDatabaseIdentity('https://abcdefghijklmnopqrst.supabase.co'));
  assert.throws(
    () => safety.assertProductionDatabaseIdentity('https://differentprojectref.supabase.co'),
    /does not match/
  );
  assert.throws(() => safety.assertProductionDatabaseIdentity('not-a-url'), /invalid/);
});

test('production always blocks seed and destructive operations', () => {
  process.env.DB_ALLOW_DESTRUCTIVE_NONPROD = 'true';
  assert.throws(() => safety.assertDestructiveOperationAllowed('test seed'), /always blocked/);
});
