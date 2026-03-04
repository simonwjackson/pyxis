# Transparent Quality Upgrade via Soulseek

## Problem

Pyxis streams music from YouTube, Pandora, and other sources at whatever quality they provide — often lossy 128-192kbps. Users who care about audio quality have no way to get higher-bitrate versions without manually sourcing files. The system should silently and progressively upgrade tracks to the best available quality without any user interaction.

## Approach: Silent Quality Escalator

Soulseek P2P network is used as a transparent upgrade source. The user never interacts with Soulseek directly. The system automatically searches, matches, downloads, and swaps in higher-quality versions of tracks the user already has.

### Core Loop
1. **Trigger**: Album saved to library → immediate Soulseek search for all tracks
2. **Search**: Soulseek P2P search returns results from online peers
3. **Match**: Confidence matcher scores results using title, artist, duration, album, and file path heuristics
4. **Tier**: ≥95% confidence → auto-download & swap. 80-95% → download but hold for manual review. <80% → skip.
5. **Download**: Managed queue with concurrency control downloads the file
6. **Store**: File saved locally. DB updated with source + actual bitrate from file metadata.
7. **Swap**: Stream proxy now serves the local file. If user is actively listening, mid-stream swap at current position via WebSocket notification.
8. **Climb**: If current best is 320kbps MP3 and the target is FLAC, the system keeps searching on a backoff schedule until lossless is obtained.

### Radio Extension
The same system applies to ephemeral radio tracks (Pandora, YouTube radio):
- When radio returns upcoming tracks, check local cache first (instant hit)
- If no cache hit, fire a speculative Soulseek prefetch search N tracks ahead (configurable, sensible default)
- No retries for radio tracks — best effort only
- Downloaded files are kept forever by default (passive library building)
- User can configure TTL or total disk capacity to manage storage

### Quality Ladder (Progressive)
```
Original source (e.g. YouTube ~128kbps)
       ↓ upgrade
320kbps MP3 (use immediately, keep searching)
       ↓ upgrade  
FLAC / lossless (target reached, stop searching)
```
Every step up is an immediate improvement. The system doesn't wait for perfection.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Soulseek client location | Pulled into Pyxis repo (`src/sources/soulseek/`) | Single repo maintenance, no version drift |
| Isolation | Bun worker thread | Crash-isolated from main server, single deployment |
| Confidence matching | Title + artist + duration + album + file path heuristics | File paths on Soulseek are rich structured metadata |
| Confidence tiers | ≥95% auto, 80-95% review, <80% skip | Safety rail — never swap in a wrong track |
| Quality tracking | Per-source bitrate in DB, null if unknown | Never guess bitrate, only store verified values |
| Mid-stream swap | Immediate seek to current position | User gets the upgrade the moment it's ready |
| Retry strategy | Exponential backoff (1d → 3d → 1w → 1m) until FLAC | Soulseek availability is peer-dependent, retries catch different peers |
| Radio upgrades | Cache check + prefetch search, no retries | Ephemeral tracks, best effort only |
| File retention | Keep forever by default, configurable TTL/capacity | Radio becomes passive library builder |

## Architecture

```
Main Process (Bun)
├── tRPC Server
│   ├── Album save → triggers search
│   └── Review queue endpoint
├── Stream Proxy
│   └── Quality Resolver (pick highest bitrate source)
├── Retry Scheduler (exponential backoff)
├── Radio Prefetcher (configurable lookahead)
└── WebSocket (upgrade notifications → mid-stream swap)

Bun Worker Thread (crash-isolated)
├── Soulseek Client (P2P connections, search, file transfer)
├── File Path Parser (extract metadata from peer paths)
├── Confidence Matcher (Jaro-Winkler + duration + album + path)
└── Download Queue (concurrency controlled, progress tracking)

Storage
├── DB: track_sources table (track_id, source, bitrate, confidence, file_path)
└── Local File Cache (configurable TTL + capacity eviction)
```

## DB Model Sketch

`track_sources` table:
- `track_id` (FK to canonical track)
- `source` (enum: youtube, pandora, soulseek, bandcamp, etc.)
- `source_track_id` (ID within that source)
- `bitrate` (integer, nullable — null means unknown)
- `format` (e.g. 'flac', 'mp3', 'opus', nullable)
- `local_path` (nullable — set when file exists on disk)
- `confidence` (float, nullable — match confidence for Soulseek sourced tracks)
- `review_status` (enum: auto_approved, pending_review, rejected, nullable)
- `created_at`, `updated_at`

## Open Questions

1. **Soulseek credentials**: How should the user configure their Soulseek login? Settings page? Environment variables?
2. **Exact backoff intervals**: 1d→3d→1w→1m? Or should this be configurable too?
3. **Default radio lookahead**: 3? 5? What's sensible?
4. **Storage location**: Where on disk do local files live? XDG data dir? Configurable?
5. **Capacity eviction strategy**: When disk limit hit — evict oldest? Lowest quality? Least recently played?
6. **Review UI**: What does the 80-95% review queue look like? A simple list with play-both-and-compare?