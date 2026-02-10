import { create } from 'zustand';
import { Track, RepeatMode } from '../types';

const RECENTLY_PLAYED_KEY = 'recentlyPlayed';
const LIKED_SONGS_KEY = 'likedSongs';
const MAX_RECENTLY_PLAYED = 30;

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
  userQueueCount: number; // Number of user-added tracks right after currentIndex
  playbackState: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';
  position: number;
  duration: number;
  buffered: number;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  recentlyPlayed: Track[];
  likedSongs: Track[];
  isPlayerReady: boolean;

  // Actions
  setCurrentTrack: (track: Track) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  setPlaybackState: (state: PlayerState['playbackState']) => void;
  setProgress: (position: number, duration: number, buffered: number) => void;
  syncCurrentIndex: (trackId: string) => void;
  toggleRepeatMode: () => void;
  toggleShuffle: () => void;
  skipToNext: () => void;
  skipToPrevious: () => void;
  addToQueue: (track: Track) => void;
  addToUpNext: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  addToRecentlyPlayed: (track: Track) => void;
  loadRecentlyPlayed: () => void;
  toggleLike: (track: Track) => void;
  isLiked: (trackId: string) => boolean;
  loadLikedSongs: () => void;
  clearQueue: () => void;
}

const usePlayerStore = create<PlayerState>()((set, get) => ({
  // Initial state
  currentTrack: null,
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  userQueueCount: 0,
  playbackState: 'idle',
  position: 0,
  duration: 0,
  buffered: 0,
  repeatMode: 'off',
  isShuffled: false,
  recentlyPlayed: [],
  likedSongs: [],
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
      userQueueCount: 0,
    });
  },

  setPlaybackState: (state: PlayerState['playbackState']) => {
    set({ playbackState: state });
  },

  setProgress: (position: number, duration: number, buffered: number) => {
    set({ position, duration, buffered });
  },

  /**
   * Sync currentIndex from TrackPlayer's active track. Called by
   * useTrackProgress when the active track changes. This is the single
   * source of truth for which track is currently playing, preventing
   * desync between Zustand and TrackPlayer's internal queue index.
   */
  syncCurrentIndex: (trackId: string) => {
    const { queue, currentIndex } = get();
    const newIndex = queue.findIndex((t) => t.id === trackId);
    if (newIndex !== -1 && newIndex !== currentIndex) {
      // If we moved forward past user-queue tracks, decrement userQueueCount
      const { userQueueCount } = get();
      let newUserQueueCount = userQueueCount;
      if (newIndex > currentIndex && userQueueCount > 0) {
        // How many user-queue tracks did we skip over?
        const userQueueStart = currentIndex + 1;
        const userQueueEnd = userQueueStart + userQueueCount;
        // The new track was within the user queue range
        if (newIndex >= userQueueStart && newIndex < userQueueEnd) {
          newUserQueueCount = userQueueCount - (newIndex - currentIndex);
          if (newUserQueueCount < 0) newUserQueueCount = 0;
        }
      }

      set({
        currentIndex: newIndex,
        currentTrack: queue[newIndex],
        userQueueCount: newUserQueueCount,
      });
    }
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
    const { queue, currentIndex, repeatMode, userQueueCount } = get();
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
      // If we consumed a user-queue track, decrement the count
      userQueueCount: userQueueCount > 0 && repeatMode !== 'track'
        ? userQueueCount - 1
        : userQueueCount,
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

  // Add to user queue (after current + existing user queue, before recommendations)
  addToQueue: (track: Track) => {
    set((state) => {
      const insertIndex = state.currentIndex + 1 + state.userQueueCount;
      const newQueue = [...state.queue];
      newQueue.splice(insertIndex, 0, track);

      const newOriginalQueue = [...state.originalQueue];
      newOriginalQueue.splice(insertIndex, 0, track);

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        userQueueCount: state.userQueueCount + 1,
      };
    });
  },

  // Add to Up Next (recommendations) — appended after user queue
  addToUpNext: (track: Track) => {
    set((state) => ({
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track],
    }));
  },

  // Play Next: insert right after current track (at start of user queue)
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
        userQueueCount: state.userQueueCount + 1,
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

      // Check if the removed track was in the user queue range
      const userQueueStart = state.currentIndex + 1;
      const userQueueEnd = userQueueStart + state.userQueueCount;
      const wasUserQueueTrack = index >= userQueueStart && index < userQueueEnd;
      const newUserQueueCount = wasUserQueueTrack
        ? state.userQueueCount - 1
        : state.userQueueCount;

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
            userQueueCount: 0,
          };
        }
        // Clamp index to new queue bounds
        newIndex = Math.min(state.currentIndex, newQueue.length - 1);
        return {
          queue: newQueue,
          originalQueue: newOriginalQueue,
          currentIndex: newIndex,
          currentTrack: newQueue[newIndex],
          userQueueCount: newUserQueueCount,
        };
      }

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        currentIndex: newIndex,
        userQueueCount: newUserQueueCount,
      };
    });
  },

  // Reorder tracks within the queue (absolute indices)
  reorderQueue: (fromIndex: number, toIndex: number) => {
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= state.queue.length ||
        toIndex < 0 ||
        toIndex >= state.queue.length
      ) {
        return state;
      }

      const newQueue = [...state.queue];
      const [moved] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, moved);

      // Adjust currentIndex if needed
      let newCurrentIndex = state.currentIndex;
      if (fromIndex === state.currentIndex) {
        newCurrentIndex = toIndex;
      } else {
        if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
          newCurrentIndex = state.currentIndex - 1;
        } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
          newCurrentIndex = state.currentIndex + 1;
        }
      }

      return {
        queue: newQueue,
        currentIndex: newCurrentIndex,
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

  toggleLike: (track: Track) => {
    set((state) => {
      const isAlreadyLiked = state.likedSongs.some((t) => t.id === track.id);
      let updated: Track[];
      if (isAlreadyLiked) {
        updated = state.likedSongs.filter((t) => t.id !== track.id);
      } else {
        updated = [track, ...state.likedSongs];
      }
      try {
        getStorage().set(LIKED_SONGS_KEY, JSON.stringify(updated));
      } catch {
        // Silently fail
      }
      return { likedSongs: updated };
    });
  },

  isLiked: (trackId: string) => {
    return get().likedSongs.some((t) => t.id === trackId);
  },

  loadLikedSongs: () => {
    try {
      const raw = getStorage().getString(LIKED_SONGS_KEY);
      if (raw) {
        const parsed: Track[] = JSON.parse(raw);
        set({ likedSongs: parsed });
      }
    } catch {
      // Silently fail
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
      userQueueCount: 0,
    });
  },
}));

export default usePlayerStore;
