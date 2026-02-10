/**
 * YouTube / YouTube Music provider
 *
 * Uses youtubei.js (Innertube) to:
 *   1. Search YTM for songs
 *   2. Resolve a videoId → best audio-only stream URL
 *   3. Fetch trending / home content
 *   4. Get search suggestions
 *   5. Get "Up Next" queue for auto-play / recommendations
 *
 * Everything runs client-side – no backend required.
 */

import Innertube, { Platform } from 'youtubei.js';
import type { Track } from '../types';

type InnerTubeClient = 'IOS' | 'WEB' | 'MWEB' | 'ANDROID' | 'YTMUSIC' | 'YTMUSIC_ANDROID' | 'YTSTUDIO_ANDROID' | 'TV' | 'TV_SIMPLY' | 'TV_EMBEDDED' | 'YTKIDS' | 'WEB_EMBEDDED' | 'WEB_CREATOR';

// ── Custom JavaScript evaluator for Hermes ──────────────────────────────────
// youtubei.js v16 uses JsExtractor to build a self-contained JS script from
// YouTube's player code. The script is an IIFE that returns an object with
// `sigFunction(input)` and `nFunction(input)` wrapper functions.
//
// The default React Native evaluator is a no-op that throws. We replace it
// with one that uses `new Function()` (supported by Hermes) to execute the
// extracted script and call the decipher functions.

function hermesEvaluate(
  data: { output: string; exported: string[]; exportedRawValues?: Record<string, any> },
  env: Record<string, string | number | boolean | null | undefined>,
): Record<string, any> {
  const script = data.output;

  let exportedVars: any;
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function(script + '\nreturn exportedVars;');
    exportedVars = factory();
  } catch (e: any) {
    console.error('[YT-eval] Failed to execute player script:', e?.message ?? e);
    throw e;
  }

  const result: Record<string, any> = {};

  if (typeof env.sig === 'string' && typeof exportedVars.sigFunction === 'function') {
    result.sig = exportedVars.sigFunction(env.sig);
  }

  if (typeof env.n === 'string' && typeof exportedVars.nFunction === 'function') {
    result.n = exportedVars.nFunction(env.n);
  }

  return result;
}

// Patch the platform shim's eval with our Hermes-compatible evaluator.
// This runs at module load time, after youtubei.js has initialized the platform.
try {
  (Platform.shim as any).eval = hermesEvaluate;
} catch (e) {
  console.warn('[YT] Failed to patch Platform.shim.eval:', e);
}

/**
 * Pick the best (largest) thumbnail from a thumbnails array.
 * YouTube thumbnails aren't always sorted by size, so we sort by width.
 * Then upgrade the URL to the highest available resolution.
 */
function bestThumbnail(thumbnails: any[]): string {
  if (!thumbnails || thumbnails.length === 0) return '';

  // Sort by width descending, pick largest
  const sorted = [...thumbnails].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  );
  let url: string = sorted[0].url ?? '';

  // YouTube Music thumbnails often have size params like =w120-h120
  // or =w226-h226-l90-rj — replace with max quality
  if (url.includes('lh3.googleusercontent.com') || url.includes('yt3.googleusercontent.com')) {
    url = url.replace(/=w\d+-h\d+.*$/, '=w544-h544-l90-rj');
  }

  // For i.ytimg.com thumbnails, use maxresdefault or hqdefault
  if (url.includes('i.ytimg.com') && url.includes('default')) {
    url = url.replace(/\/(default|sddefault|hqdefault|mqdefault)\.(jpg|webp)/, '/hqdefault.$2');
  }

  return url;
}

// ── Innertube singleton ──────────────────────────────────────────────────────

let _innertube: Innertube | null = null;
let _initPromise: Promise<Innertube> | null = null;

export async function getInnertube(): Promise<Innertube> {
  if (_innertube) return _innertube;
  if (_initPromise) return _initPromise;

  _initPromise = Innertube.create({
    generate_session_locally: true,
    lang: 'en',
    location: 'US',
    retrieve_player: true,
  }).then((yt) => {
    _innertube = yt;
    _initPromise = null;
    return yt;
  }).catch((err) => {
    _initPromise = null;
    console.error('[YT] Failed to create Innertube instance:', err);
    throw err;
  });

  return _initPromise;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface YTSearchResult {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  artwork: string; // thumbnail URL
}

export interface AudioStreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  durationMs: number;
  expiresAt: number; // timestamp when URL expires (usually ~6 hours)
  headers?: Record<string, string>; // HTTP headers required for streaming
  isHLS?: boolean; // true if URL is an HLS manifest
  clientUsed?: string; // which client produced this URL (for retry exclusion)
}

