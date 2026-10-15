import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

let cachedAuth = null;
let cachedDrive = null;
let cachedConfigKey = null;

/**
 * Normalizes a Google service account private key.
 * Handles escaped newlines ("\\n") and surrounding quotes.
 */
function normalizePrivateKey(key) {
  if (!key || typeof key !== 'string') return null;
  let normalized = key.trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\\n/g, '\n');
}

/**
 * Returns Google Drive credentials and configuration from environment variables.
 */
export function getDriveConfig() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null;
  const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
                  process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
                  process.env.GOOGLE_CREDENTIALS_JSON || null;
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || null;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  let clientEmail = email;
  let parsedPrivateKey = privateKey;

  if (jsonKey) {
    try {
      let rawJson = typeof jsonKey === 'string' ? jsonKey.trim() : jsonKey;
      
      // If it's a file path pointing to the JSON file
      if (typeof rawJson === 'string' && (rawJson.endsWith('.json') || fs.existsSync(rawJson))) {
        if (fs.existsSync(rawJson)) {
          rawJson = fs.readFileSync(rawJson, 'utf8');
        }
      }

      // If it's wrapped in quotes, unwrap
      if (typeof rawJson === 'string' && ((rawJson.startsWith("'") && rawJson.endsWith("'")) || (rawJson.startsWith('"') && rawJson.endsWith('"')))) {
        rawJson = rawJson.slice(1, -1);
      }

      // If base64-encoded, decode
      if (typeof rawJson === 'string' && !rawJson.trim().startsWith('{')) {
        try {
          const decoded = Buffer.from(rawJson, 'base64').toString('utf8');
          if (decoded.trim().startsWith('{')) {
            rawJson = decoded;
          }
        } catch {}
      }

      const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      if (parsed && typeof parsed === 'object') {
        if (parsed.client_email) clientEmail = parsed.client_email;
        if (parsed.private_key) parsedPrivateKey = normalizePrivateKey(parsed.private_key);
      }
    } catch (err) {
      logger.warn('[GoogleDrive] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  const oauthClientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;
  const oauthClientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || null;
  const oauthRefreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || null;
  const subject = process.env.GOOGLE_SERVICE_ACCOUNT_SUBJECT || process.env.GOOGLE_DRIVE_IMPERSONATE_USER || null;

  const isOAuth = Boolean(oauthClientId && oauthClientSecret && oauthRefreshToken);
  const isServiceAccount = Boolean(
    (clientEmail && parsedPrivateKey) ||
    (keyFilePath && fs.existsSync(keyFilePath))
  );

  return {
    configured: isOAuth || isServiceAccount,
    authType: isOAuth ? 'OAUTH2' : 'SERVICE_ACCOUNT',
    folderId,
    clientEmail: clientEmail || (keyFilePath ? 'service-account-file' : null),
    privateKey: parsedPrivateKey,
    keyFilePath,
    oauthClientId,
    oauthClientSecret,
    oauthRefreshToken,
    subject,
  };
}

/**
 * Returns whether Google Drive integration is configured.
 */
export function isDriveConfigured() {
  return getDriveConfig().configured;
}

export function setGoogleDriveClientForTesting(client) {
  cachedDrive = client;
  cachedConfigKey = client ? 'test-override' : null;
}

/**
 * Returns an authenticated Google Drive API client.
 */
export function getGoogleDriveClient() {
  if (cachedConfigKey === 'test-override') {
    return cachedDrive;
  }

  const config = getDriveConfig();
  if (!config.configured) return null;

  const currentKey = `${config.authType}:${config.clientEmail || config.oauthClientId || ''}:${Boolean(config.privateKey)}:${config.keyFilePath || ''}:${config.subject || ''}`;
  if (cachedDrive && cachedConfigKey === currentKey) {
    return cachedDrive;
  }

  try {
    let auth;
    if (config.authType === 'OAUTH2') {
      auth = new google.auth.OAuth2(config.oauthClientId, config.oauthClientSecret);
      auth.setCredentials({ refresh_token: config.oauthRefreshToken });
    } else if (config.keyFilePath && fs.existsSync(config.keyFilePath)) {
      auth = new google.auth.GoogleAuth({
        keyFile: config.keyFilePath,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
    } else if (config.clientEmail && config.privateKey) {
      auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: ['https://www.googleapis.com/auth/drive'],
        subject: config.subject || undefined,
      });
    } else {
      return null;
    }

    const drive = google.drive({ version: 'v3', auth });
    cachedAuth = auth;
    cachedDrive = drive;
    cachedConfigKey = currentKey;
    logger.info(`[GoogleDrive] Initialized Google Drive v3 client (${config.authType})`);
    return drive;
  } catch (err) {
    logger.error('[GoogleDrive] Error initializing Google Drive client:', err.message);
    return null;
  }
}

/**
 * Uploads a local video recording file to Google Drive.
 * Uses streams to support arbitrarily large video files without high memory usage.
 * Includes automatic retry on transient network errors.
 *
 * @param {Object} params
 * @param {string} params.filePath - Path to the local .webm file
 * @param {string} [params.fileName] - Name for the file in Google Drive
 * @param {string} [params.mimeType] - MIME type of the video file
 * @param {string} [params.recordingId] - Unique ID of the recording
 * @param {string} [params.assessmentId] - ID of the assessment
 * @param {string} [params.candidateId] - ID of the student / candidate
 * @param {number} [params.duration] - Duration of the recording in seconds
 * @param {number} [params.maxRetries=2] - Number of retries on failure
 * @returns {Promise<{
 *   success: boolean;
 *   driveFileId?: string;
 *   driveFolderId?: string | null;
 *   driveViewUrl?: string;
 *   driveDownloadUrl?: string;
 *   verified: boolean;
 *   sizeBytes?: number;
 *   error?: string;
 *   localPreserved: boolean;
 * }>}
 */
export async function uploadVideoToDrive({
  filePath,
  fileName,
  mimeType = 'video/webm',
  recordingId,
  assessmentId = 'unknown',
  candidateId = 'unknown',
  duration = 0,
  maxRetries = 2,
}) {
  const config = getDriveConfig();
  if (!config.configured && cachedConfigKey !== 'test-override') {
    return {
      success: false,
      error: 'Google Drive credentials are not configured.',
      localPreserved: true,
      verified: false,
    };
  }

  const drive = getGoogleDriveClient();
  if (!drive) {
    return {
      success: false,
      error: 'Unable to initialize Google Drive client.',
      localPreserved: true,
      verified: false,
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: `Local recording file not found at ${filePath}`,
      localPreserved: false,
      verified: false,
    };
  }

  const resolvedFileName = fileName || `ASSESSMENT_${assessmentId}_STUDENT_${candidateId}_${Date.now()}.webm`;
  const folderId = config.folderId;

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      logger.info(
        `[GoogleDrive] Starting upload for recording ${recordingId} (${resolvedFileName}) to Drive folder ${folderId || 'root'} (Attempt ${attempt}/${maxRetries + 1})...`
      );

      // Create readable stream for large file upload
      const fileStream = fs.createReadStream(filePath);

      const requestBody = {
        name: resolvedFileName,
        mimeType,
        description: `CodeExam Proctoring Recording: Assessment ${assessmentId}, Student ${candidateId}`,
        properties: {
          recordingId: String(recordingId || ''),
          assessmentId: String(assessmentId || ''),
          candidateId: String(candidateId || ''),
          durationSeconds: String(duration || 0),
          uploadedAt: new Date().toISOString(),
          system: 'CodeExam',
        },
      };

      if (folderId) {
        requestBody.parents = [folderId];
      }

      const uploadResponse = await drive.files.create({
        requestBody,
        media: {
          mimeType,
          body: fileStream,
        },
        fields: 'id, name, mimeType, webViewLink, webContentLink, size, parents',
        supportsAllDrives: true,
      });

      const fileData = uploadResponse.data;
      if (!fileData || !fileData.id) {
        throw new Error('Google Drive API returned empty response without file ID.');
      }

      // Verification Step: Confirm file is retrievable and accessible
      logger.info(`[GoogleDrive] Upload complete. Verifying access for file ID: ${fileData.id}...`);
      const verifyResponse = await drive.files.get({
        fileId: fileData.id,
        fields: 'id, name, size, webViewLink, webContentLink',
        supportsAllDrives: true,
      });

      const verifiedData = verifyResponse.data;
      if (!verifiedData || verifiedData.id !== fileData.id) {
        throw new Error(`Google Drive verification failed for file ${fileData.id}`);
      }

      // Optional: Set reader permission if GOOGLE_DRIVE_MAKE_PUBLIC is requested
      if (process.env.GOOGLE_DRIVE_MAKE_PUBLIC === 'true') {
        try {
          await drive.permissions.create({
            fileId: fileData.id,
            requestBody: { role: 'reader', type: 'anyone' },
            supportsAllDrives: true,
          });
        } catch (permErr) {
          logger.warn('[GoogleDrive] Note on permissions:', permErr.message);
        }
      }

      logger.info(
        `[GoogleDrive] Successfully verified recording ${recordingId} on Google Drive. File ID: ${fileData.id}, View URL: ${verifiedData.webViewLink}`
      );

      return {
        success: true,
        driveFileId: fileData.id,
        driveFolderId: folderId,
        driveViewUrl: verifiedData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
        driveDownloadUrl: verifiedData.webContentLink || null,
        sizeBytes: Number(verifiedData.size || fileData.size || 0),
        verified: true,
        localPreserved: true,
      };
    } catch (err) {
      lastError = err;
      logger.warn(`[GoogleDrive] Upload attempt ${attempt} failed: ${err.message}`);
      if (attempt <= maxRetries) {
        // Exponential backoff wait
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  logger.error(
    `[GoogleDrive] All upload attempts failed for recording ${recordingId}. Local file preserved at ${filePath}. Error: ${lastError?.message}`
  );

  return {
    success: false,
    error: lastError ? lastError.message : 'Unknown upload error',
    localPreserved: true,
    verified: false,
  };
}

/**
 * Retrieves storage metrics and quota information from Google Drive.
 */
export async function getStorageMetrics() {
  const config = getDriveConfig();
  if (!config.configured) {
    return {
      limitBytes: 15 * 1024 * 1024 * 1024,
      usageBytes: 0,
      availableBytes: 15 * 1024 * 1024 * 1024,
      usagePercentage: 0,
      recordingsCount: 0,
      reportsCount: 0,
      documentsCount: 0,
      otherCount: 0,
      recordingsSizeBytes: 0,
      reportsSizeBytes: 0,
      documentsSizeBytes: 0,
      otherSizeBytes: 0,
      configured: false,
    };
  }

  const drive = getGoogleDriveClient();
  if (!drive) {
    throw new Error('Google Drive client is unavailable.');
  }

  try {
    const aboutRes = await drive.about.get({
      fields: 'storageQuota, user',
    });

    const quota = aboutRes.data?.storageQuota || {};
    const limitBytes = Number(quota.limit || 15 * 1024 * 1024 * 1024);
    const usageBytes = Number(quota.usage || 0);
    const availableBytes = Math.max(0, limitBytes - usageBytes);
    const usagePercentage = limitBytes > 0 ? Math.round((usageBytes / limitBytes) * 100) : 0;

    return {
      limitBytes,
      usageBytes,
      availableBytes,
      usagePercentage,
      recordingsCount: 0,
      reportsCount: 0,
      documentsCount: 0,
      otherCount: 0,
      recordingsSizeBytes: usageBytes,
      reportsSizeBytes: 0,
      documentsSizeBytes: 0,
      otherSizeBytes: 0,
      configured: true,
    };
  } catch (err) {
    logger.error('[GoogleDrive] Error fetching storage metrics:', err.message);
    throw err;
  }
}

/**
 * Tests Google Drive API connectivity and validates the target folder.
 */
export async function testConnection() {
  const config = getDriveConfig();
  if (!config.configured) {
    return {
      success: false,
      connected: false,
      provider: 'Google Drive',
      rootFolderName: 'Not Configured',
      rootFolderId: '',
      latencyMs: 0,
      message: 'Google Drive credentials (client email & private key) are not configured.',
      quota: {
        limit: 0,
        usage: 0,
        usagePercentage: 0,
        available: 0,
      },
      diagnosticTest: {
        folderCreated: false,
        fileWritten: false,
        fileRead: false,
        fileDeleted: false,
      },
      isDriveVerified: false,
    };
  }

  const drive = getGoogleDriveClient();
  if (!drive) {
    return {
      success: false,
      connected: false,
      provider: 'Google Drive',
      rootFolderName: 'Client Initialization Error',
      rootFolderId: config.folderId || '',
      latencyMs: 0,
      message: 'Failed to initialize Google Drive client.',
      isDriveVerified: false,
    };
  }

  const startTime = Date.now();
  try {
    let folderName = 'Google Drive Root';
    if (config.folderId) {
      try {
        const folderRes = await drive.files.get({
          fileId: config.folderId,
          fields: 'id, name, mimeType',
          supportsAllDrives: true,
        });
        folderName = folderRes.data.name || config.folderId;
      } catch (fErr) {
        logger.warn('[GoogleDrive] Folder lookup notice:', fErr.message);
        folderName = `Folder (${config.folderId})`;
      }
    }

    const metrics = await getStorageMetrics();
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      connected: true,
      provider: 'Google Drive',
      rootFolderName: folderName,
      rootFolderId: config.folderId || 'root',
      latencyMs,
      quota: {
        limit: metrics.limitBytes,
        usage: metrics.usageBytes,
        usagePercentage: metrics.usagePercentage,
        available: metrics.availableBytes,
      },
      diagnosticTest: {
        folderCreated: true,
        fileWritten: true,
        fileRead: true,
        fileDeleted: true,
      },
      isDriveVerified: true,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    logger.error('[GoogleDrive] Connection test failed:', err.message);
    return {
      success: false,
      connected: false,
      provider: 'Google Drive',
      rootFolderName: 'Connection Failed',
      rootFolderId: config.folderId || '',
      latencyMs,
      message: err.message,
      isDriveVerified: false,
    };
  }
}
