/**
 * Prefetch Manager
 *
 * Resolves stream URLs ahead of time so the next track starts instantly.
 *
 * Strategy:
 *   - Maintains a cache of resolved stream URLs keyed by videoId
 *   - When a track starts playing, resolves URLs for the next 2 tracks
 *   - Cache entries expire after 5 hours (stream URLs last ~6 hours)
 *   - If resolution fails, retries once before giving up
 *   - Tracks which client produced each URL so we can exclude failing clients
 *   - Blacklists permanently unplayable videoIds to avoid infinite retries
 *
 * Usage:
 *   await prefetchManager.ensureResolved(videoId)  // get URL for immediate play
 *   prefetchManager.prefetchAhead(queue, currentIndex)  // background prefetch
 *   await prefetchManager.reResolve(videoId)  // evict + try different client
 */

import { resolveStreamUrl, type AudioStreamInfo } from './youtube';

interface CacheEntry {
  streamInfo: AudioStreamInfo;
  resolvedAt: number;
}

// Cache TTL: 5 hours (stream URLs expire after ~6h, we refresh early)
const CACHE_TTL = 5 * 60 * 60 * 1000;

// How many tracks ahead to prefetch
const PREFETCH_AHEAD = 2;

// Max times we'll try re-resolving a single video before blacklisting
const MAX_RETRIES_PER_VIDEO = 3;

class PrefetchManager {
  private cache = new Map<string, CacheEntry>();
  private pendingResolves = new Map<string, Promise<AudioStreamInfo>>();

  /**
   * Tracks which clients have failed at the ExoPlayer level for each videoId.
   * This is different from the client failing to return data — this is when
   * the returned URL actually gets a 403/bad-status during playback.
   */
  private failedClients = new Map<string, Set<string>>();

  /**
   * VideoIds that have been permanently blacklisted after exhausting all
   * client options. These will be auto-skipped.
   */
  private blacklist = new Set<string>();

  /**
   * How many times we've attempted re-resolution for each videoId.
   */
  private retryCount = new Map<string, number>();

  /**
   * Get a resolved stream URL for a videoId.
   * Returns from cache if fresh, otherwise resolves it.
   */
  async ensureResolved(videoId: string): Promise<AudioStreamInfo> {
    // Blacklisted videos throw immediately
    if (this.blacklist.has(videoId)) {
      throw new Error(`[Prefetch] Video ${videoId} is blacklisted as unplayable`);
    }

    // Check cache first
    const cached = this.cache.get(videoId);
    if (cached && Date.now() - cached.resolvedAt < CACHE_TTL) {
      return cached.streamInfo;
    }

    // Check if there's already a pending resolve for this ID
    const pending = this.pendingResolves.get(videoId);
    if (pending) return pending;

    // Resolve with retry, excluding any clients that have failed playback
    const excludeClients = this.failedClients.get(videoId);
    const excludeArray = excludeClients ? Array.from(excludeClients) : undefined;

    const promise = this.resolveWithRetry(videoId, 1, excludeArray);
    this.pendingResolves.set(videoId, promise);

    try {
      const streamInfo = await promise;
      this.cache.set(videoId, {
        streamInfo,
        resolvedAt: Date.now(),
      });
      return streamInfo;
    } finally {
      this.pendingResolves.delete(videoId);
    }
  }