export interface YTHomeSection {
  title: string;
  items: YTSearchResult[];
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * Search YouTube Music for songs.
 * Returns normalized results ready to display.
 */
export async function searchYTMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  const yt = await getInnertube();
  const results = await yt.music.search(query, { type: 'song' });

  const songs: YTSearchResult[] = [];

  // When filtered by type, the first content block is the matching shelf
  const shelf = results.contents?.[0];
  if (!shelf) return songs;

  const items = (shelf as any).contents ?? [];

  for (const item of items) {
    const videoId = item.id;
    if (!videoId) continue;

    // Pick the best quality thumbnail
    const thumbnails = item.thumbnails ?? [];
    const thumb = bestThumbnail(thumbnails);

    songs.push({
      videoId,
      title: item.title ?? 'Unknown',
      artist:
        item.artists?.map((a: any) => a.name).join(', ') ??
        item.author ?? 'Unknown Artist',
      album: item.album?.name ?? '',
      duration: item.duration?.seconds ?? 0,
      artwork: thumb,
    });
  }

  return songs;
}

// ── Search Suggestions ───────────────────────────────────────────────────────

export async function getSearchSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  try {
    const yt = await getInnertube();
    const sections = await yt.music.getSearchSuggestions(query);
    const suggestions: string[] = [];

    for (const section of sections) {
      const contents = (section as any).contents ?? [];
      for (const item of contents) {
        if (item.type === 'SearchSuggestion') {
          const text = item.suggestion?.toString?.() ?? '';
          if (text) suggestions.push(text);
        }
      }
    }
    return suggestions;
  } catch {
    return [];
  }
}

// ── Stream URL Resolution ────────────────────────────────────────────────────

