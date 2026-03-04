# Sonos Stream Transcoding — Implementation Prompt

## Context

Pyxis is a music streaming daemon (Bun + Effect-TS + tRPC) that aggregates Pandora and YouTube Music into a unified audio stream proxy. It recently gained Sonos speaker support via UPnP/SOAP — discovery, playback control, and event subscriptions all work.

**Problem:** Sonos speakers reject streams with UPnP error 714 when the audio format is incompatible. YouTube Music streams arrive as `audio/webm` (Opus codec), which Sonos cannot play. Sonos supports: MP3, AAC, FLAC, WAV, OGG Vorbis.

**Goal:** Add transparent ffmpeg transcoding in the stream proxy so Sonos speakers receive a compatible format, while browser clients continue receiving the original stream untouched.

## Current Architecture

```
Browser / Sonos Speaker
        ↓ HTTP GET
/stream/:compositeTrackId  (server/index.ts route handler)
        ↓
Stream handler fetches upstream audio (Pandora CDN / YouTube via yt-dlp)
        ↓
Pipes raw upstream response body to HTTP response
```

### Key Files

| File | Role |
|------|------|
| `server/index.ts` | HTTP server, routes `/stream/:id` requests |
| `server/services/sonos-playback.ts` | Manages active Sonos speakers, calls `SonosControl.play()` with stream URLs |
| `server/services/sonos-control.ts` | UPnP SOAP calls (`SetAVTransportURI`, `Play`, `Seek`, etc.) |
| `server/services/external-url.ts` | Builds `http://<LAN-IP>:<port>/stream/...` URLs for Sonos |
| `src/config.ts` | App config schema (Zod), reads YAML + env vars |
| `nix/lib/shared.nix` | NixOS module options + wrapper script generation |
| `nix/modules/nixos.nix` | systemd service definition |
| `flake.nix` | Nix package definition (add ffmpeg here) |

### Sonos DIDL-Lite Metadata

The `buildDidlLiteMetadata()` function in `sonos-control.ts` already emits a `<res>` element with `protocolInfo="http-get:*:audio/mpeg:*"`. This tells Sonos to expect MP3. The transcoded stream must match this declaration.

### Stream Proxy Behavior

The stream handler currently:
1. Resolves the composite track ID to a source (pandora/ytmusic) + source-specific ID
2. Checks an in-memory cache for a prefetched buffer
3. On cache miss: fetches upstream audio (Pandora CDN URL or yt-dlp subprocess)
4. Streams the response body directly to the client with the upstream `Content-Type`

## Requirements

### 1. Detect When Transcoding Is Needed

Add a query parameter or header to distinguish Sonos requests from browser requests:

- **Option A (preferred):** `?format=mp3` query param on the stream URL. `sonos-playback.ts` already builds these URLs via `buildExternalStreamUrl()` — add the param there.
- **Option B:** `?sonos=1` query param.
- **Option C:** Check `User-Agent` for Sonos signatures — fragile, avoid.

When the format param is present AND the upstream content type is not already compatible (`audio/mpeg`, `audio/mp3`, `audio/aac`, `audio/mp4`), transcode. Otherwise pass through.

### 2. Transcode via ffmpeg

Spawn `ffmpeg` as a child process to transcode on the fly:

```
ffmpeg -i pipe:0 -f mp3 -codec:a libmp3lame -ab 192k -ar 44100 -ac 2 pipe:1
```

- Input: pipe upstream audio bytes to stdin
- Output: read MP3 from stdout, stream to HTTP response
- Set response `Content-Type: audio/mpeg`
- Remove `Content-Length` header (transcoded length is unknown)
- Handle ffmpeg stderr (log warnings, ignore non-fatal messages)
- Kill ffmpeg process on client disconnect

### 3. Add ffmpeg to the Nix Package

In `flake.nix`, the Pyxis package derivation needs ffmpeg in its runtime PATH. Either:
- Add `ffmpeg` to `buildInputs` / `nativeBuildInputs`
- Or wrap the binary with `makeWrapper` to inject ffmpeg into PATH
- The NixOS module wrapper script (`nix/lib/shared.nix`) is another place to inject PATH

Use `pkgs.ffmpeg-headless` (smaller, no X11/GUI deps).

### 4. Update External Stream URL Builder

In `server/services/external-url.ts`, the `buildExternalStreamUrl()` function builds URLs for Sonos. Append `?format=mp3` to these URLs:

```typescript
export function buildExternalStreamUrl(opaqueTrackId: string, nextOpaqueTrackId?: string): string {
  const baseUrl = resolveExternalBaseUrl();
  const path = buildStreamUrl(opaqueTrackId, nextOpaqueTrackId);
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("format", "mp3");  // <-- add this
  return url.toString();
}
```

### 5. Handle Edge Cases

- **Pandora streams** are likely already MP3/AAC — detect and skip transcoding (pass through)
- **Cached buffers** — if the stream is served from cache, the cached bytes are in the original format. Transcoding must happen after cache retrieval too.
- **Seek** — ffmpeg transcoding breaks byte-range seeking. For Sonos this is fine (Pyxis uses UPnP `Seek` with time targets, not byte ranges). For browser clients, don't transcode.
- **Process cleanup** — if the Sonos speaker disconnects or stops, the HTTP request will close. Ensure the ffmpeg child process is killed (listen for `close`/`error` on the response stream).
- **Error handling** — if ffmpeg fails to start or crashes mid-stream, log the error and close the response. Don't leave zombie processes.

## Implementation Approach

1. Start with the stream handler in `server/index.ts` — add the `?format=mp3` detection
2. Create a small `server/services/transcode.ts` module:
   - `transcodeToMp3(inputStream: ReadableStream): { stream: ReadableStream, cleanup: () => void }`
   - Uses `Bun.spawn` or `child_process.spawn` for ffmpeg
   - Returns a readable stream of MP3 bytes + a cleanup function
3. Wire it into the stream handler: when `format=mp3`, pipe through transcode before responding
4. Update `buildExternalStreamUrl()` to add the query param
5. Add ffmpeg to the Nix package
6. Test with a Pandora track (should pass through, already compatible) and a YT Music track (should transcode)

## Constraints

- **Effect-TS** is used throughout the codebase — follow existing patterns for error handling
- **Bun runtime** — use Bun's subprocess API (`Bun.spawn`) rather than Node's `child_process` where possible
- **No new npm dependencies** — ffmpeg is an OS-level binary, not an npm package
- **Keep browser playback untouched** — no transcoding overhead for the web UI
- **The protocolInfo in DIDL-Lite is already `audio/mpeg`** — match this

## Testing

1. Play a Pandora station in the browser → should work as before (no transcoding)
2. Cast Pandora to Sonos → should play (likely already MP3/AAC, pass-through)
3. Play a YT Music track in the browser → should work as before (WebM)
4. Cast YT Music to Sonos → should transcode to MP3 and play
5. Skip tracks while casting → ffmpeg process should be killed, new one spawned
6. Stop casting → ffmpeg cleaned up, no zombie processes
