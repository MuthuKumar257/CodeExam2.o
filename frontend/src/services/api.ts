import { auth, getLocalStoredUser } from './firebase';

const API_BASE = '';

async function request<T>(path: string, options: RequestInit = {}, maxRetries: number = 2): Promise<T> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const localUser = getLocalStoredUser();
  if (localUser?.id) {
    headers.set('x-user-id', localUser.id);
    if (localUser.role) headers.set('x-user-role', localUser.role);
    if (localUser.institutionId) headers.set('x-user-institution', localUser.institutionId);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (!response.ok) {
        const isRetryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
        if (isRetryable && attempt < maxRetries) {
          attempt++;
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt) + Math.random() * 150;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const body = isJson ? await response.json().catch(() => null) : null;
        const error = new Error(body?.error || body?.message || 'The request could not be completed.') as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const isJson = response.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        return response.json() as Promise<T>;
      }
      const text = await response.text();
      return (text ? { message: text } : {}) as Promise<T>;
    } catch (err: any) {
      if (attempt < maxRetries && (err.name === 'TypeError' || err.name === 'AbortError')) {
        attempt++;
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

export async function deleteResource(resource: 'users' | 'classes' | 'questions' | 'assessments', id: string) {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new Error(`Invalid ${resource.slice(0, -1)} ID.`);
  }
  const endpoint = resource === 'users' || resource === 'assessments'
    ? `/api/db/${resource}/${encodeURIComponent(id)}`
    : `/api/${resource}/${encodeURIComponent(id)}`;
  return request<{ success: true; id: string }>(endpoint, { method: 'DELETE' });
}

export async function resetUserPasswordApi(userId: string, newPassword?: string) {
  if (!userId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(userId)) {
    throw new Error('Invalid user ID.');
  }
  return request<{ success: true; id: string; newPassword: string }>(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: newPassword, newPassword }),
  });
}

export async function updateUserPasswordApi(userId: string, newPassword: string) {
  if (!userId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(userId)) {
    throw new Error('Invalid user ID.');
  }
  return request<{ success: true; id: string; message: string }>(`/api/users/${encodeURIComponent(userId)}/update-password`, {
    method: 'POST',
    body: JSON.stringify({ password: newPassword, newPassword }),
  });
}

export async function generateReport(assessmentId: string, format: 'pdf' | 'csv') {
  return request<{ file: { id: string; fileName: string } }>('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify({ assessmentId, format }),
  });
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch(`${API_BASE}/api/files/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error('The file could not be downloaded.');
  return response.blob();
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

import { ScreenRecording, RecordingTimelineEvent } from '../types';
export type { RecordingTimelineEvent };

export async function uploadRecordingApi(
  blob: Blob,
  metadata: {
    assessmentId?: string;
    sessionId?: string;
    candidateId?: string;
    recordingType?: 'camera' | 'screen';
    duration?: number;
  }
) {
  const formData = new FormData();
  formData.append('recording', blob, `${metadata.recordingType || 'camera'}_recording.webm`);
  if (metadata.assessmentId) formData.append('assessmentId', metadata.assessmentId);
  if (metadata.sessionId) formData.append('sessionId', metadata.sessionId);
  if (metadata.candidateId) formData.append('candidateId', metadata.candidateId);
  if (metadata.recordingType) formData.append('recordingType', metadata.recordingType);
  if (metadata.duration) formData.append('duration', String(metadata.duration || 0));

  return request<{ success: boolean; recording: any; streamUrl: string }>('/api/recordings/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function fetchScreenRecordingApi(sessionId: string) {
  try {
    return await request<{ url: string | null; sizeBytes?: number; recordedAt?: string; isStored: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/screen-video`
    );
  } catch {
    return { url: null, isStored: false };
  }
}

/**
 * 1. Start a Screen Recording session
 */