// User-Agent headers for each client (needed for direct format URLs)
const clientUserAgents: Record<string, string> = {
  IOS: 'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  ANDROID: 'com.google.android.youtube/19.35.36(Linux; U; Android 13; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  YTMUSIC_ANDROID: 'com.google.android.apps.youtube.music/5.34.51(Linux; U; Android 13; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  WEB: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  YTMUSIC: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  TV_EMBEDDED: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
};

/**
 * Full ordered list of clients to try. IOS stays first because its HLS
 * manifests work reliably with ExoPlayer. ANDROID/YTMUSIC_ANDROID direct
 * format URLs may require PoToken which we don't have. Within each client,
 * tryClientForStream still prefers direct audio over HLS when both exist.
 */
const ALL_CLIENTS = [
  'IOS',
  'ANDROID',
  'YTMUSIC_ANDROID',
  'WEB',
  'YTMUSIC',
  'TV_EMBEDDED',
] as const;

type ClientName = (typeof ALL_CLIENTS)[number];

/**
 * Audio quality rank for secondary sorting (higher = better).
 */
const AUDIO_QUALITY_RANK: Record<string, number> = {
  AUDIO_QUALITY_HIGH: 3,
  AUDIO_QUALITY_MEDIUM: 2,
  AUDIO_QUALITY_LOW: 1,
};

/**
 * Try to extract a playable stream from a single client's response.
 * Returns null if no playable stream is found.
 *
 * Priority:
 *   - For IOS client: HLS first (reliable with ExoPlayer), direct as fallback
 *   - For other clients: Direct adaptive audio-only first (better quality),
 *     HLS as fallback (muxed streams cap at ~96-128 kbps AAC)
 *
 * IOS is special because its HLS manifests are known to work without PoToken,
 * while direct adaptive URLs from any client may require PoToken for playback.
 */
async function tryClientForStream(
  yt: Innertube,
  videoId: string,
  client: InnerTubeClient,
): Promise<AudioStreamInfo | null> {
  const info = await yt.getBasicInfo(videoId, { client });
  const streamingData = info.streaming_data;

  if (!streamingData) return null;

  // For IOS, prefer HLS first (known to work), then try direct as fallback
  const preferHLS = client === 'IOS';

  if (preferHLS) {
    // ── HLS first for IOS ──────────────────────────────────────────────
    const hlsResult = await tryHLS(streamingData, client);
    if (hlsResult) return hlsResult;

    // ── Direct fallback for IOS ────────────────────────────────────────
    const directResult = await tryDirectAudio(yt, streamingData, client);
    if (directResult) return directResult;
  } else {
    // ── Direct first for non-IOS clients ───────────────────────────────
    const directResult = await tryDirectAudio(yt, streamingData, client);
    if (directResult) return directResult;

    // ── HLS fallback for non-IOS clients ───────────────────────────────
    const hlsResult = await tryHLS(streamingData, client);
    if (hlsResult) return hlsResult;
  }

  return null;
}

/**
 * Extract HLS manifest if available.
 *
 * YouTube HLS master manifests may contain audio-only renditions via
 * `#EXT-X-MEDIA:TYPE=AUDIO` lines. These are separate streams (typically
 * AAC ~256kbps) that are much better quality than the muxed video+audio
 * variants (~96-128kbps). We try to parse the master manifest and extract
 * the best audio-only rendition. If that fails, we fall back to the muxed
 * master manifest URL (ExoPlayer will pick the best variant itself).
 */
async function tryHLS(
  streamingData: any,
  client: string,
): Promise<AudioStreamInfo | null> {
  if (!streamingData.hls_manifest_url) return null;

  const hlsUrl: string = streamingData.hls_manifest_url;

  // ── Try to fetch & parse master manifest for audio-only renditions ───
  try {
    const resp = await fetch(hlsUrl, {
      headers: {
        'User-Agent': clientUserAgents[client] || clientUserAgents.IOS,
      },
    });

    if (resp.ok) {
      const manifest = await resp.text();
      const audioOnlyUrl = pickBestAudioRendition(manifest, hlsUrl);

      if (audioOnlyUrl) {
        console.log(
          `[YT] ${client}: HLS audio-only rendition found`,
        );
        return {
          url: audioOnlyUrl,
          mimeType: 'application/x-mpegURL',
          bitrate: 256000, // audio-only HLS is typically ~256kbps AAC
          durationMs: 0,
          expiresAt: Date.now() + 5 * 60 * 60 * 1000,
          isHLS: true,
          clientUsed: client,
        };
      }
    }
  } catch (err: any) {
    console.warn(
      `[YT] ${client}: Failed to fetch/parse HLS manifest:`,
      err?.message ?? err,
    );
  }

  // ── Fallback: return muxed master manifest URL ───────────────────────
  const hlsAudioFormats = (streamingData.adaptive_formats ?? []).filter(
    (f: any) => f.has_audio && !f.has_video,
  );
  const bestHlsAudio = hlsAudioFormats.sort(
    (a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0),
  )[0];

  console.log(
    `[YT] ${client}: Using HLS muxed master (fallback, ~128kbps max audio)`,
  );

  return {
    url: hlsUrl,
    mimeType: 'application/x-mpegURL',
    bitrate: bestHlsAudio?.bitrate ?? 128000,
    durationMs: bestHlsAudio?.approx_duration_ms ?? 0,
    expiresAt: Date.now() + 5 * 60 * 60 * 1000,
    isHLS: true,
    clientUsed: client,
  };
}

/**
 * Parse an HLS master manifest and extract the best audio-only rendition URL.
 *
 * YouTube master manifests use two patterns for audio:
 *
 * 1. `#EXT-X-MEDIA:TYPE=AUDIO,...,URI="<url>"`
 *    These are explicit audio renditions. Pick the highest bandwidth one.
 *
 * 2. `#EXT-X-STREAM-INF:...,CODECS="mp4a.40.2",...` (audio-only codec, no video codec)
 *    followed by the stream URL on the next line.
 *    These are audio-only variant streams. Pick the highest BANDWIDTH.
 *
 * Returns the URL of the best audio-only stream, or null if none found.
 */
function pickBestAudioRendition(
  manifest: string,
  baseUrl: string,
): string | null {
  const lines = manifest.split('\n');

  // ── Strategy 1: #EXT-X-MEDIA:TYPE=AUDIO with URI ──────────────────
  const mediaAudioLines = lines.filter(
    (l) => l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO') && l.includes('URI='),
  );

  if (mediaAudioLines.length > 0) {
    // Pick the one with the highest GROUP-ID or just the last one
    // (YouTube typically lists them in ascending quality order)
    const lastMedia = mediaAudioLines[mediaAudioLines.length - 1];
    const uriMatch = lastMedia.match(/URI="([^"]+)"/);
    if (uriMatch?.[1]) {
      const uri = uriMatch[1];
      return resolveHlsUrl(uri, baseUrl);
    }
  }

  // ── Strategy 2: Audio-only #EXT-X-STREAM-INF variants ──────────────
  // Look for STREAM-INF lines with audio-only codecs (no video codec present).
  // Audio codecs: mp4a.*, ac-3, ec-3, opus
  // Video codecs: avc1.*, vp9, av01.*
  const audioOnlyVariants: { bandwidth: number; url: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    // Extract CODECS
    const codecsMatch = line.match(/CODECS="([^"]+)"/);
    if (!codecsMatch) continue;
    const codecs = codecsMatch[1];

    // Check if it's audio-only (no video codec)
    const hasVideo = /avc1|vp9|vp09|av01|hev1|hvc1/i.test(codecs);
    if (hasVideo) continue;

    const hasAudio = /mp4a|opus|ac-3|ec-3|flac|vorbis/i.test(codecs);
    if (!hasAudio) continue;

    // Extract BANDWIDTH
    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;

    // Next line is the URL
    const nextLine = lines[i + 1]?.trim();
    if (nextLine && !nextLine.startsWith('#')) {
      audioOnlyVariants.push({
        bandwidth,
        url: resolveHlsUrl(nextLine, baseUrl),
      });
    }
  }

  if (audioOnlyVariants.length > 0) {
    // Sort by bandwidth descending, pick the best
    audioOnlyVariants.sort((a, b) => b.bandwidth - a.bandwidth);
    const best = audioOnlyVariants[0];
    console.log(
      `[YT] HLS audio-only variant: ${Math.round(best.bandwidth / 1000)}kbps`,
    );
    return best.url;
  }

  return null;
}

