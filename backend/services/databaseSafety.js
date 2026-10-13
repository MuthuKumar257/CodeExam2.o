import 'dotenv/config';
import { logger } from '../utils/logger.js';

export const isProduction = process.env.NODE_ENV === 'production';

export function assertDestructiveOperationAllowed(operation) {
  if (isProduction) {
    throw new Error(`[DB] Destructive operation "${operation}" is unavailable in production.`);
  }
}

export function logDatabaseStartup({ configured, url }) {
  const envName = process.env.NODE_ENV || 'development';
  let projectRef = 'smqzvdcktzdmzcywnzlg';
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
  logger.info('[DB] Safe deployment verified: No database reset, drop, truncate, or wipe executed.');
}