export async function startScreenRecordingApi(payload: {
  assessmentId: string;
  attemptId: string;
  studentId?: string;
  studentName?: string;
  studentRegisterNo?: string;
}) {
  return request<{ success: boolean; recordingId: string; recording: ScreenRecording }>(
    '/api/recordings/start',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

/**
 * 2. Upload progressive chunk
 */
export async function uploadScreenChunkApi(
  recordingId: string,
  chunkBlob: Blob,
  chunkIndex: number,
  duration: number
) {
  const formData = new FormData();
  formData.append('chunk', chunkBlob, `chunk_${String(chunkIndex).padStart(5, '0')}.webm`);
  formData.append('chunkIndex', String(chunkIndex));
  formData.append('duration', String(duration));
  formData.append('chunkTimestamp', new Date().toISOString());

  return request<{
    success: boolean;
    recordingId: string;
    chunkIndex: number;
    totalChunks: number;
    duplicate?: boolean;
  }>(`/api/recordings/${encodeURIComponent(recordingId)}/chunk`, {
    method: 'POST',
    body: formData,
  });
}

/**
 * 3. Finalize screen recording
 */
export async function finalizeScreenRecordingApi(
  recordingId: string,
  payload: {
    duration: number;
    events?: RecordingTimelineEvent[];
  }
) {
  return request<{
    success: boolean;
    recordingId: string;
    status: string;
    duration: number;
    playbackUrl: string;
    chunkCount: number;
  }>(`/api/recordings/${encodeURIComponent(recordingId)}/finalize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 4. Fetch screen recording metadata
 */
export async function fetchScreenRecordingMetadataApi(recordingId: string) {
  return request<{ success: boolean; recording: ScreenRecording }>(
    `/api/recordings/${encodeURIComponent(recordingId)}`
  );
}

/**
 * 5. Fetch all screen recordings for an assessment
 */
export async function fetchAssessmentScreenRecordingsApi(assessmentId: string) {
  return request<{ success: boolean; recordings: ScreenRecording[] }>(
    `/api/assessments/${encodeURIComponent(assessmentId)}/recordings`
  );
}

/**
 * 6. Fetch live monitoring data for an assessment
 */
export async function fetchLiveMonitoringApi(assessmentId: string) {
  return request<{
    success: boolean;
    students: Array<{
      sessionId: string;
      attemptId: string;
      assessmentId: string;
      assessmentTitle?: string;
      studentId: string;
      studentName: string;
      studentEmail?: string;
      registerNumber?: string;
      status: string;
      streamStatus: string;
      screenActive: boolean;
      cameraActive: boolean;
      connectionStatus: string;
      warningsCount: number;
      timeSpentSeconds: number;
      recordingId?: string | null;
      chunkCount?: number;
      lastUploadedChunk?: number;
    }>;
  }>(`/api/monitoring/${encodeURIComponent(assessmentId)}`);
}

/**
 * 7. Update monitoring status (tab switch, pause, resume, screen share interrupt)
 */
export async function updateMonitoringStatusApi(
  attemptId: string,
  payload: {
    status?: string;
    streamStatus?: string;
    screenActive?: boolean;
    cameraActive?: boolean;
    event?: {
      type: string;
      description: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'INFO';
    };
  }
) {
  return request<{ success: boolean }>(`/api/monitoring/${encodeURIComponent(attemptId)}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 8. Fetch Google Drive storage metrics
 */
export async function fetchDriveStorageMetricsApi() {
  return request<{
    limitBytes: number;
    usageBytes: number;
    availableBytes: number;
    usagePercentage: number;
    recordingsCount: number;
    reportsCount: number;
    documentsCount: number;
    otherCount: number;
    recordingsSizeBytes: number;
    reportsSizeBytes: number;
    documentsSizeBytes: number;
    otherSizeBytes: number;
  }>('/api/drive/storage');
}

/**
 * 9. Test Google Drive Connection & Health
 */
export async function testGoogleDriveConnectionApi() {
  return request<{
    success: boolean;
    connected: boolean;
    provider: string;
    rootFolderName: string;
    rootFolderId: string;
    latencyMs: number;
    quota: {
      limit: number;
      usage: number;
      usagePercentage: number;
      available: number;
    };
    diagnosticTest: {
      folderCreated: boolean;
      fileWritten: boolean;
      fileRead: boolean;
      fileDeleted: boolean;
    };
  }>('/api/drive/test-connection');
}

/**
 * 10. Fetch Complete Storage & Video Metadata Audit Report
 */
export async function fetchStorageAuditReportApi() {
  return request<{
    success: boolean;
    auditTimestamp: string;
    overallHealth: string;
    healthScore: number;
    quota: {
      limitBytes: number;
      usageBytes: number;
      availableBytes: number;
      usagePercentage: number;
    };
    summary: {
      totalRecordings: number;
      totalUploaded: number;
      totalInProgress: number;
      totalFailed: number;
      totalSizeBytes: number;
    };
    auditChecklist: Array<{
      id: string;
      title: string;
      description: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      details: string;
    }>;
    recordings: Array<{
      recordingId: string;
      attemptId: string;
      assessmentId: string;
      studentId: string;
      studentName: string;
      studentRegisterNo?: string;
      duration: number;
      chunkCount: number;
      status: string;
      uploadStatus: string;
      driveFileId?: string;
      driveFolderId?: string;
      playbackUrl?: string;
      timelineEventsCount: number;
      sizeBytes: number;
      startedAt: string;
      endedAt?: string;
      source: string;
      isDriveVerified: boolean;
      integrityStatus: 'VERIFIED' | 'IN_PROGRESS' | 'PENDING' | 'FAILED';
    }>;
  }>('/api/admin/storage/audit');
}

/**
 * 11. Run Live Storage Verification Test
 */
export async function runStorageVerificationTestApi() {
  return request<{
    success: boolean;
    testId: string;
    durationMs: number;
    allPassed: boolean;
    logs: Array<{
      step: string;
      status: 'SUCCESS' | 'FAILED';
      message: string;
    }>;
  }>('/api/admin/storage/run-verification', {
    method: 'POST',
  });
}

/**
 * 12. Fetch backend stored screen recording for candidate session
 */
export async function fetchSessionScreenVideoApi(sessionId: string) {
  return request<{
    url: string | null;
    isStored: boolean;
    recordingId?: string;
    driveFileId?: string;
    driveFolderId?: string;
    status?: string;
    uploadStatus?: string;
    duration?: number;
    chunkCount?: number;
    timelineEvents?: RecordingTimelineEvent[];
    sizeBytes?: number;
    recordedAt?: string;
  }>(`/api/sessions/${encodeURIComponent(sessionId)}/screen-video`);
}

/**
 * 13. Admin User Management APIs
 */
export async function adminCreateUserApi(data: {
  name: string;
  email: string;
  role: 'FACULTY' | 'CANDIDATE' | 'faculty' | 'student';
  registerNumber?: string;
  department?: string;
  classIds?: string[];
}) {
  return request<any>('/api/admin/users/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminUpdateUserApi(
  userId: string,
  data: {
    name?: string;
    email?: string;
    registerNumber?: string;
    department?: string;
  }
) {
  return request<any>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function adminToggleUserStatusApi(userId: string, status: 'active' | 'disabled') {
  return request<{ success: boolean; id: string; accountStatus: string }>(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function adminForcePasswordChangeApi(userId: string) {
  return request<{ success: boolean; id: string; mustChangePassword: true }>(
    `/api/admin/users/${encodeURIComponent(userId)}/force-password-change`,
    {
      method: 'POST',
    }
  );
}

export async function adminForcePasswordResetApi(userId: string) {
  return request<{ success: boolean; id: string; message: string }>(
    `/api/admin/users/${encodeURIComponent(userId)}/force-password-reset`,
    {
      method: 'POST',
    }
  );
}

export async function adminRetryProvisioningApi(userId: string) {
  return request<any>(`/api/admin/users/${encodeURIComponent(userId)}/retry-provisioning`, {
    method: 'POST',
  });
}
