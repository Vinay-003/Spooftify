import { useCallback } from 'react';
import TrackPlayer, { TrackType } from 'react-native-track-player';
import usePlayerStore from '../store/playerStore';
import {
  addTracksToPlayer,
  playTrack as playTrackService,
  pauseTrack as pauseTrackService,
  seekTo as seekToService,
  setRepeatMode,
} from '../services/trackPlayerService';
import { prefetchManager } from '../services/prefetchManager';
import { getUpNext, ytResultToTrack } from '../services/youtube';
import type { Track } from '../types';

export function usePlayer() {
  const setQueue = usePlayerStore((s) => s.setQueue);
  const playbackState = usePlayerStore((s) => s.playbackState);
  const position = usePlayerStore((s) => s.position);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const storeSkipToNext = usePlayerStore((s) => s.skipToNext);
  const storeSkipToPrevious = usePlayerStore((s) => s.skipToPrevious);
  const storeToggleRepeatMode = usePlayerStore((s) => s.toggleRepeatMode);
  const storeToggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const storeAddToQueue = usePlayerStore((s) => s.addToQueue);
  const storeAddToUpNext = usePlayerStore((s) => s.addToUpNext);
  const storePlayNext = usePlayerStore((s) => s.playNext);
  const storeRemoveFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const storeReorderQueue = usePlayerStore((s) => s.reorderQueue);
  const storeClearQueue = usePlayerStore((s) => s.clearQueue);

  const setPlaybackState = usePlayerStore((s) => s.setPlaybackState);

  const playTrack = useCallback(
    async (tracks: Track[], startIndex: number) => {
      setQueue(tracks, startIndex);
      // Show loading spinner immediately while stream URL resolves
      const startTrack = tracks[startIndex];
      if (startTrack?.isYT) {
        setPlaybackState('loading');
      }
      try {
        await addTracksToPlayer(tracks, startIndex);
      } catch (err) {
        console.warn('[usePlayer] playTrack failed:', err);
        setPlaybackState('idle');
      }
    },
    [setQueue, setPlaybackState],
  );

  const play = useCallback(async () => {
    await playTrackService();
  }, []);

  const pause = useCallback(async () => {
    await pauseTrackService();
  }, []);

  const togglePlayPause = useCallback(async () => {
    // Don't toggle while stream URL is still resolving
    if (playbackState === 'loading') return;

    if (playbackState === 'playing') {
      await pauseTrackService();
    } else {
      await playTrackService();
    }
  }, [playbackState]);

  const seekTo = useCallback(async (pos: number) => {
    await seekToService(pos);
  }, []);

  const skipToNext = useCallback(async () => {
    // Simply tell TrackPlayer to advance. The PlaybackActiveTrackChanged
    // handler in PlaybackService resolves any placeholder URLs automatically.
    // Zustand's currentIndex is synced via useTrackProgress when activeTrack changes.
    storeSkipToNext();
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // Already at last track
    }
  }, [storeSkipToNext]);

  const skipToPrevious = useCallback(async () => {
    if (position > 3) {
      await seekToService(0);
    } else {
      storeSkipToPrevious();
      try {
        await TrackPlayer.skipToPrevious();
      } catch {
        // Already at first track
      }
    }
  }, [position, storeSkipToPrevious]);

  const toggleRepeatMode = useCallback(async () => {
    storeToggleRepeatMode();
    const nextMode = usePlayerStore.getState().repeatMode;
    await setRepeatMode(nextMode);
  }, [storeToggleRepeatMode]);

  const toggleShuffle = useCallback(async () => {
    const progress = await TrackPlayer.getProgress();
    const savedPosition = progress.position;

    storeToggleShuffle();
    const state = usePlayerStore.getState();
    const newQueue = state.queue;
    const newIndex = state.currentIndex;

    // Rebuild TrackPlayer queue — resolve URLs for nearby YT tracks
    const mappedQueue = await Promise.all(
      newQueue.map(async (t, i) => {
        let url = t.url;
        let trackHeaders: Record<string, string> | undefined;
        let trackUA: string | undefined;
        let trackIsHLS = false;
        if (t.isYT) {
          // For the current track and next 2, try to get resolved URLs
          if (
            i === newIndex ||
            i === newIndex + 1 ||
            i === newIndex + 2
          ) {
            const cached = prefetchManager.getCached(t.id);
            if (cached) {
              url = cached.url;
              trackHeaders = cached.headers;
              trackUA = cached.headers?.['User-Agent'];
              trackIsHLS = !!cached.isHLS;
            } else if (i === newIndex) {
              // Must resolve current track
              try {
                const info = await prefetchManager.ensureResolved(t.id);
                url = info.url;
                trackHeaders = info.headers;
                trackUA = info.headers?.['User-Agent'];
                trackIsHLS = !!info.isHLS;
              } catch {
                url = 'https://placeholder.invalid/pending';
              }
            } else {
              url = 'https://placeholder.invalid/pending';
            }
          } else {
            url = 'https://placeholder.invalid/pending';
          }
        }
        return {
          id: t.id,
          url,
          title: t.title,
          artist: t.artist,
          album: t.album,
          artwork: t.artwork,
          duration: t.duration,
          ...(trackIsHLS ? { type: TrackType.HLS } : {}),
          ...(trackHeaders ? { headers: trackHeaders } : {}),
          ...(trackUA ? { userAgent: trackUA } : {}),
        };
      }),
    );

    await TrackPlayer.setQueue(mappedQueue);
    if (newIndex >= 0) {
      await TrackPlayer.skip(newIndex);
      await TrackPlayer.seekTo(savedPosition);
      await TrackPlayer.play();
    }

    // Prefetch ahead
    const videoIds = newQueue.filter((t) => t.isYT).map((t) => t.id);
    const currentYtIdx = videoIds.indexOf(newQueue[newIndex]?.id ?? '');
    if (currentYtIdx >= 0) {
      prefetchManager.prefetchAhead(videoIds, currentYtIdx);
    }
  }, [storeToggleShuffle]);

  const addToQueue = useCallback(
    async (track: Track) => {
      storeAddToQueue(track);

      let url = track.url;
      let trackHeaders: Record<string, string> | undefined;
      let trackUA: string | undefined;
      let trackIsHLS = false;
      if (track.isYT) {
        const cached = prefetchManager.getCached(track.id);
        if (cached) {
          url = cached.url;
          trackHeaders = cached.headers;
          trackUA = cached.headers?.['User-Agent'];
          trackIsHLS = !!cached.isHLS;
        } else {
          url = 'https://placeholder.invalid/pending';
          // Start resolving in background
          prefetchManager.ensureResolved(track.id).catch(() => {});
        }
      }

      // Insert at the correct position in TrackPlayer (end of user queue).
      // Store's addToQueue already inserted at currentIndex + 1 + userQueueCount
      // (before incrementing userQueueCount), so we read the updated state
      // where userQueueCount is already incremented — the insert position is
      // currentIndex + userQueueCount (which equals old currentIndex + 1 + old userQueueCount).
      const state = usePlayerStore.getState();
      const insertIndex = state.currentIndex + state.userQueueCount;

      await TrackPlayer.add(
        {
          id: track.id,
          url,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artwork,
          duration: track.duration,
          ...(trackIsHLS ? { type: TrackType.HLS } : {}),
          ...(trackHeaders ? { headers: trackHeaders } : {}),
          ...(trackUA ? { userAgent: trackUA } : {}),
        },
        insertIndex,
      );
    },
    [storeAddToQueue],
  );

  const addToUpNext = useCallback(
    async (track: Track) => {
      storeAddToUpNext(track);

      let url = track.url;
      let trackHeaders: Record<string, string> | undefined;
      let trackUA: string | undefined;
      let trackIsHLS = false;
      if (track.isYT) {
        const cached = prefetchManager.getCached(track.id);
        if (cached) {
          url = cached.url;
          trackHeaders = cached.headers;
          trackUA = cached.headers?.['User-Agent'];
          trackIsHLS = !!cached.isHLS;
        } else {
          url = 'https://placeholder.invalid/pending';
          prefetchManager.ensureResolved(track.id).catch(() => {});
        }
      }

      await TrackPlayer.add({
        id: track.id,
        url,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        duration: track.duration,
        ...(trackIsHLS ? { type: TrackType.HLS } : {}),
        ...(trackHeaders ? { headers: trackHeaders } : {}),
        ...(trackUA ? { userAgent: trackUA } : {}),
      });
    },
    [storeAddToUpNext],
  );

  const playNext = useCallback(
    async (track: Track) => {
      storePlayNext(track);
      const insertIndex = usePlayerStore.getState().currentIndex + 1;

      let url = track.url;
      let trackHeaders: Record<string, string> | undefined;
      let trackUA: string | undefined;
      let trackIsHLS = false;
      if (track.isYT) {
        try {
          const info = await prefetchManager.ensureResolved(track.id);
          url = info.url;
          trackHeaders = info.headers;
          trackUA = info.headers?.['User-Agent'];
          trackIsHLS = !!info.isHLS;
        } catch {
          url = 'https://placeholder.invalid/pending';
        }
      }

      await TrackPlayer.add(
        {
          id: track.id,
          url,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artwork,
          duration: track.duration,
          ...(trackIsHLS ? { type: TrackType.HLS } : {}),
          ...(trackHeaders ? { headers: trackHeaders } : {}),
          ...(trackUA ? { userAgent: trackUA } : {}),
        },
        insertIndex,
      );
    },
    [storePlayNext],
  );

  const removeFromQueue = useCallback(
    async (index: number) => {
      storeRemoveFromQueue(index);
      await TrackPlayer.remove(index);
    },
    [storeRemoveFromQueue],
  );

  const reorderQueue = useCallback(
    async (fromIndex: number, toIndex: number) => {
      storeReorderQueue(fromIndex, toIndex);
      try {
        await TrackPlayer.move(fromIndex, toIndex);
      } catch (err) {
        console.warn('[usePlayer] reorderQueue TrackPlayer.move failed:', err);
      }
    },
    [storeReorderQueue],
  );

  const dismissPlayer = useCallback(async () => {
    await TrackPlayer.reset();
    storeClearQueue();
  }, [storeClearQueue]);

  /**
   * Play a single track and fill the "Up Next" queue with YouTube Music
   * recommendations for that track. Used when tapping a search result or
   * a single item from a home carousel.
   */
  const playTrackWithRecommendations = useCallback(
    async (track: Track) => {
      // Start playing just the tapped track immediately
      await playTrack([track], 0);

      // Fetch recommendations in background — don't block playback
      if (track.isYT) {
        try {
          const recs = await getUpNext(track.id);
          if (recs.length > 0) {
            const recTracks = recs.map(ytResultToTrack);
            // Append each recommended track to Up Next (not user queue)
            for (const recTrack of recTracks) {
              await addToUpNext(recTrack);
            }

            // Trigger prefetch for the next 2 tracks after recommendations are added
            const state = usePlayerStore.getState();
            const videoIds = state.queue
              .filter((t) => t.isYT)
              .map((t) => t.id);
            const currentYtIdx = videoIds.indexOf(track.id);
            if (currentYtIdx >= 0) {
              prefetchManager.prefetchAhead(videoIds, currentYtIdx);
            }
          }
        } catch (err) {
          console.warn('[usePlayer] Failed to fetch recommendations:', err);
        }
      }
    },
    [playTrack, addToUpNext],
  );

  return {
    playTrack,
    playTrackWithRecommendations,
    play,
    pause,
    togglePlayPause,
    seekTo,
    skipToNext,
    skipToPrevious,
    toggleRepeatMode,
    toggleShuffle,
    addToQueue,
    addToUpNext,
    playNext,
    removeFromQueue,
    reorderQueue,
    dismissPlayer,
  };
}
