import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isDriveConfigured,
  getDriveConfig,
  uploadVideoToDrive,
  testConnection,
  getStorageMetrics,
  setGoogleDriveClientForTesting,
} from '../services/googleDriveService.js';
import {
  createRecording,
  appendChunk,
  finalizeRecording,
  getRecording,
  storeUploadedRecording,
} from '../services/recordingService.js';

test('Google Drive Service Configuration', async (t) => {
  await t.test('reports not configured when credentials env vars are missing', () => {
    const config = getDriveConfig();
    assert.equal(typeof config.configured, 'boolean');
  });

  await t.test('testConnection returns graceful diagnostics when not configured', async () => {
    const res = await testConnection();
    assert.equal(typeof res.connected, 'boolean');
    assert.equal(res.provider, 'Google Drive');
    assert.equal(typeof res.isDriveVerified, 'boolean');
  });

  await t.test('parses GOOGLE_SERVICE_ACCOUNT_JSON from raw JSON, quoted string, and base64', () => {
    const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    try {
      // 1. Raw JSON
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        client_email: 'test-json@gcp.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nMOCK_KEY\\n-----END PRIVATE KEY-----',
      });
      let config = getDriveConfig();
      assert.equal(config.configured, true);
      assert.equal(config.clientEmail, 'test-json@gcp.iam.gserviceaccount.com');
      assert.ok(config.privateKey.includes('MOCK_KEY'));

      // 2. Base64-encoded JSON
      const b64 = Buffer.from(JSON.stringify({
        client_email: 'b64@gcp.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nB64_KEY\\n-----END PRIVATE KEY-----',
      })).toString('base64');
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = b64;
      config = getDriveConfig();
      assert.equal(config.configured, true);
      assert.equal(config.clientEmail, 'b64@gcp.iam.gserviceaccount.com');
      assert.ok(config.privateKey.includes('B64_KEY'));
    } finally {
      if (originalEnv !== undefined) {
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalEnv;
      } else {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      }
    }
  });
});

