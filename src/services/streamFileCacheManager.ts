import * as FileSystem from 'expo-file-system/legacy';
import type { AudioStreamInfo } from './youtube';

interface LocalCacheEntry {
  fileUri: string;
  sourceUrl: string;
  expiresAt: number;
}

function cacheLog(message: string) {
  console.log(`[StreamCache] ${message}`);
}

function cacheWarn(message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.warn(`[StreamCache] ${message}`, extra);
    return;
  }
  console.warn(`[StreamCache] ${message}`);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`[StreamCache] Timed out: ${label}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

class StreamFileCacheManager {
  private readonly cacheDir = FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}spooftify-stream-cache/`
    : null;

  private readonly entries = new Map<string, LocalCacheEntry>();
  private readonly pendingDownloads = new Map<string, Promise<AudioStreamInfo | null>>();
  private ensuredDir = false;

  isLocalUri(uri?: string): boolean {
    return typeof uri === 'string' && uri.startsWith('file://');
  }

  prime(videoId: string, streamInfo: AudioStreamInfo): void {
    if (!this.shouldCache(streamInfo)) return;

    void this.ensureCached(videoId, streamInfo, 12000)
      .catch((err) => {
        cacheWarn(`Prime failed for ${videoId}`, err);
      });
  }

  async resolveForPlayback(
    videoId: string,
    streamInfo: AudioStreamInfo,
    options?: {
      downloadIfMissing?: boolean;
      downloadTimeoutMs?: number;
    },
  ): Promise<AudioStreamInfo> {
    if (!this.shouldCache(streamInfo)) {
      return streamInfo;
    }

    const cached = await this.getCached(videoId, streamInfo);
    if (cached) {
      return cached;
    }

    if (!options?.downloadIfMissing) {
      return streamInfo;
    }

    const downloaded = await this.ensureCached(
      videoId,
      streamInfo,
      options.downloadTimeoutMs ?? 15000,
    );

    return downloaded ?? streamInfo;
  }

  async evict(videoId: string): Promise<void> {
    const entry = this.entries.get(videoId);
    this.entries.delete(videoId);

    if (!entry?.fileUri) return;

    try {
      await FileSystem.deleteAsync(entry.fileUri, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
  }

  private async ensureCacheDir(): Promise<boolean> {
    if (!this.cacheDir) return false;
    if (this.ensuredDir) return true;

    try {
      await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
      this.ensuredDir = true;
      return true;
    } catch (err) {
      cacheWarn('Failed to create cache directory', err);
      return false;
    }
  }

  private shouldCache(streamInfo: AudioStreamInfo): boolean {
    if (!streamInfo?.url) return false;
    if (this.isLocalUri(streamInfo.url)) return false;
    if (streamInfo.isHLS) return false;

    const url = streamInfo.url.toLowerCase();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
    if (url.includes('.m3u8')) return false;

    const mime = (streamInfo.mimeType ?? '').toLowerCase();
    if (mime.includes('mpegurl')) return false;

    return true;
  }

  private toPlayableLocalInfo(
    base: AudioStreamInfo,
    fileUri: string,
  ): AudioStreamInfo {
    return {
      ...base,
      url: fileUri,
      headers: undefined,
      isHLS: false,
      clientUsed: `${base.clientUsed ?? 'UNKNOWN'}:LOCAL`,
    };
  }

  private getTargetFileUri(videoId: string): string | null {
    if (!this.cacheDir) return null;
    const safeId = videoId.replace(/[^A-Za-z0-9_-]/g, '_');
    return `${this.cacheDir}${safeId}.cache`;
  }

  private async getCached(
    videoId: string,
    streamInfo: AudioStreamInfo,
  ): Promise<AudioStreamInfo | null> {
    const entry = this.entries.get(videoId);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt || entry.sourceUrl !== streamInfo.url) {
      await this.evict(videoId);
      return null;
    }

    try {
      const info = await FileSystem.getInfoAsync(entry.fileUri);
      if (!info.exists) {
        this.entries.delete(videoId);
        return null;
      }

      return this.toPlayableLocalInfo(streamInfo, entry.fileUri);
    } catch {
      this.entries.delete(videoId);
      return null;
    }
  }

  private async ensureCached(
    videoId: string,
    streamInfo: AudioStreamInfo,
    timeoutMs: number,
  ): Promise<AudioStreamInfo | null> {
    const cached = await this.getCached(videoId, streamInfo);
    if (cached) return cached;

    const pending = this.pendingDownloads.get(videoId);
    if (pending) return pending;

    const promise = this.downloadAndStore(videoId, streamInfo, timeoutMs);
    this.pendingDownloads.set(videoId, promise);

    try {
      return await promise;
    } finally {
      this.pendingDownloads.delete(videoId);
    }
  }

  private async downloadAndStore(
    videoId: string,
    streamInfo: AudioStreamInfo,
    timeoutMs: number,
  ): Promise<AudioStreamInfo | null> {
    if (!(await this.ensureCacheDir())) {
      return null;
    }

    const targetFileUri = this.getTargetFileUri(videoId);
    if (!targetFileUri) return null;

    try {
      await FileSystem.deleteAsync(targetFileUri, { idempotent: true });

      const result = await withTimeout(
        FileSystem.downloadAsync(streamInfo.url, targetFileUri, {
          headers: streamInfo.headers,
        }),
        timeoutMs,
        `downloading ${videoId}`,
      );

      if (result.status < 200 || result.status >= 300) {
        cacheWarn(`Download status ${result.status} for ${videoId}`);
        return null;
      }

      this.entries.set(videoId, {
        fileUri: result.uri,
        sourceUrl: streamInfo.url,
        expiresAt: streamInfo.expiresAt || Date.now() + 60 * 60 * 1000,
      });

      cacheLog(`Cached ${videoId} locally`);
      return this.toPlayableLocalInfo(streamInfo, result.uri);
    } catch (err) {
      cacheWarn(`Failed to cache ${videoId}`, err);
      return null;
    }
  }
}

export const streamFileCacheManager = new StreamFileCacheManager();