/**
 * Resolve a potentially relative HLS URL against the master manifest URL.
 */
function resolveHlsUrl(uri: string, baseUrl: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  // Relative URL — resolve against the base
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    // If URL constructor fails, try manual resolution
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return baseDir + uri;
  }
}

/** Try to extract the best direct adaptive audio-only format. */
async function tryDirectAudio(
  yt: Innertube,
  streamingData: any,
  client: string,
): Promise<AudioStreamInfo | null> {
  const audioFormats = (streamingData.adaptive_formats ?? []).filter(
    (f: any) => f.has_audio && !f.has_video,
  );

  if (audioFormats.length === 0) return null;

  const hasUrl = audioFormats.some(
    (f: any) => f.url || f.signature_cipher || f.cipher,
  );
  if (!hasUrl) return null;

  // Sort by bitrate descending, then by audio_quality rank
  audioFormats.sort((a: any, b: any) => {
    const bitrateDiff = (b.bitrate ?? 0) - (a.bitrate ?? 0);
    if (bitrateDiff !== 0) return bitrateDiff;
    const qualA = AUDIO_QUALITY_RANK[a.audio_quality ?? ''] ?? 0;
    const qualB = AUDIO_QUALITY_RANK[b.audio_quality ?? ''] ?? 0;
    return qualB - qualA;
  });
  const best = audioFormats[0];

  try {
    const url = await best.decipher(yt.session.player);
    if (url) {
      const ua = clientUserAgents[client] || clientUserAgents.WEB;

      // ── Pre-flight: HEAD request to check if URL is actually accessible ──
      // This prevents returning URLs that will silently fail in ExoPlayer
      // (e.g. 403 from missing PoToken). Timeout after 5 seconds.
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const headResp = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': ua },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!headResp.ok) {
          console.warn(
            `[YT] ${client}: Direct audio pre-flight FAILED — HTTP ${headResp.status} (itag ${best.itag}, ${Math.round((best.bitrate ?? 0) / 1000)}kbps). Likely needs PoToken.`,
          );
          return null; // Skip this URL, try next client/fallback
        }
        console.log(
          `[YT] ${client}: Direct audio pre-flight OK — HTTP ${headResp.status}, itag ${best.itag}, ${best.mime_type}, ${Math.round((best.bitrate ?? 0) / 1000)}kbps`,
        );
      } catch (pfErr: any) {
        console.warn(
          `[YT] ${client}: Direct audio pre-flight error:`,
          pfErr?.message ?? pfErr,
        );
        return null; // Network error or timeout — skip this URL
      }

      return {
        url,
        mimeType: best.mime_type,
        bitrate: best.bitrate,
        durationMs: best.approx_duration_ms,
        expiresAt: Date.now() + 5 * 60 * 60 * 1000,
        headers: {
          'User-Agent': ua,
        },
        clientUsed: client,
      };
    }
  } catch (err: any) {
    console.warn(
      `[YT] ${client}: Decipher failed for direct audio:`,
      err?.message ?? err,
    );
  }

  return null;
}