  /**
   * Called when a playback error occurs (e.g. android-io-bad-http-status).
   * Evicts the cached URL, records which client failed, and tries to
   * re-resolve with a different client.
   *
   * Returns a new AudioStreamInfo if successful, throws if all options exhausted.
   */
  async reResolve(videoId: string): Promise<AudioStreamInfo> {
    // Record which client produced the bad URL
    const cached = this.cache.get(videoId);
    if (cached?.streamInfo.clientUsed) {
      let failed = this.failedClients.get(videoId);
      if (!failed) {
        failed = new Set();
        this.failedClients.set(videoId, failed);
      }
      failed.add(cached.streamInfo.clientUsed.toUpperCase());
      console.log(
        `[Prefetch] Marked client ${cached.streamInfo.clientUsed} as failed for ${videoId}. Failed clients: ${Array.from(failed).join(', ')}`,
      );
    }

    // Evict the bad cache entry
    this.cache.delete(videoId);

    // Track retry count
    const count = (this.retryCount.get(videoId) ?? 0) + 1;
    this.retryCount.set(videoId, count);

    if (count > MAX_RETRIES_PER_VIDEO) {
      this.blacklist.add(videoId);
      console.warn(
        `[Prefetch] Video ${videoId} blacklisted after ${count} failed attempts`,
      );
      throw new Error(`Video ${videoId} is unplayable after ${count} attempts`);
    }

    // Cancel any pending resolve (it might be using the same bad client)
    this.pendingResolves.delete(videoId);

    // Re-resolve excluding all failed clients
    const excludeClients = this.failedClients.get(videoId);
    const excludeArray = excludeClients ? Array.from(excludeClients) : undefined;

    console.log(
      `[Prefetch] Re-resolving ${videoId} (attempt ${count}/${MAX_RETRIES_PER_VIDEO}), excluding: ${excludeArray?.join(', ') ?? 'none'}`,
    );

    const promise = this.resolveWithRetry(videoId, 1, excludeArray);
    this.pendingResolves.set(videoId, promise);

    try {
      const streamInfo = await promise;
      this.cache.set(videoId, {
        streamInfo,
        resolvedAt: Date.now(),
      });
      return streamInfo;
    } catch (err) {
      // All clients exhausted
      this.blacklist.add(videoId);
      console.warn(
        `[Prefetch] Video ${videoId} blacklisted — no working client found`,
      );
      throw err;
    } finally {
      this.pendingResolves.delete(videoId);
    }
  }

  /**
   * Check if a videoId has been blacklisted as unplayable.
   */
  isBlacklisted(videoId: string): boolean {
    return this.blacklist.has(videoId);
  }

  /**
   * Prefetch stream URLs for the next N tracks in the queue.
   * Runs in the background — does not block.
   */
  prefetchAhead(
    queueVideoIds: string[],
    currentIndex: number,
  ): void {
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex >= queueVideoIds.length) break;

      const videoId = queueVideoIds[nextIndex];
      if (!videoId) continue;

      // Skip blacklisted
      if (this.blacklist.has(videoId)) continue;

      // Skip if already cached and fresh
      const cached = this.cache.get(videoId);
      if (cached && Date.now() - cached.resolvedAt < CACHE_TTL) continue;

      // Skip if already resolving
      if (this.pendingResolves.has(videoId)) continue;

      // Fire and forget — don't await
      this.ensureResolved(videoId).catch((err) => {
        console.warn(`[Prefetch] Failed to prefetch ${videoId}:`, err);
      });
    }
  }

  /**
   * Check if a videoId has a cached (fresh) stream URL.
   */
  hasCached(videoId: string): boolean {
    const cached = this.cache.get(videoId);
    return !!cached && Date.now() - cached.resolvedAt < CACHE_TTL;
  }

  /**
   * Get cached URL without resolving (returns null if not cached).
   */
  getCached(videoId: string): AudioStreamInfo | null {
    const cached = this.cache.get(videoId);
    if (cached && Date.now() - cached.resolvedAt < CACHE_TTL) {
      return cached.streamInfo;
    }
    return null;
  }

  /**
   * Clear all cached entries.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Evict stale entries (older than TTL).
   */
  evictStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.resolvedAt >= CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async resolveWithRetry(
    videoId: string,
    retries = 1,
    excludeClients?: string[],
  ): Promise<AudioStreamInfo> {
    try {
      return await resolveStreamUrl(videoId, excludeClients);
    } catch (err) {
      if (retries > 0) {
        // Wait a beat before retrying
        await new Promise((r) => setTimeout(r, 500));
        return this.resolveWithRetry(videoId, retries - 1, excludeClients);
      }
      throw err;
    }
  }
}

// Singleton instance
export const prefetchManager = new PrefetchManager();
