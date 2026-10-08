import { Router } from 'express';
import multer from 'multer';
import {
  appendChunk,
  createRecording,
  finalizeRecording,
  getRecording,
  getRecordingsForAssessment,
  getRecordingForSession,
  readRecordingRange,
  storeUploadedRecording,
} from '../services/recordingService.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

router.post('/start', async (req, res, next) => {
  try {
    if (!req.body?.assessmentId || !req.body?.attemptId) {
      return sendError(res, 'assessmentId and attemptId are required.', 400, 'INVALID_RECORDING');
    }
    const recording = await createRecording(req.body);
    return sendSuccess(res, { recordingId: recording.recordingId, recording }, 'Recording started.', 201);
  } catch (error) {
    return next(error);
  }
});

router.post('/:recordingId/chunk', upload.single('chunk'), async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'A recording chunk is required.', 400, 'MISSING_CHUNK');
    const recording = await appendChunk(req.params.recordingId, req.body.chunkIndex, req.file.buffer, req.body.duration);
    if (!recording) return sendError(res, 'Recording not found.', 404, 'RECORDING_NOT_FOUND');
    return sendSuccess(res, {
      recordingId: recording.recordingId,
      chunkIndex: Number(req.body.chunkIndex),
      totalChunks: recording.chunkCount,
      lastUploadedChunk: recording.lastUploadedChunk,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:recordingId/finalize', async (req, res, next) => {
  try {
    const recording = await finalizeRecording(req.params.recordingId, req.body?.duration, req.body?.events);
    if (!recording) return sendError(res, 'Recording not found.', 404, 'RECORDING_NOT_FOUND');
    return sendSuccess(res, {
      recordingId: recording.recordingId,
      status: recording.status,
      duration: recording.duration,
      playbackUrl: recording.playbackUrl,
      chunkCount: recording.chunkCount,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/upload', upload.single('recording'), async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'A recording file is required.', 400, 'MISSING_RECORDING');
    const recording = await storeUploadedRecording(req.file.buffer, req.body);
    return sendSuccess(res, {
      recording,
      streamUrl: recording.playbackUrl,
    }, 'Recording uploaded.', 201);
  } catch (error) {
    return next(error);
  }
});

router.get('/assessment/:assessmentId', asyncHandler(async (req, res) => {
  return sendSuccess(res, { recordings: getRecordingsForAssessment(req.params.assessmentId) });
}));

router.get('/stream/:recordingId', async (req, res, next) => {
  try {
    const recording = await getRecording(req.params.recordingId);
    if (!recording) return sendError(res, 'Recording not found.', 404, 'RECORDING_NOT_FOUND');
    const range = req.headers.range;
    const fullEnd = recording.sizeBytes - 1;
    const match = range?.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : fullEnd;
    const result = await readRecordingRange(req.params.recordingId, start, end);
    if (!result) return sendError(res, 'Recording file is unavailable.', 404, 'RECORDING_FILE_NOT_FOUND');
    res.status(match ? 206 : 200);
    res.set({
      'Content-Type': recording.mimeType || 'video/webm',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(result.end - result.start + 1),
      'Content-Range': `bytes ${result.start}-${result.end}/${result.size}`,
      'Cache-Control': 'private, max-age=3600',
    });
    return result.stream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

router.get('/:recordingId', asyncHandler(async (req, res) => {
  const recording = await getRecording(req.params.recordingId);
  if (!recording) return sendError(res, 'Recording not found.', 404, 'RECORDING_NOT_FOUND');
  return sendSuccess(res, { recording });
}));

export function registerRecordingLookups(app) {
  app.get('/api/sessions/:sessionId/screen-video', asyncHandler(async (req, res) => {
    const recording = getRecordingForSession(req.params.sessionId, 'screen');
    return sendSuccess(res, recording ? {
      url: recording.playbackUrl,
      isStored: true,
      ...recording,
    } : { url: null, isStored: false });
  }));
  app.get('/api/assessments/:assessmentId/recordings', asyncHandler(async (req, res) => {
    return sendSuccess(res, { recordings: getRecordingsForAssessment(req.params.assessmentId) });
  }));
}

export default router;
