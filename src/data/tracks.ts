import { Track, Playlist, Category } from '../types';

// Demo tracks using placeholder data
// In production, these would come from an API
export const DEMO_TRACKS: Track[] = [
  {
    id: '1',
    title: 'Midnight Dreams',
    artist: 'Luna Wave',
    album: 'Nocturnal',
    artwork: require('../../assets/demo/album1.png'),
    url: require('../../assets/demo/sample1.wav'),
    duration: 217,
    lyrics: [
      { time: 0, text: '♪ Instrumental ♪' },
      { time: 8, text: 'Walking through the midnight rain' },
      { time: 14, text: 'Every shadow knows my name' },
      { time: 20, text: 'Stars are falling one by one' },
      { time: 26, text: "Dancing till the night is done" },
      { time: 32, text: '' },
      { time: 36, text: 'Midnight dreams, carry me away' },
      { time: 42, text: 'To a place where I can stay' },
      { time: 48, text: "Where the music doesn't fade" },
      { time: 54, text: 'And the memories are made' },
      { time: 60, text: '' },
      { time: 64, text: '♪ Instrumental ♪' },
    ],
  },
  {
    id: '2',
    title: 'Electric Pulse',
    artist: 'Neon Circuit',
    album: 'Voltage',
    artwork: require('../../assets/demo/album2.png'),
    url: require('../../assets/demo/sample2.wav'),
    duration: 195,
    lyrics: [
      { time: 0, text: '♪ Synth Intro ♪' },
      { time: 10, text: 'Feel the current running through' },
      { time: 16, text: 'Electric veins of neon blue' },
      { time: 22, text: 'City lights are burning bright' },
      { time: 28, text: "We're alive in the electric night" },
      { time: 34, text: '' },
      { time: 38, text: 'Pulse, pulse, feel the beat' },
      { time: 44, text: 'Moving to the digital heat' },
    ],
  },
  {
    id: '3',
    title: 'Ocean Breeze',
    artist: 'Coral Tide',
    album: 'Pacific',
    artwork: require('../../assets/demo/album3.png'),
    url: require('../../assets/demo/sample3.wav'),
    duration: 243,
    lyrics: [
      { time: 0, text: '♪ Waves ♪' },
      { time: 12, text: 'Salt on my skin, wind in my hair' },
      { time: 18, text: 'Ocean breeze without a care' },
      { time: 24, text: 'Horizon stretches far and wide' },
      { time: 30, text: "I'm floating with the changing tide" },
    ],
  },
  {
    id: '4',
    title: 'Golden Hour',
    artist: 'Sunset Bloom',
    album: 'Amber',
    artwork: require('../../assets/demo/album4.png'),
    url: require('../../assets/demo/sample1.wav'),
    duration: 208,
    lyrics: [
      { time: 0, text: 'When the light turns soft and gold' },
      { time: 8, text: 'Every story left untold' },
      { time: 14, text: 'Finds its way into the sky' },
      { time: 20, text: 'Golden hour, you and I' },
    ],
  },
  {
    id: '5',
    title: 'Urban Echoes',
    artist: 'Metro Sound',
    album: 'Cityscape',
    artwork: require('../../assets/demo/album5.png'),
    url: require('../../assets/demo/sample2.wav'),
    duration: 186,
    lyrics: [
      { time: 0, text: '♪ City Ambience ♪' },
      { time: 10, text: 'Concrete jungle, steel and glass' },
      { time: 16, text: 'Watching all the people pass' },
      { time: 22, text: 'Every footstep tells a tale' },
      { time: 28, text: 'Urban echoes never fail' },
    ],
  },
  {
    id: '6',
    title: 'Velvet Night',
    artist: 'Luna Wave',
    album: 'Nocturnal',
    artwork: require('../../assets/demo/album1.png'),
    url: require('../../assets/demo/sample3.wav'),
    duration: 234,
  },
  {
    id: '7',
    title: 'Circuit Break',
    artist: 'Neon Circuit',
    album: 'Voltage',
    artwork: require('../../assets/demo/album2.png'),
    url: require('../../assets/demo/sample1.wav'),
    duration: 199,
  },
  {
    id: '8',
    title: 'Tidal Wave',
    artist: 'Coral Tide',
    album: 'Pacific',
    artwork: require('../../assets/demo/album3.png'),
    url: require('../../assets/demo/sample2.wav'),
    duration: 221,
  },
  {
    id: '9',
    title: 'Sunflower',
    artist: 'Sunset Bloom',
    album: 'Amber',
    artwork: require('../../assets/demo/album4.png'),
    url: require('../../assets/demo/sample3.wav'),
    duration: 190,
  },
  {
    id: '10',
    title: 'Neon Skyline',
    artist: 'Metro Sound',
    album: 'Cityscape',
    artwork: require('../../assets/demo/album5.png'),
    url: require('../../assets/demo/sample1.wav'),
    duration: 215,
  },
];

export const DEMO_PLAYLISTS: Playlist[] = [
  {
    id: 'pl1',
    name: 'Chill Vibes',
    description: 'Relax and unwind with these smooth tracks',
    artwork: require('../../assets/demo/album1.png'),
    tracks: ['1', '3', '6', '9'],
  },
  {
    id: 'pl2',
    name: 'Energy Boost',
    description: 'Get pumped with these high-energy beats',
    artwork: require('../../assets/demo/album2.png'),
    tracks: ['2', '5', '7', '10'],
  },
  {
    id: 'pl3',
    name: 'Late Night',
    description: 'Perfect soundtrack for late nights',
    artwork: require('../../assets/demo/album3.png'),
    tracks: ['1', '4', '6', '8'],
  },
  {
    id: 'pl4',
    name: 'Morning Coffee',
    description: 'Start your day right',
    artwork: require('../../assets/demo/album4.png'),
    tracks: ['3', '4', '9', '10'],
  },
  {
    id: 'pl5',
    name: 'Workout Mix',
    description: 'Push harder with these tracks',
    artwork: require('../../assets/demo/album5.png'),
    tracks: ['2', '5', '7', '8'],
  },
  {
    id: 'pl6',
    name: 'Focus Flow',
    description: 'Deep concentration music',
    artwork: require('../../assets/demo/album1.png'),
    tracks: ['1', '3', '6', '8', '10'],
  },
];

export const SEARCH_CATEGORIES: Category[] = [
  { id: 'pop', name: 'Pop', color: '#E8115B' },
  { id: 'hiphop', name: 'Hip-Hop', color: '#BA5D07' },
  { id: 'rock', name: 'Rock', color: '#E61E32' },
  { id: 'indie', name: 'Indie', color: '#608108' },
  { id: 'electronic', name: 'Electronic', color: '#7358FF' },
  { id: 'rnb', name: 'R&B', color: '#DC148C' },
  { id: 'jazz', name: 'Jazz', color: '#477D95' },
  { id: 'classical', name: 'Classical', color: '#8C67AB' },
  { id: 'ambient', name: 'Ambient', color: '#1E3264' },
  { id: 'lofi', name: 'Lo-Fi', color: '#503750' },
  { id: 'chill', name: 'Chill', color: '#2D46B9' },
  { id: 'workout', name: 'Workout', color: '#E13300' },
];

// Helper to get track by ID
export function getTrackById(id: string): Track | undefined {
  return DEMO_TRACKS.find(t => t.id === id);
}

// Helper to get tracks for a playlist
export function getPlaylistTracks(playlist: Playlist): Track[] {
  return playlist.tracks
    .map(id => getTrackById(id))
    .filter((t): t is Track => t !== undefined);
}
