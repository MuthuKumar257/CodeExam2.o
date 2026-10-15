import { Router } from 'express';
import { getStorageMetrics, testConnection, isDriveConfigured } from '../services/googleDriveService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

/**
 * GET /api/drive/storage
 * Returns Google Drive storage metrics (usage, quota, and breakdown)
 */
router.get('/storage', asyncHandler(async (req, res) => {
  const metrics = await getStorageMetrics();
  return sendSuccess(res, metrics);
}));

/**
 * GET /api/drive/test-connection
 * Validates Google Drive connection, API health, root folder access, and latency
 */
router.get('/test-connection', asyncHandler(async (req, res) => {
  const result = await testConnection();
  return sendSuccess(res, result);
}));

/**
 * GET /api/drive/status
 * Returns simplified configuration status of Google Drive
 */
router.get('/status', asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    configured: isDriveConfigured(),
    provider: 'GOOGLE_DRIVE',
  });
}));

export default router;

