// IndexedDB Video Storage & Retention Management Service
// Provides persistent storage for proctoring playback videos with configurable retention policy (default: 15 days).

export interface StoredVideoRecord {
  sessionId: string;
  blob: Blob;
  recordedAt: string; // ISO date
  expiresAt: string; // ISO date
  retentionDays: number; // e.g. 15
  sizeBytes: number;
  mimeType: string;
  candidateId?: string;
  candidateName?: string;
  assessmentId?: string;
  assessmentTitle?: string;
}

export interface StoredVideoMeta {
  sessionId: string;
  recordedAt: string;
  expiresAt: string;
  retentionDays: number;
  sizeBytes: number;
  mimeType: string;
  candidateName?: string;
  assessmentTitle?: string;
  isExpired: boolean;
  daysRemaining: number;
}

export interface StorageUsageStats {
  count: number;
  totalBytes: number;
  totalMegabytes: string;
  activeCount: number;
  expiredCount: number;
  configuredRetentionDays: number;
}

const DB_NAME = 'codeguard_proctoring_videos_db';
const DB_VERSION = 1;
const STORE_NAME = 'session_videos';

// Cache active Object URLs to avoid memory leaks and multiple allocations
const activeObjectUrls = new Map<string, string>();

/**
 * Opens or upgrades the IndexedDB instance for video storage
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
        store.createIndex('recordedAt', 'recordedAt', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores a candidate's session video recording with retention policy
 */
export async function storeSessionVideo(
  sessionId: string,
  videoBlob: Blob,
  retentionDays: number = 15,
  metadata?: {
    candidateId?: string;
    candidateName?: string;
    assessmentId?: string;
    assessmentTitle?: string;
  }
): Promise<StoredVideoRecord> {
  const days = Math.max(1, retentionDays || 15);
  const recordedAtDate = new Date();
  const expiresAtDate = new Date(recordedAtDate.getTime() + days * 24 * 60 * 60 * 1000);

  const record: StoredVideoRecord = {
    sessionId,
    blob: videoBlob,
    recordedAt: recordedAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    retentionDays: days,
    sizeBytes: videoBlob.size,
    mimeType: videoBlob.type || 'video/webm',
    candidateId: metadata?.candidateId,
    candidateName: metadata?.candidateName,
    assessmentId: metadata?.assessmentId,
    assessmentTitle: metadata?.assessmentTitle,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });

    // Also register an active URL for instant playback
    if (activeObjectUrls.has(sessionId)) {
      try {
        URL.revokeObjectURL(activeObjectUrls.get(sessionId)!);
      } catch {
        // ignore
      }
    }
    const url = URL.createObjectURL(videoBlob);
    activeObjectUrls.set(sessionId, url);

    console.log(
      `[VideoStorage] Stored video for session ${sessionId} (${(videoBlob.size / (1024 * 1024)).toFixed(
        2
      )} MB). Retention: ${days} days, Expires: ${record.expiresAt}`
    );
  } catch (err) {
    console.warn('[VideoStorage] Error writing to IndexedDB:', err);
  }

  return record;
}

/**
 * Retrieves a stored session video, checking its expiration against the retention policy
 */
export async function getSessionVideo(
  sessionId: string,
  configuredRetentionDays?: number
): Promise<{
  url: string | null;
  blob: Blob | null;
  record: StoredVideoRecord | null;
  isExpired: boolean;
  daysRemaining: number;
  formattedExpiry: string;
} | null> {
  try {
    const db = await openDB();
    const rawRecord = await new Promise<StoredVideoRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(sessionId);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });

    if (!rawRecord) {
      return null;
    }

    const effectiveRetentionDays = configuredRetentionDays || rawRecord.retentionDays || 15;
    const recordedTime = new Date(rawRecord.recordedAt).getTime();
    const computedExpireTime = recordedTime + effectiveRetentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const isExpired = now > computedExpireTime;
    const diffMs = computedExpireTime - now;
    const daysRemaining = isExpired ? 0 : Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const expiryDate = new Date(computedExpireTime);
    const formattedExpiry = expiryDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isExpired) {
      return {
        url: null,
        blob: null,
        record: rawRecord,
        isExpired: true,
        daysRemaining: 0,
        formattedExpiry,
      };
    }

    // Reuse or create active blob URL
    let url = activeObjectUrls.get(sessionId) || null;
    if (!url && rawRecord.blob) {
      url = URL.createObjectURL(rawRecord.blob);
      activeObjectUrls.set(sessionId, url);
    }

    return {
      url,
      blob: rawRecord.blob,
      record: rawRecord,
      isExpired: false,
      daysRemaining,
      formattedExpiry,
    };
  } catch (err) {
    console.warn('[VideoStorage] Error reading session video:', err);
    return null;
  }
}

/**
 * Returns metadata for all stored videos
 */
export async function getAllStoredVideosMeta(
  configuredRetentionDays: number = 15
): Promise<StoredVideoMeta[]> {
  try {
    const db = await openDB();
    const records = await new Promise<StoredVideoRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const now = Date.now();
    return records.map((r) => {
      const retention = configuredRetentionDays || r.retentionDays || 15;
      const recTime = new Date(r.recordedAt).getTime();
      const expTime = recTime + retention * 24 * 60 * 60 * 1000;
      const isExpired = now > expTime;
      const daysRemaining = isExpired ? 0 : Math.ceil((expTime - now) / (24 * 60 * 60 * 1000));

      return {
        sessionId: r.sessionId,
        recordedAt: r.recordedAt,
        expiresAt: new Date(expTime).toISOString(),
        retentionDays: retention,
        sizeBytes: r.sizeBytes,
        mimeType: r.mimeType,
        candidateName: r.candidateName,
        assessmentTitle: r.assessmentTitle,
        isExpired,
        daysRemaining,
      };
    });
  } catch (err) {
    console.warn('[VideoStorage] Error getting stored videos meta:', err);
    return [];
  }
}

