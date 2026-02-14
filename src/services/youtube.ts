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
 * If EXPO_PUBLIC_RESOLVER_URL is configured, stream resolution is attempted
 * through the backend resolver first, then falls back to local resolution.
 */

import Innertube, { Platform } from 'youtubei.js';
import { Platform as RNPlatform } from 'react-native';
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
  browseId?: string;
  entityType?: 'song' | 'album' | 'playlist' | 'video';
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

const BACKEND_RESOLVER_URL = (process.env.EXPO_PUBLIC_RESOLVER_URL ?? '').trim();

export interface YTHomeSection {
  title: string;
  items: YTSearchResult[];
}

export interface YTCollectionDetails {
  id: string;
  entityType: 'album' | 'playlist';
  title: string;
  artist: string;
  subtitle: string;
  artwork: string;
  tracks: YTSearchResult[];
}

// ── Search ───────────────────────────────────────────────────────────────────
const YT_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function isLikelyVideoId(value: string): boolean {
  return YT_VIDEO_ID_REGEX.test(value);
}

export function isPlayableResult(item: YTSearchResult): boolean {
  return isLikelyVideoId(item.videoId);
}

function toPlainText(value: any): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  if (typeof value?.toString === 'function') {
    const text = value.toString();
    if (typeof text === 'string') {
      const trimmed = text.trim();
      if (trimmed && trimmed !== '[object Object]') return trimmed;
    }
  }
  return '';
}

function parseDurationSeconds(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value?.seconds === 'number' && Number.isFinite(value.seconds)) {
    return Math.max(0, Math.floor(value.seconds));
  }

  const text = toPlainText(value?.text ?? value);
  if (!text) return 0;

  // Supports mm:ss and hh:mm:ss
  const match = text.match(/^(\d{1,2}:)?\d{1,2}:\d{2}$/);
  if (!match) return 0;

  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function extractVideoId(item: any): string {
  const candidates = [
    toPlainText(item?.id) ||
    '',
    toPlainText(item?.video_id),
    toPlainText(item?.videoId),
    toPlainText(item?.endpoint?.payload?.videoId),
    toPlainText(item?.navigation_endpoint?.payload?.videoId),
    toPlainText(item?.endpoint?.metadata?.videoId),
  ];

  for (const candidate of candidates) {
    if (candidate && isLikelyVideoId(candidate)) {
      return candidate;
    }
  }
  return '';
}

function extractBrowseId(item: any): string {
  const candidates = [
    toPlainText(item?.endpoint?.payload?.browseId),
    toPlainText(item?.navigation_endpoint?.payload?.browseId),
    toPlainText(item?.id),
  ];

  for (const candidate of candidates) {
    if (candidate && !isLikelyVideoId(candidate)) {
      return candidate;
    }
  }
  return '';
}

function getPageType(item: any): string {
  return toPlainText(
    item?.endpoint?.payload?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType,
  );
}

function asThumbnailList(input: any): any[] {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.contents)) return input.contents;
  if (Array.isArray(input?.thumbnails)) return input.thumbnails;
  return [];
}

function normalizeSearchItem(item: any): YTSearchResult | null {
  const videoId = extractVideoId(item);
  if (!videoId) return null;

  const title = toPlainText(item?.title) || 'Unknown';
  const artists = Array.isArray(item?.artists)
    ? item.artists
      .map((a: any) => toPlainText(a?.name ?? a))
      .filter(Boolean)
      .join(', ')
    : '';
  const artist =
    artists ||
    toPlainText(item?.author) ||
    toPlainText(item?.subtitle) ||
    'Unknown Artist';
  const album = toPlainText(item?.album?.name ?? item?.album);
  const duration = parseDurationSeconds(item?.duration);
  const thumbnails = item?.thumbnails ?? item?.thumbnail ?? [];
  const artwork = bestThumbnail(thumbnails);

  return {
    videoId,
    title,
    artist,
    album,
    duration,
    artwork,
    entityType: 'song',
  };
}

function extractSearchResults(results: any): YTSearchResult[] {
  const output: YTSearchResult[] = [];
  const seenIds = new Set<string>();

  // Walk only `contents` chains to avoid traversing huge/cyclic parser objects.
  const queue: any[] = Array.isArray(results?.contents) ? [...results.contents] : [];
  const visited = new Set<any>();

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    const childContents = (node as any).contents;
    if (Array.isArray(childContents) && childContents.length > 0) {
      queue.push(...childContents);
    }

    const normalized = normalizeSearchItem(node);
    if (!normalized) continue;
    if (seenIds.has(normalized.videoId)) continue;

    seenIds.add(normalized.videoId);
    output.push(normalized);
  }

  return output;
}

