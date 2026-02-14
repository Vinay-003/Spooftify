# Spooftify Resolver API (Vercel)

Serverless resolver that returns a playable YouTube audio stream URL for a `videoId`.

## Endpoints

- `GET /api/health`
- `POST /api/resolve`

Request body for `/api/resolve`:

```json
{
  "videoId": "dQw4w9WgXcQ",
  "excludeClients": ["IOS", "ANDROID"]
}
```

Response:

```json
{
  "ok": true,
  "stream": {
    "url": "https://...",
    "mimeType": "application/x-mpegURL",
    "bitrate": 256000,
    "durationMs": 0,
    "expiresAt": 1770000000000,
    "headers": {
      "User-Agent": "..."
    },
    "isHLS": true,
    "clientUsed": "IOS"
  }
}
```

## Deploy on Vercel

1. In Vercel, set the **Root Directory** to `resolver-api`.
2. Framework preset: `Other`.
3. Add env vars (optional but recommended for restricted tracks):
   - `YT_COOKIE`
   - `YT_VISITOR_DATA`
   - `YT_PO_TOKEN`
   - `YT_PLAYER_ID`
   - `YT_CLIENT_ORDER` (comma separated, optional override)
4. Deploy.

## Connect Mobile App

In your Expo app, set:

```bash
export EXPO_PUBLIC_RESOLVER_URL="https://<your-project>.vercel.app/api/resolve"
```

Then restart Metro with cache clear:

```bash
npx expo start -c --dev-client
```
