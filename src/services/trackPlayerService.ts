import TrackPlayer, {
  Capability,
  Event,
  State,
  RepeatMode as TPRepeatMode,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';

import { Track } from '../types';

// ── Setup ────────────────────────────────────────────────────────────────────

export async function setupPlayer(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      waitForBuffer: true,
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
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
    });
  } catch {
    // Player is already initialized — nothing to do.
    return;
  }
}

// ── Queue management ─────────────────────────────────────────────────────────

export async function addTracksToPlayer(
  tracks: Track[],
  startIndex: number,
): Promise<void> {
  await TrackPlayer.reset();

  const mapped = tracks.map((t) => ({
    id: t.id,
    url: t.url,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.artwork,
    duration: t.duration,
  }));

  await TrackPlayer.add(mapped);
  await TrackPlayer.skip(startIndex);
  await TrackPlayer.play();
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

export async function PlaybackService(): Promise<void> {
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
}
