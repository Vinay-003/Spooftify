import { create } from 'zustand';
import { Track, RepeatMode } from '../types';

const RECENTLY_PLAYED_KEY = 'recentlyPlayed';
const MAX_RECENTLY_PLAYED = 20;

// Lazy-init MMKV so it doesn't crash when native module isn't loaded yet
let _storage: any = null;
function getStorage() {
  if (!_storage) {
    try {
      const { createMMKV } = require('react-native-mmkv');
      _storage = createMMKV({ id: 'player-storage' });
    } catch {
      // MMKV unavailable (e.g. Expo Go) – fall back to in-memory only
      _storage = {
        set: () => {},
        getString: () => undefined,
      };
    }
  }
  return _storage;
}

/** Fisher-Yates shuffle (in-place, returns new array). */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface PlayerState {
  // State
  currentTrack: Track | null;
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  playbackState: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';
  position: number;
  duration: number;
  buffered: number;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  recentlyPlayed: Track[];
  isPlayerReady: boolean;

  // Actions
  setCurrentTrack: (track: Track) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  setPlaybackState: (state: PlayerState['playbackState']) => void;
  setProgress: (position: number, duration: number, buffered: number) => void;
  toggleRepeatMode: () => void;
  toggleShuffle: () => void;
  skipToNext: () => void;
  skipToPrevious: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  addToRecentlyPlayed: (track: Track) => void;
  loadRecentlyPlayed: () => void;
  clearQueue: () => void;
}

const usePlayerStore = create<PlayerState>()((set, get) => ({
  // Initial state
  currentTrack: null,
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  playbackState: 'idle',
  position: 0,
  duration: 0,
  buffered: 0,
  repeatMode: 'off',
  isShuffled: false,
  recentlyPlayed: [],
  isPlayerReady: false,

  setCurrentTrack: (track: Track) => {
    set({ currentTrack: track });
  },

  setQueue: (tracks: Track[], startIndex: number = 0) => {
    set({
      queue: [...tracks],
      originalQueue: [...tracks],
      currentIndex: startIndex,
      currentTrack: tracks[startIndex] ?? null,
    });
  },

  setPlaybackState: (state: PlayerState['playbackState']) => {
    set({ playbackState: state });
  },

  setProgress: (position: number, duration: number, buffered: number) => {
    set({ position, duration, buffered });
  },

  toggleRepeatMode: () => {
    const { repeatMode } = get();
    const nextMode: RepeatMode =
      repeatMode === 'off'
        ? 'queue'
        : repeatMode === 'queue'
          ? 'track'
          : 'off';
    set({ repeatMode: nextMode });
  },

  toggleShuffle: () => {
    const { isShuffled, queue, originalQueue, currentTrack, currentIndex } =
      get();

    if (isShuffled) {
      // Unshuffle: restore original queue, find current track's position in it
      const restoredIndex = currentTrack
        ? originalQueue.findIndex((t) => t.id === currentTrack.id)
        : 0;
      set({
        isShuffled: false,
        queue: [...originalQueue],
        currentIndex: restoredIndex !== -1 ? restoredIndex : 0,
      });
    } else {
      // Shuffle: keep current track at index 0, shuffle the rest
      const remaining = queue.filter((_, i) => i !== currentIndex);
      const shuffled = shuffleArray(remaining);
      const newQueue = currentTrack
        ? [currentTrack, ...shuffled]
        : shuffleArray([...queue]);

      set({
        isShuffled: true,
        queue: newQueue,
        currentIndex: 0,
      });
    }
  },

  skipToNext: () => {
    const { queue, currentIndex, repeatMode } = get();
    if (queue.length === 0) return;

    let nextIndex: number;

    if (repeatMode === 'track') {
      // Repeat single track: stay on current index, reset position
      nextIndex = currentIndex;
    } else if (currentIndex < queue.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (repeatMode === 'queue') {
      // Wrap around to the beginning
      nextIndex = 0;
    } else {
      // End of queue, no repeat
      set({ playbackState: 'stopped', position: 0 });
      return;
    }

    set({
      currentIndex: nextIndex,
      currentTrack: queue[nextIndex],
      position: 0,
    });
  },

  skipToPrevious: () => {
    const { queue, currentIndex, position, repeatMode } = get();
    if (queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (position > 3) {
      set({ position: 0 });
      return;
    }

    let prevIndex: number;

    if (repeatMode === 'track') {
      prevIndex = currentIndex;
    } else if (currentIndex > 0) {
      prevIndex = currentIndex - 1;
    } else if (repeatMode === 'queue') {
      // Wrap around to the end
      prevIndex = queue.length - 1;
    } else {
      // At the start of queue, no repeat - restart current track
      set({ position: 0 });
      return;
    }

    set({
      currentIndex: prevIndex,
      currentTrack: queue[prevIndex],
      position: 0,
    });
  },

  addToQueue: (track: Track) => {
    set((state) => ({
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track],
    }));
  },

  playNext: (track: Track) => {
    set((state) => {
      const insertIndex = state.currentIndex + 1;
      const newQueue = [...state.queue];
      newQueue.splice(insertIndex, 0, track);

      const newOriginalQueue = [...state.originalQueue];
      newOriginalQueue.splice(insertIndex, 0, track);

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
      };
    });
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      if (index < 0 || index >= state.queue.length) return state;

      const newQueue = state.queue.filter((_, i) => i !== index);
      const removedTrack = state.queue[index];

      // Also remove from originalQueue by track id
      const newOriginalQueue = state.originalQueue.filter(
        (t) => t.id !== removedTrack.id,
      );

      let newIndex = state.currentIndex;
      if (index < state.currentIndex) {
        // Removed track was before current: shift index back
        newIndex = state.currentIndex - 1;
      } else if (index === state.currentIndex) {
        // Removed the currently playing track
        if (newQueue.length === 0) {
          return {
            queue: [],
            originalQueue: [],
            currentIndex: -1,
            currentTrack: null,
            playbackState: 'idle' as const,
          };
        }
        // Clamp index to new queue bounds
        newIndex = Math.min(state.currentIndex, newQueue.length - 1);
        return {
          queue: newQueue,
          originalQueue: newOriginalQueue,
          currentIndex: newIndex,
          currentTrack: newQueue[newIndex],
        };
      }

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        currentIndex: newIndex,
      };
    });
  },

  addToRecentlyPlayed: (track: Track) => {
    set((state) => {
      // Remove duplicate if already present
      const filtered = state.recentlyPlayed.filter((t) => t.id !== track.id);
      // Prepend and cap at max
      const updated = [track, ...filtered].slice(0, MAX_RECENTLY_PLAYED);

      // Persist to MMKV
      try {
        getStorage().set(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
      } catch {
        // Silently fail on storage errors
      }

      return { recentlyPlayed: updated };
    });
  },

  loadRecentlyPlayed: () => {
    try {
      const raw = getStorage().getString(RECENTLY_PLAYED_KEY);
      if (raw) {
        const parsed: Track[] = JSON.parse(raw);
        set({ recentlyPlayed: parsed });
      }
    } catch {
      // Silently fail on parse/storage errors
    }
  },

  clearQueue: () => {
    set({
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      currentTrack: null,
      playbackState: 'idle',
      position: 0,
      duration: 0,
      buffered: 0,
    });
  },
}));

export default usePlayerStore;
