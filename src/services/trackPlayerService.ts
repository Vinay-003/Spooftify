import TrackPlayer, {
  Capability,
  Event,
  State,
  RepeatMode as TPRepeatMode,
  AppKilledPlaybackBehavior,
  TrackType,
} from 'react-native-track-player';

import { Track } from '../types';
import { prefetchManager } from './prefetchManager';
import { streamFileCacheManager } from './streamFileCacheManager';
import type { AudioStreamInfo } from './youtube';

const START_TRACK_RESOLVE_TIMEOUT_MS = 45000;
const ACTIVE_TRACK_RESOLVE_TIMEOUT_MS = 30000;
const RE_RESOLVE_TIMEOUT_MS = 25000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`[TrackPlayer] Timed out: ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

export async function setupPlayer(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
    });
  } catch {
    // Player is already initialized — nothing to do.
    return;
  }
}

// ── Helper: build a TrackPlayer-compatible track object ───────────────────────

function buildPlayerTrack(
  track: Track,
  streamInfo?: AudioStreamInfo | null,
) {
  const ua = streamInfo?.headers?.['User-Agent'];
  return {
    id: track.id,
    url: streamInfo?.url ?? (track.isYT ? 'https://placeholder.invalid/pending' : track.url),
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    duration: track.duration,
    ...(streamInfo?.isHLS ? { type: TrackType.HLS } : {}),
    ...(streamInfo?.headers ? { headers: streamInfo.headers } : {}),
    ...(ua ? { userAgent: ua } : {}),
    ...(streamInfo?.clientUsed ? { clientUsed: streamInfo.clientUsed } : {}),
  };
}

// ── Queue management ─────────────────────────────────────────────────────────

/**
 * Add tracks to the player and start playback.
 *
 * For YT tracks:
 *   1. Resolve the starting track's stream URL immediately
 *   2. Add it to the player and start playing
 *   3. Prefetch the next 2 tracks in the background
 *   4. Add remaining tracks with placeholder URLs (resolved on play)
 */
export async function addTracksToPlayer(
  tracks: Track[],
  startIndex: number,
): Promise<void> {
  await TrackPlayer.reset();

  const startTrack = tracks[startIndex];
  if (!startTrack) {
    throw new Error('[addTracksToPlayer] Invalid start index');
  }

  // Resolve the starting track's stream info (URL + headers)
  let startStreamInfo: AudioStreamInfo | null = null;
  try {
    if (startTrack.isYT) {
      startStreamInfo = await withTimeout(
        prefetchManager.ensureResolved(startTrack.id),
        START_TRACK_RESOLVE_TIMEOUT_MS,
        `resolving start track ${startTrack.id}`,
      );
      startStreamInfo = await streamFileCacheManager.resolveForPlayback(
        startTrack.id,
        startStreamInfo,
      );
    }
  } catch (err) {
    console.warn('[addTracksToPlayer] Failed to resolve starting track:', err);
    for (let i = startIndex + 1; i < tracks.length; i++) {
      try {
        if (tracks[i].isYT) {
          await withTimeout(
            prefetchManager.ensureResolved(tracks[i].id),
            ACTIVE_TRACK_RESOLVE_TIMEOUT_MS,
            `resolving fallback track ${tracks[i].id}`,
          );
        }
        return addTracksToPlayer(tracks, i);
      } catch {
        continue;
      }
    }
    throw new Error('[addTracksToPlayer] No playable tracks available');
  }

  // Map all tracks — the starting track gets the real URL + headers,
  // other YT tracks get a placeholder that will be resolved on skip
  const mapped = tracks.map((t, i) =>
    buildPlayerTrack(t, i === startIndex ? startStreamInfo : null),
  );

  await TrackPlayer.add(mapped);
  await TrackPlayer.skip(startIndex);
  await TrackPlayer.play();

  // Prefetch next tracks in background
  const videoIds = tracks.filter((t) => t.isYT).map((t) => t.id);
  const ytStartIdx = videoIds.indexOf(startTrack.id);
  if (ytStartIdx >= 0) {
    prefetchManager.prefetchAhead(videoIds, ytStartIdx);
  }
}

/**
 * Resolve and update a track's URL in the player before it plays.
 * Called when the player is about to play a YT track that hasn't been resolved yet.
 */
export async function resolveAndUpdateTrack(
  track: Track,
  index: number,
  allTracks: Track[],
): Promise<void> {
  if (!track.isYT) return;

  let streamInfo: AudioStreamInfo;
  try {
    streamInfo = await withTimeout(
      prefetchManager.ensureResolved(track.id),
      ACTIVE_TRACK_RESOLVE_TIMEOUT_MS,
      `resolving queue track ${track.id}`,
    );
    streamInfo = await streamFileCacheManager.resolveForPlayback(track.id, streamInfo);
  } catch (err) {
    console.warn('[TrackPlayer] Failed to resolve YT track, auto-skipping:', err);
    // Auto-skip to next track
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // Already at last track — nothing to skip to
    }
    return;
  }

  // Remove the placeholder track and re-add with the real URL + headers
  try {
    await TrackPlayer.remove(index);
    await TrackPlayer.add(buildPlayerTrack(track, streamInfo), index);
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
  } catch (e) {
    console.warn('[TrackPlayer] Failed to update track URL:', e);
  }

  // Continue prefetching ahead
  const videoIds = allTracks.filter((t) => t.isYT).map((t) => t.id);
  const currentYtIdx = videoIds.indexOf(track.id);
  if (currentYtIdx >= 0) {
    prefetchManager.prefetchAhead(videoIds, currentYtIdx);
  }
}

// ── Transport controls ───────────────────────────────────────────────────────

export async function playTrack(): Promise<void> {
  await TrackPlayer.play();
}

export async function pauseTrack(): Promise<void> {
  await TrackPlayer.pause();
}

export async function seekTo(position: number): Promise<void> {
  await TrackPlayer.seekTo(position);
}

export async function skipToNext(): Promise<void> {
  try {
    await TrackPlayer.skipToNext();
  } catch {
    // Already at the last track — ignore.
  }
}

export async function skipToPrevious(): Promise<void> {
  try {
    await TrackPlayer.skipToPrevious();
  } catch {
    // Already at the first track — ignore.
  }
}

// ── Repeat mode ──────────────────────────────────────────────────────────────

const repeatModeMap: Record<'off' | 'track' | 'queue', TPRepeatMode> = {
  off: TPRepeatMode.Off,
  track: TPRepeatMode.Track,
  queue: TPRepeatMode.Queue,
};

export async function setRepeatMode(
  mode: 'off' | 'track' | 'queue',
): Promise<void> {
  await TrackPlayer.setRepeatMode(repeatModeMap[mode]);
}

// ── State / progress ─────────────────────────────────────────────────────────

export async function getProgress() {
  return TrackPlayer.getProgress();
}

export async function getState() {
  return TrackPlayer.getPlaybackState();
}

// ── Playback service (registered via TrackPlayer.registerPlaybackService) ────

/**
 * Helper: build a TrackPlayer-compatible object from raw track metadata + stream info.
 * Used inside PlaybackService where we don't have an app-level Track object.
 */
function buildPlayerTrackFromRaw(
  meta: Record<string, any>,
  streamInfo: AudioStreamInfo,
) {
  const ua = streamInfo.headers?.['User-Agent'];
  return {
    id: meta.id,
    url: streamInfo.url,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    artwork: meta.artwork,
    duration: meta.duration,
    ...(streamInfo.isHLS ? { type: TrackType.HLS } : {}),
    ...(streamInfo.headers ? { headers: streamInfo.headers } : {}),
    ...(ua ? { userAgent: ua } : {}),
    ...(streamInfo.clientUsed ? { clientUsed: streamInfo.clientUsed } : {}),
  };
}

function isTransientNetworkErrorCode(code?: string): boolean {
  const normalized = (code ?? '').toLowerCase();
  return (
    normalized.includes('network-connection-failed') ||
    normalized.includes('network-error') ||
    normalized.includes('timed-out') ||
    normalized.includes('bad-http-status')
  );
}

function serviceLog(scope: string, message: string) {
  console.log(`[PlaybackService:${scope}] ${message}`);
}

function serviceWarn(scope: string, message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.warn(`[PlaybackService:${scope}] ${message}`, extra);
    return;
  }
  console.warn(`[PlaybackService:${scope}] ${message}`);
}

export async function PlaybackService(): Promise<void> {
  // ── Guards to prevent re-entrant resolution ────────────────────────────
  let isResolvingActive = false;
  let isHandlingError = false;
  let queueSwapTargetId: string | null = null;
  const transientRetries = new Map<string, number>();
  const errorCooldownByTrack = new Map<string, number>();
  const localRecoveryAttempted = new Set<string>();

  const hotSwapActiveTrack = async (
    targetId: string,
    nextTrack: any,
  ): Promise<boolean> => {
    const currentActive = await TrackPlayer.getActiveTrack();
    if (!currentActive || currentActive.id !== targetId) return false;

    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    if (currentIndex == null) return false;

    queueSwapTargetId = targetId;
    try {
      await TrackPlayer.remove(currentIndex);
      await TrackPlayer.add(nextTrack as any, currentIndex);
      await TrackPlayer.skip(currentIndex);
      await TrackPlayer.play();
      return true;
    } finally {
      queueSwapTargetId = null;
    }
  };

  const resolveActivePlaceholderIfNeeded = async (): Promise<void> => {
    if (isResolvingActive) return;
    isResolvingActive = true;
    let videoId = '';
    let activeClientUsed: string | undefined;
    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (!activeTrack) return;

      const url = (activeTrack.url as string) ?? '';
      if (!url.includes('placeholder.invalid')) return;

      videoId = (activeTrack.id as string) ?? '';
      if (!videoId) return;
      activeClientUsed = (activeTrack as any)?.clientUsed as string | undefined;

      if (prefetchManager.isBlacklisted(videoId)) {
        serviceWarn('Resolver', `Skipping blacklisted track ${videoId}`);
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
        return;
      }

      serviceLog('Resolver', `Resolving placeholder for ${videoId}...`);
      const streamInfo = await withTimeout(
        prefetchManager.ensureResolved(videoId),
        ACTIVE_TRACK_RESOLVE_TIMEOUT_MS,
        `resolving active track ${videoId}`,
      );
      const playableStreamInfo = await streamFileCacheManager.resolveForPlayback(
        videoId,
        streamInfo,
      );

      const currentActive = await TrackPlayer.getActiveTrack();
      if (!currentActive || currentActive.id !== videoId) {
        return;
      }

      const trackIndex = await TrackPlayer.getActiveTrackIndex();
      if (trackIndex == null) return;

      serviceLog(
        'Resolver',
        `Resolved ${videoId}: ${playableStreamInfo.isHLS ? 'HLS' : 'Direct'}, ${Math.round(playableStreamInfo.bitrate / 1000)}kbps, client=${playableStreamInfo.clientUsed ?? 'unknown'}`,
      );

      const newTrack = buildPlayerTrackFromRaw(currentActive as Record<string, any>, playableStreamInfo);
      await hotSwapActiveTrack(videoId, newTrack);
    } catch (err) {
      serviceWarn('Resolver', 'Failed to resolve track on active change', err);
      try {
        serviceLog('Resolver', `Attempting placeholder re-resolve for ${videoId}...`);
        const reResolved = await withTimeout(
          prefetchManager.reResolve(videoId, activeClientUsed),
          RE_RESOLVE_TIMEOUT_MS,
          `re-resolving placeholder track ${videoId}`,
        );
        const playableStreamInfo = await streamFileCacheManager.resolveForPlayback(
          videoId,
          reResolved,
          {
            downloadIfMissing: true,
            downloadTimeoutMs: 12000,
          },
        );

        const currentActive = await TrackPlayer.getActiveTrack();
        if (!currentActive || currentActive.id !== videoId) {
          return;
        }
        const trackIndex = await TrackPlayer.getActiveTrackIndex();
        if (trackIndex == null) return;

        const newTrack = buildPlayerTrackFromRaw(
          currentActive as Record<string, any>,
          playableStreamInfo,
        );
        await hotSwapActiveTrack(videoId, newTrack);

        serviceLog(
          'Resolver',
          `Re-resolved placeholder ${videoId} with client ${playableStreamInfo.clientUsed ?? 'unknown'}`,
        );
      } catch (retryErr) {
        serviceWarn('Resolver', `Placeholder re-resolve failed for ${videoId}, skipping`, retryErr);
        try { await TrackPlayer.skipToNext(); } catch { /* no more tracks */ }
      }
    } finally {
      isResolvingActive = false;
    }
  };

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    await TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    await TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.paused) {
      await TrackPlayer.pause();
    } else if (!event.permanent) {
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  });

  // ── PlaybackError: retry with a different YT client, then auto-skip ────
  TrackPlayer.addEventListener(Event.PlaybackError, async (event) => {
    serviceWarn('Error', `PlaybackError: ${JSON.stringify(event)}`);

    // Prevent overlapping error handlers
    if (isHandlingError) return;
    isHandlingError = true;

    try {
      const trackIndex = await TrackPlayer.getActiveTrackIndex();
      if (trackIndex == null) return;

      const activeTrack = await TrackPlayer.getActiveTrack();
      if (!activeTrack) return;

      const videoId = activeTrack.id as string;
      if (!videoId) return;

      // If user already switched tracks/queue, ignore stale error events.
      const stillActiveBeforeRetry = await TrackPlayer.getActiveTrack();
      if (!stillActiveBeforeRetry || stillActiveBeforeRetry.id !== videoId) {
        return;
      }

      const now = Date.now();
      const lastErrorAt = errorCooldownByTrack.get(videoId) ?? 0;
      if (now - lastErrorAt < 1500) return;
      errorCooldownByTrack.set(videoId, now);

      // Only retry for YT tracks (they have placeholder or resolved YT URLs)
      const url = (activeTrack.url as string) ?? '';
      const isPlaceholder = url.includes('placeholder.invalid');
      const isYTTrack =
        isPlaceholder ||
        url.includes('googlevideo.com') ||
        url.includes('youtube.com') ||
        url.includes('googleusercontent.com') ||
        prefetchManager.hasCached(videoId);

      if (!isYTTrack) return;

      // Placeholder failures are expected while the ActiveTrackChanged handler
      // resolves real URLs. Let that path handle it to avoid double-skip loops.
      if (isPlaceholder) {
        void resolveActivePlaceholderIfNeeded();
        return;
      }

      // If the active-track resolver is currently mutating the queue,
      // avoid a concurrent hot-swap from PlaybackError.
      if (isResolvingActive) return;

      // Check if already blacklisted
      if (prefetchManager.isBlacklisted(videoId)) {
        serviceWarn('Error', `Track ${videoId} is blacklisted, skipping`);
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
        return;
      }

      // Try one local-file fallback before client re-resolution.
      if (!streamFileCacheManager.isLocalUri(url) && !localRecoveryAttempted.has(videoId)) {
        localRecoveryAttempted.add(videoId);
        const cachedStream = prefetchManager.getCached(videoId);
        if (cachedStream) {
          const localStream = await streamFileCacheManager.resolveForPlayback(
            videoId,
            cachedStream,
            {
              downloadIfMissing: true,
              downloadTimeoutMs: 12000,
            },
          );

          if (streamFileCacheManager.isLocalUri(localStream.url)) {
            const currentActive = await TrackPlayer.getActiveTrack();
            if (currentActive?.id === videoId) {
              const currentIndex = await TrackPlayer.getActiveTrackIndex();
              if (currentIndex != null) {
                const localTrack = buildPlayerTrackFromRaw(
                  currentActive as Record<string, any>,
                  localStream,
                );
                await hotSwapActiveTrack(videoId, localTrack);
                serviceLog(
                  'ErrorRecovery',
                  `Switched ${videoId} to local cached audio`,
                );
                return;
              }
            }
          }
        }
      }

      // Local cached file failed — evict and continue with re-resolution.
      if (streamFileCacheManager.isLocalUri(url)) {
        await streamFileCacheManager.evict(videoId);
      }

      if (isTransientNetworkErrorCode(event.code)) {
        const retries = transientRetries.get(videoId) ?? 0;
        if (retries < 1) {
          transientRetries.set(videoId, retries + 1);
          serviceWarn(
            'Error',
            `Transient network error for ${videoId}; retrying current stream once`,
          );
          try {
            await TrackPlayer.play();
          } catch {
            // fall through to regular re-resolve path on next error
          }
          return;
        }
      }

      serviceLog('ErrorRecovery', `Attempting re-resolve for ${videoId}...`);

      try {
        // Evict the bad cached URL and re-resolve with a different client
        const newStreamInfo = await withTimeout(
          prefetchManager.reResolve(videoId, (activeTrack as any)?.clientUsed as string | undefined),
          RE_RESOLVE_TIMEOUT_MS,
          `re-resolving errored track ${videoId}`,
        );
        const playableStreamInfo = await streamFileCacheManager.resolveForPlayback(
          videoId,
          newStreamInfo,
          {
            downloadIfMissing: true,
            downloadTimeoutMs: 12000,
          },
        );

        // Verify we're still on the same active track (user might have skipped/changed queue)
        const currentActive = await TrackPlayer.getActiveTrack();
        if (!currentActive || currentActive.id !== videoId) return;
        const currentIndex = await TrackPlayer.getActiveTrackIndex();
        if (currentIndex == null) return;

        // Hot-swap: remove broken track, re-add with new URL, play
        const newTrack = buildPlayerTrackFromRaw(
          currentActive as Record<string, any>,
          playableStreamInfo,
        );
        await hotSwapActiveTrack(videoId, newTrack);
        transientRetries.delete(videoId);

        serviceLog(
          'ErrorRecovery',
          `Re-resolved ${videoId} with client ${playableStreamInfo.clientUsed ?? 'unknown'}`,
        );
      } catch (retryErr) {
        serviceWarn(
          'ErrorRecovery',
          `All clients failed for ${videoId}, skipping`,
          retryErr,
        );
        // All clients exhausted — skip to next track
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
      }
    } finally {
      isHandlingError = false;
    }
  });

  // ── Auto-resolve placeholder URLs when a new track becomes active ──────
  TrackPlayer.addEventListener(
    Event.PlaybackActiveTrackChanged,
    async (event) => {
      const track = event.track;
      if (!track) {
        serviceLog('ActiveTrack', 'ActiveTrackChanged: no track (queue ended)');
        return;
      }

      const url = track.url as string;
      const videoId = track.id as string;

      if (queueSwapTargetId && videoId && videoId !== queueSwapTargetId) {
        serviceLog(
          'ActiveTrack',
          `Ignoring transient ActiveTrackChanged to ${videoId} during swap for ${queueSwapTargetId}`,
        );
        return;
      }

      if (videoId) {
        transientRetries.delete(videoId);
        errorCooldownByTrack.delete(videoId);
        localRecoveryAttempted.delete(videoId);
      }

      // Log every active track change for diagnostics
      const urlPreview = url?.substring(0, 80) ?? '(none)';
      serviceLog(
        'ActiveTrack',
        `ActiveTrackChanged: id=${videoId}, index=${event.index}, url=${urlPreview}...`,
      );

      // Only resolve placeholder URLs — already-resolved tracks play normally
      if (!url || !url.includes('placeholder.invalid')) return;

      if (!videoId) return;

      // Skip blacklisted tracks immediately
      if (prefetchManager.isBlacklisted(videoId)) {
        serviceWarn('ActiveTrack', `Skipping blacklisted track ${videoId}`);
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
        return;
      }

      void resolveActivePlaceholderIfNeeded();
    },
  );

  // ── Log playback state changes for diagnostics ─────────────────────────
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    serviceLog('State', `PlaybackState: ${event.state}`);
  });
}
