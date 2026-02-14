const { default: Innertube } = require('youtubei.js');

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000;

const CLIENT_USER_AGENTS = {
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

const DEFAULT_CLIENT_ORDER = [
  'IOS',
  'ANDROID',
  'YTMUSIC',
  'MWEB',
  'WEB',
  'WEB_EMBEDDED',
  'WEB_CREATOR',
  'TV',
  'TV_SIMPLY',
  'YTMUSIC_ANDROID',
  'TV_EMBEDDED',
];

const resolvedCache = new Map();
let innertubePromise = null;

function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

function asClientList(input) {
  if (typeof input === 'string') {
    return asClientList(
      input.split(',').map((value) => value.trim()).filter(Boolean),
    );
  }

  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const output = [];

  for (const value of input) {
    if (typeof value !== 'string') continue;
    const client = value.trim().toUpperCase();
    if (!client) continue;
    if (!(client in CLIENT_USER_AGENTS)) continue;
    if (seen.has(client)) continue;
    seen.add(client);
    output.push(client);
  }

  return output;
}

function getClientOrder(excludeClients) {
  const envOverride = process.env.YT_CLIENT_ORDER
    ? process.env.YT_CLIENT_ORDER.split(',').map((c) => c.trim().toUpperCase())
    : [];

  const sourceOrder = envOverride.length > 0 ? envOverride : DEFAULT_CLIENT_ORDER;
  const excluded = new Set(excludeClients);

  return sourceOrder.filter((client) => CLIENT_USER_AGENTS[client] && !excluded.has(client));
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return undefined;

  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const normalizedKey = key.toLowerCase() === 'user-agent' ? 'User-Agent' : key;
    normalized[normalizedKey] = String(value);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildStreamInfo(client, payload) {
  return {
    url: payload.url,
    mimeType: payload.mimeType,
    bitrate: payload.bitrate || 0,
    durationMs: payload.durationMs || 0,
    expiresAt: Date.now() + 5 * 60 * 60 * 1000,
    headers: normalizeHeaders(payload.headers),
    isHLS: !!payload.isHLS,
    clientUsed: client,
  };
}

async function getInnertube() {
  if (innertubePromise) return innertubePromise;

  const options = {
    generate_session_locally: true,
    retrieve_player: true,
    lang: process.env.YT_LANG || 'en',
    location: process.env.YT_LOCATION || 'US',
  };

  if (process.env.YT_COOKIE) options.cookie = process.env.YT_COOKIE;
  if (process.env.YT_VISITOR_DATA) options.visitor_data = process.env.YT_VISITOR_DATA;
  if (process.env.YT_PO_TOKEN) options.po_token = process.env.YT_PO_TOKEN;
  if (process.env.YT_PLAYER_ID) options.player_id = process.env.YT_PLAYER_ID;

  innertubePromise = Innertube.create(options).catch((error) => {
    innertubePromise = null;
    throw error;
  });

  return innertubePromise;
}

function resolveHlsUrl(uri, baseUrl) {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    return `${baseDir}${uri}`;
  }
}

function pickBestAudioRendition(manifest, baseUrl) {
  const lines = manifest.split('\n');

  const mediaAudioLines = lines.filter(
    (line) => line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO') && line.includes('URI='),
  );

  if (mediaAudioLines.length > 0) {
    const lastMedia = mediaAudioLines[mediaAudioLines.length - 1];
    const uriMatch = lastMedia.match(/URI="([^"]+)"/);
    if (uriMatch && uriMatch[1]) {
      return resolveHlsUrl(uriMatch[1], baseUrl);
    }
  }

  const audioOnlyVariants = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

    const codecsMatch = line.match(/CODECS="([^"]+)"/);
    if (!codecsMatch) continue;
    const codecs = codecsMatch[1];

    const hasVideo = /avc1|vp9|vp09|av01|hev1|hvc1/i.test(codecs);
    if (hasVideo) continue;

    const hasAudio = /mp4a|opus|ac-3|ec-3|flac|vorbis/i.test(codecs);
    if (!hasAudio) continue;

    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

    const nextLine = lines[i + 1] && lines[i + 1].trim();
    if (nextLine && !nextLine.startsWith('#')) {
      audioOnlyVariants.push({
        bandwidth,
        url: resolveHlsUrl(nextLine, baseUrl),
      });
    }
  }

  if (audioOnlyVariants.length === 0) return null;

  audioOnlyVariants.sort((a, b) => b.bandwidth - a.bandwidth);
  return audioOnlyVariants[0].url;
}

