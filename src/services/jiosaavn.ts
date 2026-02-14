import CryptoJS from 'crypto-js';
import type { Track } from '../types';
import type { AudioStreamInfo } from './youtube';

const SAAVN_SEARCH_ENDPOINT = 'https://www.jiosaavn.com/api.php';
const SAAVN_DES_KEY = '38346591';
const SAAVN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type SaavnRawSong = Record<string, any>;

export interface JioSaavnSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  streamUrl: string;
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

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeArtwork(url: string): string {
  const raw = url.replace(/^http:/, 'https:');
  return raw
    .replace('50x50', '500x500')
    .replace('150x150', '500x500');
}

function parseDuration(value: any): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function decodeEncryptedMediaUrl(input: string): string {
  const encrypted = toPlainText(input);
  if (!encrypted) return '';

  try {
    const decrypted = CryptoJS.DES.decrypt(
      {
        ciphertext: CryptoJS.enc.Base64.parse(encrypted),
      } as any,
      CryptoJS.enc.Utf8.parse(SAAVN_DES_KEY),
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      },
    );

    const decoded = CryptoJS.enc.Utf8.stringify(decrypted)
      .replace(/\.mp4.*$/, '.mp4')
      .replace(/\.m4a.*$/, '.m4a')
      .replace(/^http:/, 'https:');

    return decoded;
  } catch {
    return '';
  }
}

function extractArtist(raw: SaavnRawSong): string {
  const music = toPlainText(raw?.more_info?.music);
  if (music) return decodeHtml(music);

  const primary = raw?.more_info?.artistMap?.primary_artists;
  if (Array.isArray(primary) && primary.length > 0) {
    const names = primary
      .map((entry: any) => decodeHtml(toPlainText(entry?.name)))
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }

  const subtitle = toPlainText(raw?.subtitle);
  if (subtitle) return decodeHtml(subtitle);

  return 'Unknown Artist';
}

function parseSong(raw: SaavnRawSong): JioSaavnSearchResult | null {
  const id = toPlainText(raw?.id);
  if (!id) return null;

  const title = decodeHtml(toPlainText(raw?.song ?? raw?.title));
  if (!title) return null;

  const encryptedUrl =
    toPlainText(raw?.encrypted_media_url) ||
    toPlainText(raw?.more_info?.encrypted_media_url);
  const streamUrl = decodeEncryptedMediaUrl(encryptedUrl);
  if (!streamUrl) return null;

  const artwork = normalizeArtwork(toPlainText(raw?.image));

  return {
    id,
    title,
    artist: extractArtist(raw),
    album: decodeHtml(toPlainText(raw?.album ?? raw?.more_info?.album)),
    duration: parseDuration(raw?.duration ?? raw?.more_info?.duration),
    artwork,
    streamUrl,
  };
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(source: string, target: string): number {
  if (!source || !target) return 0;
  const sourceTokens = new Set(source.split(' ').filter(Boolean));
  const targetTokens = new Set(target.split(' ').filter(Boolean));
  if (sourceTokens.size === 0 || targetTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of sourceTokens) {
    if (targetTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(sourceTokens.size, targetTokens.size);
}

function pickBestMatch(
  results: JioSaavnSearchResult[],
  options: { title: string; artist?: string; durationSeconds?: number },
): JioSaavnSearchResult | null {
  if (results.length === 0) return null;

  const titleNeedle = normalizeForMatch(options.title);
  const artistNeedle = normalizeForMatch(options.artist ?? '');

  let best: JioSaavnSearchResult | null = null;
  let bestScore = -1;

  for (const item of results) {
    const titleHay = normalizeForMatch(item.title);
    const artistHay = normalizeForMatch(item.artist);

    const titleScore = tokenOverlapScore(titleNeedle, titleHay);
    const artistScore = artistNeedle
      ? tokenOverlapScore(artistNeedle, artistHay)
      : 0.4;

    const durationPenalty =
      options.durationSeconds && item.duration > 0
        ? Math.min(Math.abs(item.duration - options.durationSeconds) / 30, 1)
        : 0;

    const score = titleScore * 0.7 + artistScore * 0.3 - durationPenalty * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

export async function searchJioSaavnSongs(
  query: string,
  maxResults = 20,
): Promise<JioSaavnSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const searchParams = new URLSearchParams({
    p: '1',
    q: cleanQuery,
    _format: 'json',
    _marker: '0',
    ctx: 'wap6dot0',
    n: String(Math.max(1, Math.min(50, maxResults))),
    __call: 'search.getResults',
  });

  try {
    const response = await fetch(`${SAAVN_SEARCH_ENDPOINT}?${searchParams.toString()}`, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': SAAVN_USER_AGENT,
      },
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const rawResults = Array.isArray(payload?.results) ? payload.results : [];

    const parsed: JioSaavnSearchResult[] = [];
    for (const raw of rawResults) {
      const item = parseSong(raw);
      if (item) {
        parsed.push(item);
      }
    }

    return parsed;
  } catch {
    return [];
  }
}

export async function resolveJioSaavnFallback(
  options: { title: string; artist?: string; durationSeconds?: number },
): Promise<AudioStreamInfo | null> {
  const query = `${options.title} ${options.artist ?? ''}`.trim();
  const results = await searchJioSaavnSongs(query, 8);
  if (results.length === 0) return null;

  const best = pickBestMatch(results, options);
  if (!best) return null;

  return {
    url: best.streamUrl,
    mimeType: best.streamUrl.includes('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    bitrate: 128000,
    durationMs: best.duration > 0 ? best.duration * 1000 : 0,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    headers: {
      'User-Agent': SAAVN_USER_AGENT,
      Referer: 'https://www.jiosaavn.com/',
    },
    clientUsed: 'JIOSAAVN',
  };
}

export function jioSaavnResultToTrack(result: JioSaavnSearchResult): Track {
  return {
    id: `saavn:${result.id}`,
    title: result.title,
    artist: result.artist,
    album: result.album,
    artwork: result.artwork,
    url: result.streamUrl,
    duration: result.duration,
    isYT: false,
    source: 'jiosaavn',
  };
}
