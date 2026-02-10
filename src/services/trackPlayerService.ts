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
import type { AudioStreamInfo } from './youtube';

// ── Setup ────────────────────────────────────────────────────────────────────

export async function setupPlayer(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.ContinuePlayback,
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
  if (!startTrack) return;

  // Resolve the starting track's stream info (URL + headers)
  let startStreamInfo: AudioStreamInfo | null = null;
  try {
    if (startTrack.isYT) {
      startStreamInfo = await prefetchManager.ensureResolved(startTrack.id);
    }
  } catch (err) {
    console.warn('[addTracksToPlayer] Failed to resolve starting track:', err);
    for (let i = startIndex + 1; i < tracks.length; i++) {
      try {
        if (tracks[i].isYT) {
          await prefetchManager.ensureResolved(tracks[i].id);
        }
        return addTracksToPlayer(tracks, i);
      } catch {
        continue;
      }
    }
    return;
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
    streamInfo = await prefetchManager.ensureResolved(track.id);
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
  };
}

export async function PlaybackService(): Promise<void> {
  // ── Guards to prevent re-entrant resolution ────────────────────────────
  let isResolvingActive = false;
  let isHandlingError = false;

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

  // ── PlaybackError: retry with a different YT client, then auto-skip ────
  TrackPlayer.addEventListener(Event.PlaybackError, async (event) => {
    console.warn('[PlaybackService] PlaybackError:', JSON.stringify(event));

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

      // Only retry for YT tracks (they have placeholder or resolved YT URLs)
      const url = (activeTrack.url as string) ?? '';
      const isYTTrack =
        url.includes('placeholder.invalid') ||
        url.includes('googlevideo.com') ||
        url.includes('youtube.com') ||
        url.includes('googleusercontent.com') ||
        prefetchManager.hasCached(videoId);

      if (!isYTTrack) return;

      // Check if already blacklisted
      if (prefetchManager.isBlacklisted(videoId)) {
        console.warn(`[PlaybackService] Track ${videoId} is blacklisted, skipping`);
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
        return;
      }

      console.log(`[PlaybackService] Attempting re-resolve for ${videoId}...`);

      try {
        // Evict the bad cached URL and re-resolve with a different client
        const newStreamInfo = await prefetchManager.reResolve(videoId);

        // Verify we're still on the same track (user might have skipped)
        const currentIndex = await TrackPlayer.getActiveTrackIndex();
        if (currentIndex !== trackIndex) return;

        // Hot-swap: remove broken track, re-add with new URL, play
        const newTrack = buildPlayerTrackFromRaw(activeTrack, newStreamInfo);
        await TrackPlayer.remove(trackIndex);
        await TrackPlayer.add(newTrack, trackIndex);
        await TrackPlayer.skip(trackIndex);
        await TrackPlayer.play();

        console.log(
          `[PlaybackService] Re-resolved ${videoId} with client ${newStreamInfo.clientUsed ?? 'unknown'}`,
        );
      } catch (retryErr) {
        console.warn(
          `[PlaybackService] All clients failed for ${videoId}, skipping:`,
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
        console.log('[PlaybackService] ActiveTrackChanged: no track (queue ended)');
        return;
      }

      const url = track.url as string;
      const videoId = track.id as string;

      // Log every active track change for diagnostics
      const urlPreview = url?.substring(0, 80) ?? '(none)';
      console.log(
        `[PlaybackService] ActiveTrackChanged: id=${videoId}, index=${event.index}, url=${urlPreview}...`,
      );

      // Only resolve placeholder URLs — already-resolved tracks play normally
      if (!url || !url.includes('placeholder.invalid')) return;

      if (!videoId) return;

      // Skip blacklisted tracks immediately
      if (prefetchManager.isBlacklisted(videoId)) {
        console.warn(`[PlaybackService] Skipping blacklisted track ${videoId}`);
        try { await TrackPlayer.skipToNext(); } catch { /* last track */ }
        return;
      }

      // Prevent re-entrant resolution (the remove/add/skip below fires
      // another PlaybackActiveTrackChanged which would loop)
      if (isResolvingActive) return;
      isResolvingActive = true;

      try {
        console.log(`[PlaybackService] Resolving placeholder for ${videoId}...`);
        const streamInfo = await prefetchManager.ensureResolved(videoId);
        const trackIndex = event.index ?? (await TrackPlayer.getActiveTrackIndex());
        if (trackIndex == null) return;

        console.log(
          `[PlaybackService] Resolved ${videoId}: ${streamInfo.isHLS ? 'HLS' : 'Direct'}, ${Math.round(streamInfo.bitrate / 1000)}kbps, client=${streamInfo.clientUsed ?? 'unknown'}`,
        );

        const newTrack = buildPlayerTrackFromRaw(track, streamInfo);
        await TrackPlayer.remove(trackIndex);
        await TrackPlayer.add(newTrack, trackIndex);
        await TrackPlayer.skip(trackIndex);
        await TrackPlayer.play();
      } catch (err) {
        console.warn(
          '[PlaybackService] Failed to resolve track on active change:',
          err,
        );
        try { await TrackPlayer.skipToNext(); } catch { /* no more tracks */ }
      } finally {
        isResolvingActive = false;
      }
    },
  );

  // ── Log playback state changes for diagnostics ─────────────────────────
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    console.log(`[PlaybackService] PlaybackState: ${event.state}`);
  });
}
