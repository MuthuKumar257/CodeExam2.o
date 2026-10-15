import 'dotenv/config';
import { logger } from '../utils/logger.js';

export const isProduction = process.env.NODE_ENV === 'production';

export function assertProductionDatabaseIdentity(url) {
  if (!isProduction) return;

  const expectedRef = process.env.SUPABASE_EXPECTED_PROJECT_REF;
  if (!expectedRef || !/^[a-z0-9]{20}$/.test(expectedRef)) {
    throw new Error('[DB] Production requires SUPABASE_EXPECTED_PROJECT_REF (20-character project reference).');
  }

  let actualRef = '';
  try {
    actualRef = new URL(url).hostname.split('.')[0];
  } catch {
    throw new Error('[DB] Production Supabase URL is invalid.');
  }
  if (actualRef !== expectedRef) {
    throw new Error('[DB] Production Supabase project reference does not match the configured expected project.');
  }
}

export function assertDestructiveOperationAllowed(operation) {
  if (isProduction || process.env.DB_ALLOW_DESTRUCTIVE_NONPROD !== 'true') {
    throw new Error(`[DB] Destructive/seed operation "${operation}" is blocked. Production is always blocked; non-production requires DB_ALLOW_DESTRUCTIVE_NONPROD=true.`);
  }
}

export function logDatabaseStartup({ configured, url }) {
  const envName = process.env.NODE_ENV || 'development';
  let projectRef = 'unknown';
  if (url) {
    const match = url.match(/https?:\/\/([^.]+)\.supabase/);
    if (match && match[1]) {
      projectRef = match[1];
    }
  }

  if (configured) {
    logger.info(`[DB] Supabase database connected (Environment: ${envName}, Project Reference: ${projectRef})`);
  } else {
    logger.warn(`[DB] Supabase is not configured (Environment: ${envName}); persistence is unavailable.`);
  }
}
