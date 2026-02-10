import { useEffect } from 'react';
import {
  useProgress,
  usePlaybackState,
  useActiveTrack,
  State,
} from 'react-native-track-player';
import usePlayerStore from '../store/playerStore';

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
  const addToRecentlyPlayed = usePlayerStore((s) => s.addToRecentlyPlayed);
  const queue = usePlayerStore((s) => s.queue);

  // Sync position, duration, and buffered to store
  useEffect(() => {
    setProgress(position, duration, buffered);
  }, [position, duration, buffered, setProgress]);

  // Sync mapped playback state to store
  useEffect(() => {
    const mapped = mapPlaybackState(playbackState);
    setPlaybackState(mapped);
  }, [playbackState, setPlaybackState]);

  // Sync active track to store and record recently played
  useEffect(() => {
    if (activeTrack?.id) {
      const matchedTrack = queue.find((t) => t.id === activeTrack.id);
      if (matchedTrack) {
        setCurrentTrack(matchedTrack);
        addToRecentlyPlayed(matchedTrack);
      }
    }
  }, [activeTrack?.id, queue, setCurrentTrack, addToRecentlyPlayed]);

  return {
    position,
    duration,
    buffered,
    playbackState: mapPlaybackState(playbackState),
    activeTrack,
  };
}
