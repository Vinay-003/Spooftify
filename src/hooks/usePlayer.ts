import { useCallback } from 'react';
import TrackPlayer from 'react-native-track-player';
import usePlayerStore from '../store/playerStore';
import {
  addTracksToPlayer,
  playTrack as playTrackService,
  pauseTrack as pauseTrackService,
  seekTo as seekToService,
  skipToNext as skipToNextService,
  skipToPrevious as skipToPreviousService,
  setRepeatMode,
} from '../services/trackPlayerService';
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
  const storePlayNext = usePlayerStore((s) => s.playNext);
  const storeRemoveFromQueue = usePlayerStore((s) => s.removeFromQueue);

  const playTrack = useCallback(
    async (tracks: Track[], startIndex: number) => {
      setQueue(tracks, startIndex);
      await addTracksToPlayer(tracks, startIndex);
    },
    [setQueue],
  );

  const play = useCallback(async () => {
    await playTrackService();
  }, []);

  const pause = useCallback(async () => {
    await pauseTrackService();
  }, []);

  const togglePlayPause = useCallback(async () => {
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
    await skipToNextService();
    storeSkipToNext();
  }, [storeSkipToNext]);

  const skipToPrevious = useCallback(async () => {
    if (position > 3) {
      await seekToService(0);
    } else {
      await skipToPreviousService();
      storeSkipToPrevious();
    }
  }, [position, storeSkipToPrevious]);

  const toggleRepeatMode = useCallback(async () => {
    storeToggleRepeatMode();
    // Read the updated repeat mode from the store after toggling
    const nextMode = usePlayerStore.getState().repeatMode;
    await setRepeatMode(nextMode);
  }, [storeToggleRepeatMode]);

  const toggleShuffle = useCallback(async () => {
    // Save current position before rebuilding queue
    const progress = await TrackPlayer.getProgress();
    const savedPosition = progress.position;

    storeToggleShuffle();
    // Rebuild the TrackPlayer queue to match the new store queue
    const state = usePlayerStore.getState();
    const newQueue = state.queue;
    const newIndex = state.currentIndex;

    // Use setQueue + skip instead of reset to avoid playback flicker
    await TrackPlayer.setQueue(
      newQueue.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork,
        duration: t.duration,
      })),
    );
    if (newIndex >= 0) {
      await TrackPlayer.skip(newIndex);
      await TrackPlayer.seekTo(savedPosition);
      await TrackPlayer.play();
    }
  }, [storeToggleShuffle]);

  const addToQueue = useCallback(
    async (track: Track) => {
      storeAddToQueue(track);
      await TrackPlayer.add({
        id: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        duration: track.duration,
      });
    },
    [storeAddToQueue],
  );

  const playNext = useCallback(
    async (track: Track) => {
      storePlayNext(track);
      const insertIndex = usePlayerStore.getState().currentIndex;
      // The store inserts at currentIndex + 1, but we already called storePlayNext
      // so we need to add at the position right after the current track in TrackPlayer
      await TrackPlayer.add(
        {
          id: track.id,
          url: track.url,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artwork,
          duration: track.duration,
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

  return {
    playTrack,
    play,
    pause,
    togglePlayPause,
    seekTo,
    skipToNext,
    skipToPrevious,
    toggleRepeatMode,
    toggleShuffle,
    addToQueue,
    playNext,
    removeFromQueue,
  };
}