async function tryHls(streamingData, client) {
  if (!streamingData || !streamingData.hls_manifest_url) return null;

  const hlsUrl = streamingData.hls_manifest_url;
  const ua = CLIENT_USER_AGENTS[client] || CLIENT_USER_AGENTS.IOS;

  try {
    const response = await withTimeout(
      fetch(hlsUrl, {
        headers: {
          'User-Agent': ua,
        },
      }),
      5000,
      `fetching HLS manifest (${client})`,
    );

    if (response.ok) {
      const manifest = await response.text();
      const audioOnlyUrl = pickBestAudioRendition(manifest, hlsUrl);

      if (audioOnlyUrl) {
        return buildStreamInfo(client, {
          url: audioOnlyUrl,
          mimeType: 'application/x-mpegURL',
          bitrate: 256000,
          durationMs: 0,
          headers: {
            'User-Agent': ua,
          },
          isHLS: true,
        });
      }
    }
  } catch {
    // Fall through to master manifest fallback.
  }

  return buildStreamInfo(client, {
    url: hlsUrl,
    mimeType: 'application/x-mpegURL',
    bitrate: 128000,
    durationMs: 0,
    headers: {
      'User-Agent': ua,
    },
    isHLS: true,
  });
}

function sortAdaptiveAudioFormats(adaptiveFormats) {
  const qualityRank = {
    AUDIO_QUALITY_HIGH: 3,
    AUDIO_QUALITY_MEDIUM: 2,
    AUDIO_QUALITY_LOW: 1,
  };

  return adaptiveFormats
    .filter((format) => format.has_audio && !format.has_video)
    .sort((a, b) => {
      const bitrateDiff = (b.bitrate || 0) - (a.bitrate || 0);
      if (bitrateDiff !== 0) return bitrateDiff;
      const aRank = qualityRank[a.audio_quality] || 0;
      const bRank = qualityRank[b.audio_quality] || 0;
      return bRank - aRank;
    });
}

async function tryDirectAudio(yt, streamingData, client) {
  if (!streamingData || !Array.isArray(streamingData.adaptive_formats)) {
    return null;
  }

  const ua = CLIENT_USER_AGENTS[client] || CLIENT_USER_AGENTS.WEB;
  const formats = sortAdaptiveAudioFormats(streamingData.adaptive_formats);

  for (const format of formats) {
    try {
      const deciphered = await withTimeout(
        format.decipher(yt.session.player),
        5000,
        `deciphering direct stream (${client})`,
      );

      if (!deciphered || typeof deciphered !== 'string') {
        continue;
      }

      return buildStreamInfo(client, {
        url: deciphered,
        mimeType: format.mime_type || 'audio/webm',
        bitrate: format.bitrate || 0,
        durationMs: format.approx_duration_ms || 0,
        headers: {
          'User-Agent': ua,
        },
        isHLS: false,
      });
    } catch {
      continue;
    }
  }

  return null;
}

async function tryClientForStream(yt, videoId, client) {
  const info = await withTimeout(
    yt.getBasicInfo(videoId, { client }),
    10000,
    `getBasicInfo (${client})`,
  );

  const streamingData = info && info.streaming_data;
  if (!streamingData) {
    return null;
  }

  if (client === 'IOS') {
    const hls = await tryHls(streamingData, client);
    if (hls) return hls;

    const direct = await tryDirectAudio(yt, streamingData, client);
    if (direct) return direct;

    return null;
  }

  const direct = await tryDirectAudio(yt, streamingData, client);
  if (direct) return direct;

  const hls = await tryHls(streamingData, client);
  if (hls) return hls;

  return null;
}

async function resolveStream(videoId, excludeClients) {
  const cached = resolvedCache.get(videoId);
  if (cached && Date.now() - cached.resolvedAt < RESOLVE_CACHE_TTL_MS) {
    if (!excludeClients.includes(String(cached.stream.clientUsed || '').toUpperCase())) {
      return cached.stream;
    }
  }

  const yt = await getInnertube();
  const clients = getClientOrder(excludeClients);
  if (clients.length === 0) {
    throw new Error('No clients available after exclusions');
  }

  const failures = [];

  for (const client of clients) {
    try {
      const stream = await tryClientForStream(yt, videoId, client);
      if (!stream) {
        failures.push({ client, error: 'No playable stream returned' });
        continue;
      }

      resolvedCache.set(videoId, {
        stream,
        resolvedAt: Date.now(),
      });

      return stream;
    } catch (error) {
      failures.push({
        client,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const message = failures
    .slice(0, 4)
    .map((failure) => `${failure.client}: ${failure.error}`)
    .join(' | ');

  throw new Error(`All clients failed for ${videoId}. ${message}`);
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = req.method === 'POST' ? readRequestBody(req) : {};
  const videoId = String((req.query.videoId || body.videoId || '')).trim();
  const excludeClients = asClientList(req.query.excludeClients || body.excludeClients);

  if (!VIDEO_ID_REGEX.test(videoId)) {
    res.status(400).json({ ok: false, error: 'Invalid or missing videoId' });
    return;
  }

  try {
    const stream = await withTimeout(
      resolveStream(videoId, excludeClients),
      45000,
      `resolving ${videoId}`,
    );

    res.status(200).json({
      ok: true,
      stream,
      meta: {
        source: 'vercel-resolver',
        videoId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({
      ok: false,
      error: message,
      meta: {
        source: 'vercel-resolver',
        videoId,
      },
    });
  }
};