/**
 * Retrieves aggregate storage stats for UI display
 */
export async function getStorageUsageStats(
  configuredRetentionDays: number = 15
): Promise<StorageUsageStats> {
  const metaList = await getAllStoredVideosMeta(configuredRetentionDays);
  let totalBytes = 0;
  let activeCount = 0;
  let expiredCount = 0;

  for (const m of metaList) {
    totalBytes += m.sizeBytes || 0;
    if (m.isExpired) {
      expiredCount++;
    } else {
      activeCount++;
    }
  }

  const megabytes = (totalBytes / (1024 * 1024)).toFixed(2);

  return {
    count: metaList.length,
    totalBytes,
    totalMegabytes: megabytes,
    activeCount,
    expiredCount,
    configuredRetentionDays,
  };
}

let lastAutoPurgeTime = 0;
const PURGE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes minimum between automatic checks

/**
 * Purges all videos that have exceeded the retention period
 */
export async function purgeExpiredVideos(
  retentionDays: number = 15,
  force: boolean = false
): Promise<{ purgedCount: number; freedBytes: number }> {
  const now = Date.now();
  if (!force && now - lastAutoPurgeTime < PURGE_COOLDOWN_MS) {
    return { purgedCount: 0, freedBytes: 0 };
  }
  lastAutoPurgeTime = now;

  try {
    const db = await openDB();
    const records = await new Promise<StoredVideoRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const expiredIds: string[] = [];
    let freedBytes = 0;

    for (const r of records) {
      const recTime = new Date(r.recordedAt).getTime();
      const expTime = recTime + retentionDays * 24 * 60 * 60 * 1000;
      if (now > expTime) {
        expiredIds.push(r.sessionId);
        freedBytes += r.sizeBytes || 0;
      }
    }

    if (expiredIds.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of expiredIds) {
          store.delete(id);
          if (activeObjectUrls.has(id)) {
            try {
              URL.revokeObjectURL(activeObjectUrls.get(id)!);
            } catch {
              // ignore
            }
            activeObjectUrls.delete(id);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    if (expiredIds.length > 0 || force) {
      console.log(
        `[VideoStorage] Purged ${expiredIds.length} expired videos, freed ${(
          freedBytes /
          (1024 * 1024)
        ).toFixed(2)} MB.`
      );
    }
    return { purgedCount: expiredIds.length, freedBytes };
  } catch (err) {
    console.warn('[VideoStorage] Error purging expired videos:', err);
    return { purgedCount: 0, freedBytes: 0 };
  }
}

/**
 * Deletes a specific session video by sessionId
 */
export async function deleteSessionVideo(sessionId: string): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(sessionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    if (activeObjectUrls.has(sessionId)) {
      try {
        URL.revokeObjectURL(activeObjectUrls.get(sessionId)!);
      } catch {
        // ignore
      }
      activeObjectUrls.delete(sessionId);
    }
    console.log(`[VideoStorage] Deleted video for session ${sessionId}`);
    return true;
  } catch (err) {
    console.warn('[VideoStorage] Error deleting video:', err);
    return false;
  }
}

/**
 * Deletes all stored session videos
 */
export async function deleteAllStoredVideos(): Promise<number> {
  try {
    const db = await openDB();
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      store.clear();
      countReq.onsuccess = () => resolve(countReq.result || 0);
      countReq.onerror = () => reject(countReq.error);
    });

    for (const [id, url] of activeObjectUrls.entries()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    activeObjectUrls.clear();
    return count;
  } catch (err) {
    console.warn('[VideoStorage] Error clearing all videos:', err);
    return 0;
  }
}

/**
 * Updates retention policy on all existing records
 */
export async function updateAllRetentionPolicies(newRetentionDays: number): Promise<number> {
  try {
    const db = await openDB();
    const records = await new Promise<StoredVideoRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    let updatedCount = 0;
    if (records.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const r of records) {
          const recTime = new Date(r.recordedAt).getTime();
          const newExpDate = new Date(recTime + newRetentionDays * 24 * 60 * 60 * 1000);
          r.retentionDays = newRetentionDays;
          r.expiresAt = newExpDate.toISOString();
          store.put(r);
          updatedCount++;
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    return updatedCount;
  } catch (err) {
    console.warn('[VideoStorage] Error updating retention policies:', err);
    return 0;
  }
}

/**
 * Calculates retention status for any candidate session based on its timestamp and retention days
 */
export function calculateRetentionStatus(
  recordedAtOrCompletedAt?: string,
  retentionDays: number = 15
): {
  isExpired: boolean;
  daysRemaining: number;
  expiresAtDate: Date;
  formattedExpiry: string;
} {
  const days = Math.max(1, retentionDays || 15);
  const baseTime = recordedAtOrCompletedAt ? new Date(recordedAtOrCompletedAt).getTime() : Date.now();
  const validBaseTime = isNaN(baseTime) ? Date.now() : baseTime;
  const expTime = validBaseTime + days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const isExpired = now > expTime;
  const diffMs = expTime - now;
  const daysRemaining = isExpired ? 0 : Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const expiresAtDate = new Date(expTime);
  const formattedExpiry = expiresAtDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    isExpired,
    daysRemaining,
    expiresAtDate,
    formattedExpiry,
  };
}