/**
 * Resolve a videoId to a playable audio stream URL.
 *
 * Strategy:
 *   1. Try IOS client first — its HLS manifests work reliably with ExoPlayer.
 *      Within the IOS client, direct audio is tried before HLS when available.
 *   2. Fall back through ANDROID, YTMUSIC_ANDROID, WEB, YTMUSIC, TV_EMBEDDED.
 *   3. Each client tries direct adaptive audio first (higher quality), then HLS.
 *
 * @param excludeClients - Clients that already failed for this video (e.g.
 *   after a PlaybackError). These are skipped so we try a different client.
 */
export async function resolveStreamUrl(
  videoId: string,
  excludeClients?: string[],
): Promise<AudioStreamInfo> {
  const yt = await getInnertube();
  const excluded = new Set(excludeClients?.map((c) => c.toUpperCase()) ?? []);

  for (const client of ALL_CLIENTS) {
    if (excluded.has(client)) continue;
    try {
      const result = await tryClientForStream(yt, videoId, client);
      if (result) return result;
    } catch (err: any) {
      console.warn(`[YT] Client ${client} failed for ${videoId}:`, err?.message ?? err);
      continue;
    }
  }

  throw new Error(`All clients failed to resolve stream URL for ${videoId}`);
}

// ── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a YT search result into our app's Track type.
 * The `url` is left empty — it gets resolved lazily by the prefetch manager.
 */
export function ytResultToTrack(result: YTSearchResult): Track {
  return {
    id: result.videoId,
    title: result.title,
    artist: result.artist,
    album: result.album,
    artwork: result.artwork,
    url: '', // resolved later
    duration: result.duration,
    isYT: true,
  };
}

// ── Up Next / Recommendations ────────────────────────────────────────────────

/**
 * Get "Up Next" recommendations for a given video.
 * Returns a list of tracks that would auto-play after the current one.
 */
export async function getUpNext(videoId: string): Promise<YTSearchResult[]> {
  try {
    const yt = await getInnertube();
    const upNext = await yt.music.getUpNext(videoId, true);

    const tracks: YTSearchResult[] = [];

    for (const item of upNext.contents) {
      if (item.type === 'PlaylistPanelVideo') {
        const vid = (item as any).video_id;
        if (!vid || vid === videoId) continue; // skip the current track

        const thumbnails = (item as any).thumbnail ?? [];
        const thumb = bestThumbnail(thumbnails);

        tracks.push({
          videoId: vid,
          title: (item as any).title?.toString?.() ?? 'Unknown',
          artist: (item as any).author ?? 'Unknown Artist',
          album:
            (item as any).album?.name ?? '',
          duration: (item as any).duration?.seconds ?? 0,
          artwork: thumb,
        });
      }
    }

    return tracks;
  } catch {
    return [];
  }
}

// ── Home Feed / Trending ─────────────────────────────────────────────────────

/**
 * Get the YouTube Music home feed (trending / personalized sections).
 */
export async function getHomeFeed(): Promise<YTHomeSection[]> {
  try {
    const yt = await getInnertube();
    const home = await yt.music.getHomeFeed();

    const sections: YTHomeSection[] = [];

    for (const section of home.sections ?? []) {
      if ((section as any).type !== 'MusicCarouselShelf') continue;

      const title =
        (section as any).header?.title?.toString?.() ?? 'Trending';

      const items: YTSearchResult[] = [];

      for (const item of (section as any).contents ?? []) {
        if (item.type === 'MusicTwoRowItem') {
          // These can be albums, playlists, or songs
          const id = item.id;
          if (!id) continue;

          const thumbnails = (item as any).thumbnail ?? [];
          const thumb = bestThumbnail(thumbnails);

          items.push({
            videoId: id,
            title: (item as any).title?.toString?.() ?? '',
            artist: (item as any).subtitle?.toString?.() ?? '',
            album: '',
            duration: 0,
            artwork: thumb,
          });
        } else if (item.type === 'MusicResponsiveListItem') {
          const id = item.id;
          if (!id) continue;

          const thumbnails = (item as any).thumbnails ?? [];
          const thumb = bestThumbnail(thumbnails);

          items.push({
            videoId: id,
            title: (item as any).title ?? '',
            artist:
              (item as any).artists?.map((a: any) => a.name).join(', ') ?? '',
            album: (item as any).album?.name ?? '',
            duration: (item as any).duration?.seconds ?? 0,
            artwork: thumb,
          });
        }
      }

      if (items.length > 0) {
        sections.push({ title, items });
      }
    }

    return sections;
  } catch (e) {
    console.warn('[YT] Failed to fetch home feed:', e);
    return [];
  }
}