/**
 * Search YouTube Music for songs.
 * Returns normalized results ready to display.
 */
export async function searchYTMusic(query: string): Promise<YTSearchResult[]> {
  if (!query.trim()) return [];

  const yt = await getInnertube();
  const songResults = await yt.music.search(query, { type: 'song' });
  const songs = extractSearchResults(songResults);
  if (songs.length >= 12) return songs;

  // Fallback: include "video" filter results so songs that exist on YouTube
  // but not in the strict "song" shelf still appear in app search.
  try {
    const videoResults = await yt.music.search(query, { type: 'video' as any });
    const fromVideos = extractSearchResults(videoResults);

    const merged = new Map<string, YTSearchResult>();
    for (const item of songs) merged.set(item.videoId, item);
    for (const item of fromVideos) {
      if (!merged.has(item.videoId)) {
        merged.set(item.videoId, item);
      }
    }
    return Array.from(merged.values());
  } catch {
    return songs;
  }
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
  MWEB: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  YTMUSIC: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  WEB_EMBEDDED: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  WEB_CREATOR: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
  TV: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
  TV_SIMPLY: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
  TV_EMBEDDED: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
};

/**
 * Base client list. Runtime order is adjusted in `getClientOrder()`.
 */
const ALL_CLIENTS = [
  'IOS',
  'ANDROID',
  'WEB',
  'MWEB',
  'YTMUSIC',
  'WEB_EMBEDDED',
  'WEB_CREATOR',
  'TV',
  'TV_SIMPLY',
  'YTMUSIC_ANDROID',
  'TV_EMBEDDED',
] as const;

type ClientName = (typeof ALL_CLIENTS)[number];

function getClientOrder(): ClientName[] {
  // On Android, prioritize iOS first because its HLS manifests are generally
  // the most stable for this app, then fall back to direct-capable clients.
  if (RNPlatform.OS === 'android') {
    return [
      'IOS',
      'ANDROID',
      'YTMUSIC',
      'WEB',
      'MWEB',
      'WEB_EMBEDDED',
      'WEB_CREATOR',
      'TV',
      'TV_SIMPLY',
      'YTMUSIC_ANDROID',
      'TV_EMBEDDED',
    ];
  }

  return [...ALL_CLIENTS];
}

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

  // For IOS, prefer HLS first (known to work), then try direct as fallback.
  const preferHLS = client === 'IOS';

  if (preferHLS) {
    // ── HLS first for IOS ──────────────────────────────────────────────
    const hlsResult = await tryHLS(streamingData, client);
    if (hlsResult) return hlsResult;

    // ── Direct fallback for IOS ────────────────────────────────────────
    const directResult = await tryDirectAudio(yt, streamingData, client, {
      allowWithoutPreflight: RNPlatform.OS === 'android',
    });
    if (directResult) return directResult;
  } else {
    // ── Direct first for non-IOS clients ───────────────────────────────
    const directResult = await tryDirectAudio(yt, streamingData, client, {
      allowWithoutPreflight: RNPlatform.OS === 'android',
    });
    if (directResult) return directResult;

    // ── HLS fallback for non-IOS clients ───────────────────────────────
    const hlsResult = await tryHLS(streamingData, client);
    if (hlsResult) return hlsResult;
  }

  return null;
}

function normalizeStreamHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value == null) continue;
    const normalizedKey = key.toLowerCase() === 'user-agent' ? 'User-Agent' : key;
    normalized[normalizedKey] = String(value);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeStreamInfoFromBackend(payload: any): AudioStreamInfo {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Resolver returned invalid payload');
  }

  const url = toPlainText(payload.url);
  if (!url) {
    throw new Error('Resolver returned empty stream URL');
  }

  return {
    url,
    mimeType: toPlainText(payload.mimeType) || 'application/octet-stream',
    bitrate: Number(payload.bitrate ?? 0) || 0,
    durationMs: Number(payload.durationMs ?? 0) || 0,
    expiresAt: Number(payload.expiresAt ?? Date.now() + 5 * 60 * 60 * 1000),
    headers: normalizeStreamHeaders(payload.headers),
    isHLS: Boolean(payload.isHLS),
    clientUsed: toPlainText(payload.clientUsed) || 'BACKEND',
  };
}

