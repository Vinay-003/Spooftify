export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: any; // require() for local, string for remote
  url: any; // require() for local, string for remote
  duration: number; // seconds
  lyrics?: LyricLine[];
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
