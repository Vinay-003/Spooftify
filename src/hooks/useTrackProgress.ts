import { useEffect } from 'react';
import {
  useProgress,
  usePlaybackState,
  useActiveTrack,
  State,
} from 'react-native-track-player';
import usePlayerStore from '../store/playerStore';
import { prefetchManager } from '../services/prefetchManager';

type PlaybackStatus = 'playing' | 'paused' | 'loading' | 'idle' | 'stopped';

function mapPlaybackState(state: State | undefined): PlaybackStatus {
  switch (state) {
    case State.Playing:
      return 'playing';
    case State.Paused:
    case State.Ready:
      return 'paused';
    case State.Buffering:
    case State.Loading:
      return 'loading';
    case State.Stopped:
      return 'stopped';
    case State.None:
    default:
      return 'idle';
  }
}

export function useTrackProgress() {
  const { position, duration, buffered } = useProgress(200);
  const { state: playbackState } = usePlaybackState();
  const activeTrack = useActiveTrack();

  const setProgress = usePlayerStore((s) => s.setProgress);
  const setPlaybackState = usePlayerStore((s) => s.setPlaybackState);
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack);
  const syncCurrentIndex = usePlayerStore((s) => s.syncCurrentIndex);
  const addToRecentlyPlayed = usePlayerStore((s) => s.addToRecentlyPlayed);
  const queue = usePlayerStore((s) => s.queue);

  // Sync position, duration, and buffered to store
  useEffect(() => {
    setProgress(position, duration, buffered);
  }, [position, duration, buffered, setProgress]);

  // Sync mapped playback state to store.
  // IMPORTANT: Don't overwrite a manual 'loading' state with 'idle'.
  // When we set 'loading' (e.g. while resolving a YT stream URL),
  // TrackPlayer reports State.None after reset() — we must ignore that.
  useEffect(() => {
    const mapped = mapPlaybackState(playbackState);
    const currentStoreState = usePlayerStore.getState().playbackState;

    if (
      currentStoreState === 'loading' &&
      (mapped === 'idle' || mapped === 'stopped')
    ) {
      return;
    }

    setPlaybackState(mapped);
  }, [playbackState, setPlaybackState]);

  // Sync active track to store, update currentIndex, record recently played,
  // and trigger prefetch. This is the AUTHORITATIVE source for currentIndex —
  // it syncs Zustand's index from TrackPlayer's actual active track, preventing
  // desync caused by PlaybackService's remove/add/skip cycles.
  //
  // NOTE: Placeholder URL resolution is handled exclusively by the
  // PlaybackService's PlaybackActiveTrackChanged listener to avoid
  // double-resolution races.
  useEffect(() => {
    if (activeTrack?.id) {
      // Sync currentIndex from TrackPlayer's active track
      syncCurrentIndex(activeTrack.id);

      const matchedTrack = queue.find((t) => t.id === activeTrack.id);
      if (matchedTrack) {
        setCurrentTrack(matchedTrack);
        addToRecentlyPlayed(matchedTrack);

        // Trigger prefetch for upcoming tracks
        if (matchedTrack.isYT) {
          const videoIds = queue
            .filter((t) => t.isYT)
            .map((t) => t.id);
          const currentYtIdx = videoIds.indexOf(matchedTrack.id);
          if (currentYtIdx >= 0) {
            prefetchManager.prefetchAhead(videoIds, currentYtIdx);
          }
        }
      }
    }
  }, [activeTrack?.id, queue, setCurrentTrack, syncCurrentIndex, addToRecentlyPlayed]);

  return {
    position,
    duration,
    buffered,
    playbackState: mapPlaybackState(playbackState),
    activeTrack,
  };
}
