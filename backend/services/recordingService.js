import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

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
  const recording = {
    recordingId,
    attemptId: data.attemptId,
    sessionId: data.attemptId,
    assessmentId: data.assessmentId,
    studentId: data.studentId,
    studentName: data.studentName || 'Student',
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
  const filePath = path.join(RECORDINGS_DIR, `${recordingId}.webm`);
  await fs.writeFile(filePath, Buffer.concat(orderedChunks));
  recording.filePath = filePath;
  recording.mimeType = 'video/webm';
  recording.duration = Math.max(recording.duration, Number(duration) || 0);
  recording.timelineEvents = Array.isArray(events) ? events : [];
  recording.status = 'COMPLETED';
  recording.uploadStatus = 'UPLOADED';
  recording.endedAt = new Date().toISOString();
  recording.playbackUrl = `/api/recordings/stream/${encodeURIComponent(recordingId)}`;
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
