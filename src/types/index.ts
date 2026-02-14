export interface Track {
  id: string; // videoId for YT tracks, arbitrary for local
  title: string;
  artist: string;
  album: string;
  artwork: any; // require() for local, string URL for remote
  url: any; // require() for local, string URL for remote (resolved lazily for YT)
  duration: number; // seconds
  lyrics?: LyricLine[];
  isYT?: boolean; // true if this track streams from YouTube
  source?: 'youtube' | 'jiosaavn' | 'local';
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export type RepeatMode = 'off' | 'track' | 'queue';

export type ShuffleMode = boolean;