test('Recording Lifecycle with Drive Integration and Local Fallback', async (t) => {
  await t.test('full recording chunk and finalize flow preserves local file when Drive unconfigured', async () => {
    setGoogleDriveClientForTesting(null);

    const recording = await createRecording({
      assessmentId: 'test-assessment-101',
      attemptId: 'test-attempt-202',
      studentId: 'student-303',
      recordingType: 'screen',
    });

    assert.ok(recording.recordingId.startsWith('rec-'));
    assert.equal(recording.status, 'RECORDING');

    // Append fake webm chunks
    const chunk1 = Buffer.from('FAKE_WEBM_HEADER_DATA');
    const chunk2 = Buffer.from('_FAKE_WEBM_BODY_DATA');
    await appendChunk(recording.recordingId, 0, chunk1, 5);
    await appendChunk(recording.recordingId, 1, chunk2, 10);

    const finalized = await finalizeRecording(recording.recordingId, 10, [
      { type: 'TAB_SWITCH', timestamp: new Date().toISOString() },
    ]);

    assert.equal(finalized.status, 'COMPLETED');
    assert.equal(finalized.duration, 10);
    assert.ok(finalized.playbackUrl.includes(recording.recordingId));
    assert.equal(finalized.uploadStatus, 'LOCAL_PRESERVED');

    // Confirm file exists on local disk
    const RECORDINGS_DIR = path.resolve(process.env.RECORDINGS_DIR || './data/recordings');
    const filePath = path.join(RECORDINGS_DIR, `${recording.recordingId}.webm`);
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0);
  });

  await t.test('storeUploadedRecording flow creates and preserves local recording', async () => {
    setGoogleDriveClientForTesting(null);

    const sampleBuffer = Buffer.from('MOCK_CAMERA_RECORDING_BYTES');
    const uploaded = await storeUploadedRecording(sampleBuffer, {
      assessmentId: 'test-assessment-404',
      candidateId: 'student-505',
      duration: 12,
    });

    assert.equal(uploaded.status, 'COMPLETED');
    assert.equal(uploaded.duration, 12);
    assert.ok(uploaded.playbackUrl);
    assert.equal(uploaded.uploadStatus, 'LOCAL_PRESERVED');

    const fetched = await getRecording(uploaded.recordingId);
    assert.equal(fetched.recordingId, uploaded.recordingId);
    assert.equal(fetched.status, 'COMPLETED');
  });

  await t.test('uploadVideoToDrive returns localPreserved: true on unconfigured environment', async () => {
    setGoogleDriveClientForTesting(null);

    const tempFile = path.resolve('./data/recordings/temp-test-upload.webm');
    await fs.mkdir(path.dirname(tempFile), { recursive: true });
    await fs.writeFile(tempFile, Buffer.from('TEMP_VIDEO_TEST'));

    try {
      const res = await uploadVideoToDrive({
        filePath: tempFile,
        fileName: 'temp-test-upload.webm',
        recordingId: 'rec-test-unit',
        assessmentId: 'assessment-test',
        candidateId: 'candidate-test',
        duration: 5,
      });

      // Should safely preserve local file and not crash
      assert.equal(res.localPreserved, true);
      assert.equal(res.verified, false);
      assert.ok(res.error);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  });

  await t.test('uploadVideoToDrive successfully uploads and verifies with Google Drive client', async () => {
    let createCalled = false;
    let getCalled = false;

    const mockDriveClient = {
      files: {
        create: async (params) => {
          createCalled = true;
          assert.ok(params.requestBody.name);
          assert.equal(params.requestBody.mimeType, 'video/webm');
          assert.ok(params.media.body);
          for await (const _chunk of params.media.body) {}
          return {
            data: {
              id: 'drive-file-mock-999',
              name: params.requestBody.name,
              mimeType: 'video/webm',
              webViewLink: 'https://drive.google.com/file/d/drive-file-mock-999/view',
              size: '1024',
            },
          };
        },
        get: async (params) => {
          getCalled = true;
          assert.equal(params.fileId, 'drive-file-mock-999');
          return {
            data: {
              id: 'drive-file-mock-999',
              name: 'verified-recording.webm',
              size: '1024',
              webViewLink: 'https://drive.google.com/file/d/drive-file-mock-999/view',
            },
          };
        },
      },
    };

    setGoogleDriveClientForTesting(mockDriveClient);

    const tempFile = path.resolve('./data/recordings/mock-success.webm');
    await fs.mkdir(path.dirname(tempFile), { recursive: true });
    await fs.writeFile(tempFile, Buffer.from('MOCK_VIDEO_STREAM_BYTES'));

    try {
      const res = await uploadVideoToDrive({
        filePath: tempFile,
        fileName: 'mock-success.webm',
        recordingId: 'rec-mock-drive-test',
        assessmentId: 'asmt-777',
        candidateId: 'cand-888',
        duration: 45,
      });

      assert.equal(createCalled, true);
      assert.equal(getCalled, true);
      assert.equal(res.success, true);
      assert.equal(res.verified, true);
      assert.equal(res.driveFileId, 'drive-file-mock-999');
      assert.ok(res.driveViewUrl.includes('drive-file-mock-999'));
      assert.equal(res.localPreserved, true);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
      setGoogleDriveClientForTesting(null);
    }
  });

  await t.test('finalizeRecording marks recording as COMPLETED and GOOGLE_DRIVE when Drive upload succeeds', async () => {
    const mockDriveClient = {
      files: {
        create: async (params) => {
          for await (const _chunk of params.media.body) {}
          return {
            data: {
              id: 'drive-file-mock-finalized',
              webViewLink: 'https://drive.google.com/file/d/drive-file-mock-finalized/view',
              size: '2048',
            },
          };
        },
        get: async (params) => ({
          data: {
            id: params.fileId,
            size: '2048',
            webViewLink: 'https://drive.google.com/file/d/drive-file-mock-finalized/view',
          },
        }),
      },
    };

    setGoogleDriveClientForTesting(mockDriveClient);

    try {
      const recording = await createRecording({
        assessmentId: 'asmt-drive-success',
        candidateId: 'cand-drive-success',
        recordingType: 'screen',
      });

      await appendChunk(recording.recordingId, 0, Buffer.from('CHUNK_DATA_1'), 10);
      const finalized = await finalizeRecording(recording.recordingId, 10);

      assert.equal(finalized.status, 'COMPLETED');
      assert.equal(finalized.uploadStatus, 'COMPLETED');
      assert.equal(finalized.storageProvider, 'GOOGLE_DRIVE');
      assert.equal(finalized.isDriveVerified, true);
      assert.equal(finalized.driveFileId, 'drive-file-mock-finalized');
      assert.ok(finalized.driveViewUrl.includes('drive-file-mock-finalized'));
    } finally {
      setGoogleDriveClientForTesting(null);
    }
  });

  await t.test('upload failure retries and preserves local copy without throwing', async () => {
    let callCount = 0;
    const failingMockDriveClient = {
      files: {
        create: async (params) => {
          callCount++;
          if (params?.media?.body) {
            params.media.body.destroy();
          }
          throw new Error('Network timeout reaching Google Drive API');
        },
      },
    };

    setGoogleDriveClientForTesting(failingMockDriveClient);

    const tempFile = path.resolve('./data/recordings/mock-failure.webm');
    await fs.mkdir(path.dirname(tempFile), { recursive: true });
    await fs.writeFile(tempFile, Buffer.from('FAIL_VIDEO_BYTES'));

    try {
      const res = await uploadVideoToDrive({
        filePath: tempFile,
        fileName: 'mock-failure.webm',
        recordingId: 'rec-fail-test',
        assessmentId: 'asmt-fail',
        candidateId: 'cand-fail',
        duration: 10,
        maxRetries: 1,
      });

      // Retried at least once
      assert.ok(callCount >= 2);
      assert.equal(res.success, false);
      assert.equal(res.verified, false);
      assert.equal(res.localPreserved, true);
      assert.ok(res.error.includes('Network timeout'));

      // File is still on disk
      const stat = await fs.stat(tempFile);
      assert.ok(stat.size > 0);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
      setGoogleDriveClientForTesting(null);
    }
  });
});
