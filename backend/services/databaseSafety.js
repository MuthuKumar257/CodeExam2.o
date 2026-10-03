import 'dotenv/config';
import { logger } from '../utils/logger.js';

export const isProduction = process.env.NODE_ENV === 'production';

export function assertDestructiveOperationAllowed(operation) {
  if (isProduction) {
    throw new Error(`[DB] Destructive operation "${operation}" is unavailable in production.`);
  }
}

export function logDatabaseStartup({ configured, url }) {
  if (configured) {
    logger.info('[DB] Connected to Supabase');
    if (isProduction) logger.info('[DB] Production database detected');
  } else {
    logger.warn('[DB] Supabase is not configured; persistence is unavailable.');
  }
  logger.info('[DB] No database reset or seed operation executed');
  if (url && !isProduction) logger.info(`[DB] Development database: ${url}`);
}
