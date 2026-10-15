import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { uploadVideoToDrive } from './googleDriveService.js';
import { isSupabaseConfigured, supabase, memoryStore } from './supabaseService.js';
import { logger } from '../utils/logger.js';

const RECORDINGS_DIR = path.resolve(process.env.RECORDINGS_DIR || './data/recordings');
const recordings = new Map();

async function ensureDirectory() {
  await fs.mkdir(RECORDINGS_DIR, { recursive: true });
}

function publicRecording(recording) {
  const { chunks: _chunks, ...metadata } = recording;
  return metadata;
}

export async function createRecording(data) {
  await ensureDirectory();
  const recordingId = `rec-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const studentId = data.studentId || data.candidateId || 'student';
  const recording = {
    recordingId,
    attemptId: data.attemptId || data.sessionId,
    sessionId: data.sessionId || data.attemptId,
    assessmentId: data.assessmentId,
    studentId,
    candidateId: studentId,
    studentName: data.studentName || data.candidateName || 'Student',
    studentRegisterNo: data.studentRegisterNo,
    recordingType: data.recordingType || 'screen',
    status: 'RECORDING',
    uploadStatus: 'IN_PROGRESS',
    chunkCount: 0,
    lastUploadedChunk: -1,
    duration: 0,
    sizeBytes: 0,
    timelineEvents: [],
    startedAt: new Date().toISOString(),
    chunks: new Map(),
    driveFileId: null,
    driveFolderId: null,
    driveViewUrl: null,
    isDriveVerified: false,
    storageProvider: 'LOCAL',
  };
  recordings.set(recordingId, recording);
  return publicRecording(recording);
}

export async function appendChunk(recordingId, chunkIndex, buffer, duration) {
  const recording = recordings.get(recordingId);
  if (!recording) return null;
  const index = Number(chunkIndex);
  if (!Number.isInteger(index) || index < 0 || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid recording chunk.');
  }
  if (!recording.chunks.has(index)) {
    recording.chunks.set(index, buffer);
    recording.sizeBytes += buffer.length;
  }
  recording.chunkCount = recording.chunks.size;
  recording.lastUploadedChunk = Math.max(recording.lastUploadedChunk, index);
  recording.duration = Math.max(recording.duration, Number(duration) || 0);
  return publicRecording(recording);
}

export async function finalizeRecording(recordingId, duration, events = []) {
  const recording = recordings.get(recordingId);
  if (!recording) return null;
  await ensureDirectory();
  const orderedChunks = [...recording.chunks.keys()].sort((a, b) => a - b).map((index) => recording.chunks.get(index));
  const fileBuffer = Buffer.concat(orderedChunks);
  const filePath = path.join(RECORDINGS_DIR, `${recordingId}.webm`);
  await fs.writeFile(filePath, fileBuffer);

  recording.filePath = filePath;
  recording.sizeBytes = fileBuffer.length;
  recording.mimeType = 'video/webm';
  recording.duration = Math.max(recording.duration, Number(duration) || 0);
  recording.timelineEvents = Array.isArray(events) ? events : [];
  recording.endedAt = new Date().toISOString();
  recording.playbackUrl = `/api/recordings/stream/${encodeURIComponent(recordingId)}`;
  recording.status = 'COMPLETED';

  // Upload to Google Drive using server-side credentials and streaming
  const fileName = `ASSESSMENT_${recording.assessmentId || 'ASSESSMENT'}_STUDENT_${recording.studentId || recording.candidateId || 'STUDENT'}_${recording.recordingType}_${recordingId}.webm`;
  const uploadResult = await uploadVideoToDrive({
    filePath,
    fileName,
    mimeType: recording.mimeType,
    recordingId,
    assessmentId: recording.assessmentId,
    candidateId: recording.studentId || recording.candidateId,
    duration: recording.duration,
  });

  if (uploadResult.success && uploadResult.verified) {
    recording.driveFileId = uploadResult.driveFileId;
    recording.driveFolderId = uploadResult.driveFolderId || null;
    recording.driveViewUrl = uploadResult.driveViewUrl;
    recording.driveDownloadUrl = uploadResult.driveDownloadUrl || null;
    recording.isDriveVerified = true;
    recording.uploadStatus = 'COMPLETED';
    recording.storageProvider = 'GOOGLE_DRIVE';
    logger.info(`[RecordingService] Recording ${recordingId} uploaded and verified on Google Drive (File ID: ${uploadResult.driveFileId}).`);
  } else {
    recording.driveFileId = null;
    recording.driveFolderId = null;
    recording.driveViewUrl = null;
    recording.isDriveVerified = false;
    recording.uploadStatus = 'LOCAL_PRESERVED';
    recording.uploadError = uploadResult.error || null;
    recording.storageProvider = 'LOCAL';
    if (uploadResult.error) {
      logger.warn(`[RecordingService] Google Drive upload failed for ${recordingId}: ${uploadResult.error}. Local recording safely preserved.`);
    }
  }

  // Link recording URLs to active or completed session in memoryStore
  try {
    const session = memoryStore.sessions?.find(
      (s) => s.id === recording.sessionId || s.id === recording.attemptId
    );
    if (session) {
      if (recording.recordingType === 'camera') {
        session.proctoringVideoUrl = recording.playbackUrl;
        session.proctoring_video_url = recording.playbackUrl;
        if (recording.driveViewUrl) {
          session.driveProctoringVideoUrl = recording.driveViewUrl;
        }
      } else {
        session.screenVideoUrl = recording.playbackUrl;
        session.screen_video_url = recording.playbackUrl;
        if (recording.driveViewUrl) {
          session.driveScreenVideoUrl = recording.driveViewUrl;
        }
      }
    }
  } catch (sessErr) {
    logger.warn('[RecordingService] Error updating session with recording URL:', sessErr.message);
  }

  // Persist recording metadata to Supabase if configured
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('recordings').upsert({
        id: recording.recordingId,
        attempt_id: recording.attemptId || recording.sessionId,
        student_id: String(recording.studentId || recording.candidateId || 'student'),
        assessment_id: String(recording.assessmentId || 'unknown'),
        drive_file_id: recording.driveFileId || null,
        drive_folder_id: recording.driveFolderId || null,
        status: recording.status,
        started_at: recording.startedAt,
        ended_at: recording.endedAt,
        uploaded_at: recording.driveFileId ? new Date().toISOString() : null,
        file_size: recording.sizeBytes || 0,
        error: recording.uploadError || null,
        data: {
          recordingType: recording.recordingType,
          playbackUrl: recording.playbackUrl,
          driveViewUrl: recording.driveViewUrl,
          isDriveVerified: recording.isDriveVerified,
          duration: recording.duration,
          timelineEvents: recording.timelineEvents,
          storageProvider: recording.storageProvider,
        },
      });
    } catch (dbErr) {
      logger.warn('[RecordingService] Supabase recordings upsert notice:', dbErr.message);
    }
  }

  return publicRecording(recording);
}

export async function getRecording(recordingId) {
  return recordings.get(recordingId) ? publicRecording(recordings.get(recordingId)) : null;
}

export function getRecordingsForAssessment(assessmentId) {
  return [...recordings.values()]
    .filter((recording) => recording.assessmentId === assessmentId)
    .map(publicRecording);
}

export function getRecordingForSession(sessionId, recordingType = 'screen') {
  const recording = [...recordings.values()].reverse().find(
    (item) => item.sessionId === sessionId && item.recordingType === recordingType
  );
  return recording ? publicRecording(recording) : null;
}

export async function readRecordingRange(recordingId, start, end) {
  const recording = recordings.get(recordingId);
  if (!recording?.filePath) return null;
  const stat = await fs.stat(recording.filePath);
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(end, stat.size - 1);
  if (safeStart > safeEnd) return null;
  return {
    stream: (await import('fs')).createReadStream(recording.filePath, { start: safeStart, end: safeEnd }),
    size: stat.size,
    start: safeStart,
    end: safeEnd,
  };
}

export async function storeUploadedRecording(buffer, metadata) {
  const recording = await createRecording({ ...metadata, recordingType: metadata.recordingType || 'camera' });
  await appendChunk(recording.recordingId, 0, buffer, metadata.duration);
  return finalizeRecording(recording.recordingId, metadata.duration);
}