async function resolveStreamViaBackend(
  videoId: string,
  excludeClients?: string[],
): Promise<AudioStreamInfo> {
  if (!BACKEND_RESOLVER_URL) {
    throw new Error('Backend resolver URL is not configured');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(BACKEND_RESOLVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoId,
        excludeClients: excludeClients ?? [],
      }),
      signal: controller.signal,
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // no-op, handled below
    }

    if (!response.ok || payload?.ok === false) {
      const reason = toPlainText(payload?.error) || `HTTP ${response.status}`;
      throw new Error(reason);
    }

    const streamPayload = payload?.stream ?? payload;
    return normalizeStreamInfoFromBackend(streamPayload);
  } finally {
    clearTimeout(timeoutHandle);
  }
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
  options?: {
    allowWithoutPreflight?: boolean;
  },
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
  const ua = clientUserAgents[client] || clientUserAgents.WEB;
  const allowWithoutPreflight = !!options?.allowWithoutPreflight;
  let fallbackWithoutPreflight: AudioStreamInfo | null = null;
  let preflightAttempts = 0;

  const preflight = async (url: string, format: any): Promise<boolean> => {
    const timeoutMs = allowWithoutPreflight ? 2500 : 6000;

    const run = async (
      method: 'HEAD' | 'GET',
      extraHeaders?: Record<string, string>,
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          method,
          headers: {
            'User-Agent': ua,
            ...(extraHeaders ?? {}),
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const headResp = await run('HEAD');
      if (headResp.ok) {
        return true;
      }

      // Some Googlevideo URLs reject HEAD while GET with Range works.
      if ([400, 403, 405].includes(headResp.status)) {
        const getResp = await run('GET', { Range: 'bytes=0-1' });
        if (getResp.ok || getResp.status === 206) {
          return true;
        }
      }

      console.warn(
        `[YT] ${client}: Direct audio pre-flight failed (itag ${format.itag}, status ${headResp.status})`,
      );
      return false;
    } catch (pfErr: any) {
      console.warn(
        `[YT] ${client}: Direct audio pre-flight error for itag ${format.itag}:`,
        pfErr?.message ?? pfErr,
      );
      return false;
    }
  };

  for (const format of audioFormats) {
    if (allowWithoutPreflight && preflightAttempts >= 1 && fallbackWithoutPreflight) {
      break;
    }

    try {
      const url = await format.decipher(yt.session.player);
      if (!url) continue;

      preflightAttempts += 1;
      const isPlayable = await preflight(url, format);
      if (!isPlayable) {
        if (!allowWithoutPreflight || fallbackWithoutPreflight) {
          continue;
        }

        // React Native fetch preflight can report 403 for URLs that still
        // play in ExoPlayer. Keep one best candidate as a last resort.
        fallbackWithoutPreflight = {
          url,
          mimeType: format.mime_type,
          bitrate: format.bitrate,
          durationMs: format.approx_duration_ms,
          expiresAt: Date.now() + 5 * 60 * 60 * 1000,
          headers: {
            'User-Agent': ua,
          },
          clientUsed: client,
        };
        break;
      }

      console.log(
        `[YT] ${client}: Selected direct audio itag ${format.itag}, ${Math.round((format.bitrate ?? 0) / 1000)}kbps`,
      );

      return {
        url,
        mimeType: format.mime_type,
        bitrate: format.bitrate,
        durationMs: format.approx_duration_ms,
        expiresAt: Date.now() + 5 * 60 * 60 * 1000,
        headers: {
          'User-Agent': ua,
        },
        clientUsed: client,
      };
    } catch (err: any) {
      console.warn(
        `[YT] ${client}: Decipher failed for itag ${format.itag}:`,
        err?.message ?? err,
      );
    }
  }

  if (fallbackWithoutPreflight) {
    console.warn(
      `[YT] ${client}: Using direct audio without pre-flight verification`,
    );
    return fallbackWithoutPreflight;
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
  if (!isLikelyVideoId(videoId)) {
    throw new Error(`Invalid YouTube video id: ${videoId}`);
  }

  if (BACKEND_RESOLVER_URL) {
    try {
      const backendStream = await resolveStreamViaBackend(videoId, excludeClients);
      console.log(
        `[YT] Backend resolver selected ${backendStream.clientUsed ?? 'unknown'} for ${videoId}`,
      );
      return backendStream;
    } catch (err: any) {
      console.warn(
        `[YT] Backend resolver failed for ${videoId}, falling back to local resolver:`,
        err?.message ?? err,
      );
    }
  }

  const yt = await getInnertube();
  const excluded = new Set(excludeClients?.map((c) => c.toUpperCase()) ?? []);
  const clientOrder = getClientOrder();

  for (const client of clientOrder) {
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
  if (!isPlayableResult(result)) {
    throw new Error(`Result is not playable: ${result.videoId}`);
  }

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
        const vid = toPlainText((item as any).video_id);
        if (!vid || vid === videoId) continue; // skip the current track
        if (!isLikelyVideoId(vid)) continue;

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
          entityType: 'song',
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
          // These can be songs, albums, or playlists.
          const playableVideoId = extractVideoId(item);
          const browseId = extractBrowseId(item);
          const pageType = getPageType(item);
          const isPlayable = !!playableVideoId;

          if (!isPlayable && !browseId) continue;

          let entityType: YTSearchResult['entityType'] = 'song';
          if (!isPlayable) {
            if (pageType.includes('ALBUM')) {
              entityType = 'album';
            } else if (pageType.includes('PLAYLIST')) {
              entityType = 'playlist';
            } else {
              entityType = 'playlist';
            }
          }

          const thumbnails = asThumbnailList((item as any).thumbnail);
          const thumb = bestThumbnail(thumbnails);

          items.push({
            videoId: playableVideoId || browseId,
            title: (item as any).title?.toString?.() ?? '',
            artist: (item as any).subtitle?.toString?.() ?? '',
            album: '',
            duration: isPlayable ? ((item as any).duration?.seconds ?? 0) : 0,
            artwork: thumb,
            browseId: browseId || undefined,
            entityType,
          });
        } else if (item.type === 'MusicResponsiveListItem') {
          const playableVideoId = extractVideoId(item);
          const browseId = extractBrowseId(item);
          const itemType = toPlainText((item as any).item_type).toLowerCase();
          const isPlayable = !!playableVideoId;
          if (!isPlayable && !browseId) continue;

          const thumbnails = asThumbnailList((item as any).thumbnails);
          const thumb = bestThumbnail(thumbnails);

          let entityType: YTSearchResult['entityType'] = 'song';
          if (!isPlayable) {
            entityType =
              itemType === 'album'
                ? 'album'
                : itemType === 'playlist'
                  ? 'playlist'
                  : 'playlist';
          }

          items.push({
            videoId: playableVideoId || browseId,
            title: (item as any).title ?? '',
            artist:
              (item as any).artists?.map((a: any) => a.name).join(', ') ?? '',
            album: (item as any).album?.name ?? '',
            duration: isPlayable ? ((item as any).duration?.seconds ?? 0) : 0,
            artwork: thumb,
            browseId: browseId || undefined,
            entityType,
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

export async function getCollectionDetails(
  id: string,
  entityType: 'album' | 'playlist',
): Promise<YTCollectionDetails> {
  const yt = await getInnertube();
  const collection = entityType === 'album'
    ? await yt.music.getAlbum(id)
    : await yt.music.getPlaylist(id);

  const header = (collection as any).header ?? {};
  const title = toPlainText(header?.title) || 'Unknown';
  const artist = toPlainText(header?.strapline_text_one) || toPlainText(header?.subtitle);
  const subtitle = toPlainText(header?.second_subtitle) || toPlainText(header?.subtitle);
  const artwork = bestThumbnail(asThumbnailList(header?.thumbnail));

  const tracks: YTSearchResult[] = [];
  const contents = (collection as any).contents ?? (collection as any).items ?? [];

  for (const item of contents) {
    const videoId = extractVideoId(item);
    if (!videoId) continue;

    const thumbnails = asThumbnailList((item as any).thumbnails);
    const trackArtwork = bestThumbnail(thumbnails) || artwork;

    tracks.push({
      videoId,
      title: toPlainText((item as any).title) || 'Unknown',
      artist:
        (item as any).artists?.map((a: any) => a.name).join(', ') ||
        toPlainText((item as any).author) ||
        artist ||
        'Unknown Artist',
      album: title,
      duration: parseDurationSeconds((item as any).duration),
      artwork: trackArtwork,
      entityType: 'song',
    });
  }

  return {
    id,
    entityType,
    title,
    artist,
    subtitle,
    artwork,
    tracks,
  };
}
