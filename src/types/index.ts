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
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  artwork: any;
  tracks: string[]; // track IDs
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  artwork: any;
  tracks: string[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export type RepeatMode = 'off' | 'track' | 'queue';

export type ShuffleMode = boolean;
