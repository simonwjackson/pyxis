# Sonos Integration — Implementation Prompt

## Context

Pyxis is a music streaming daemon (Bun + Effect-TS + tRPC) that aggregates multiple music backends (Pandora, YouTube Music) into a unified catalog. It has a React web frontend and an audio stream proxy.

**Goal:** Add Sonos speaker support so Pyxis can cast audio to any Sonos speaker on the local network, with speaker selection built into the Pyxis UI.

## Current Architecture

```
Web Frontend (React, port 5678)
        ↓ tRPC
Backend Server (Bun, port 8765)
        ↓
Source Manager → Pandora / YouTube Music
        ↓
Audio Stream Proxy (/stream/:compositeTrackId)
        → Currently serves audio to the browser via HTML5 <audio>
```

**Key files:**
- `server/router.ts` — Combined tRPC router
- `server/services/` — Business logic (session, playback, stream, source manager)
- `server/routers/` — Route handlers by domain
- `src/sources/` — Source abstraction layer
- `src/web/` — React frontend (TanStack Router, tRPC client)
- `src/logger.ts` — Pino-based structured logging (`createLogger(name)`)

**Tech stack:** Bun, Effect-TS, tRPC, React, TanStack Router, Drizzle ORM (PGlite), Tailwind, Vite

**Patterns:**
- Effect-TS for all async/error handling (tagged errors, `Effect.gen`)
- Composite track IDs: `source:trackId` (e.g., `ytmusic:dQw4w9WgXcQ`)
- Structured JSON logging via pino to `~/.local/state/pyxis/`
- Config via layered YAML (`~/.config/pyxis/config.yaml`) + env vars

## Integration Approach: Local UPnP/HTTP Stream

The chosen approach is:

1. **Pyxis serves audio as an HTTP stream** (it already does this via `/stream/:compositeTrackId`)
2. **Discover Sonos speakers** on the LAN using UPnP/SSDP
3. **Command Sonos speakers** to play the stream URL via their local SOAP/UPnP API
4. **No cloud dependency** — everything stays on the local network / Tailscale

### Why This Approach

- Pyxis already proxies all audio — Sonos just needs a URL to play
- Local UPnP avoids Sonos cloud OAuth complexity
- Sonos natively supports HTTP audio streams
- Speaker grouping/volume is controlled via the same local API
- Fits the "Pyxis is the brain, speakers are outputs" philosophy from VISION.md

## Implementation Spec

### 1. Sonos Discovery Service

**File:** `server/services/sonos-discovery.ts`

Create a service that discovers Sonos speakers on the local network:

- Use SSDP (Simple Service Discovery Protocol) to find Sonos devices
  - Search target: `urn:schemas-upnp-org:device:ZonePlayer:1`
- Parse device description XML to extract:
  - Speaker name (room name)
  - UUID (unique identifier)
  - Group ID (which speakers are grouped together)
  - IP address and port
  - Model and capabilities
- Maintain a live cache of discovered speakers, refreshed periodically (every 30s)
- Expose an Effect-based API:

```typescript
// Conceptual interface
interface SonosSpeaker {
  readonly uuid: string
  readonly name: string        // Room name (e.g., "Living Room")
  readonly ip: string
  readonly port: number
  readonly groupId: string
  readonly isCoordinator: boolean  // Group coordinator controls playback
  readonly model: string
}

// Service interface
discoverSpeakers(): Effect<ReadonlyArray<SonosSpeaker>, SonosDiscoveryError>
getSpeakers(): Effect<ReadonlyArray<SonosSpeaker>, never>  // From cache
getSpeaker(uuid: string): Effect<SonosSpeaker, SonosNotFoundError>
```

**Libraries to evaluate:**
- Raw SSDP via `dgram` (Bun supports this) — more control, fewer deps
- `node-ssdp` — mature, but check Bun compatibility
- Consider writing a minimal SSDP client since the search is simple

### 2. Sonos Control Service

**File:** `server/services/sonos-control.ts`

Control playback on Sonos speakers via their local SOAP API:

- **Play a stream URL** on a specific speaker:
  - Set AVTransport URI to Pyxis stream URL
  - The URL must be reachable from the Sonos speaker (use the server's LAN IP, not localhost)
  - Content-Type must be correct for the audio format being proxied
- **Transport controls:** play, pause, stop, next, previous, seek
- **Volume:** get/set per speaker, get/set group volume
- **Grouping:** group/ungroup speakers
  - Sonos grouping works by telling a speaker to join another speaker's group
  - The group coordinator handles playback; members just sync
- **Playback state:** poll or subscribe to transport state changes

```typescript
// Conceptual interface
play(speakerUuid: string, streamUrl: string, metadata?: TrackMetadata): Effect<void, SonosControlError>
pause(speakerUuid: string): Effect<void, SonosControlError>
stop(speakerUuid: string): Effect<void, SonosControlError>
setVolume(speakerUuid: string, volume: number): Effect<void, SonosControlError>
getVolume(speakerUuid: string): Effect<number, SonosControlError>
joinGroup(speakerUuid: string, coordinatorUuid: string): Effect<void, SonosControlError>
leaveGroup(speakerUuid: string): Effect<void, SonosControlError>
getPlaybackState(speakerUuid: string): Effect<PlaybackState, SonosControlError>
```

**SOAP endpoints on Sonos devices:**
- AVTransport: `/MediaRenderer/AVTransport/Control` — play, pause, seek, set URI
- RenderingControl: `/MediaRenderer/RenderingControl/Control` — volume, mute
- ZoneGroupTopology: `/ZoneGroupTopology/Control` — group management

**DIDL-Lite metadata:** When setting the AVTransport URI, Sonos expects DIDL-Lite XML metadata for track info (title, artist, album art). Construct this from Pyxis's canonical track data.

### 3. Stream URL Resolution

**Problem:** The stream URL must be reachable from the Sonos speaker. `localhost:8765` won't work.

**Solution:**
- Detect the server's LAN IP address (the interface the Sonos speakers can reach)
- Construct stream URLs as `http://<lan-ip>:8765/stream/<compositeTrackId>`
- Add config option for explicit override: `server.externalUrl` in `config.yaml`

```yaml
# config.yaml addition
server:
  port: 8765
  hostname: localhost
  externalUrl: http://192.168.1.50:8765  # Optional: explicit URL for casting targets
```

### 4. tRPC Router

**File:** `server/routers/sonos.ts`

Add a Sonos router to the tRPC API:

```typescript
// Routes
sonos.speakers.list    // GET — list discovered speakers with current state
sonos.speakers.get     // GET — single speaker details
sonos.playTo           // POST — play current/specified track on speaker(s)
sonos.stop             // POST — stop playback on speaker(s)
sonos.pause            // POST — pause on speaker(s)
sonos.volume.get       // GET — volume for speaker
sonos.volume.set       // POST — set volume for speaker
sonos.group.join       // POST — add speaker to group
sonos.group.leave      // POST — remove speaker from group
```

Register in `server/router.ts` alongside existing routers.

### 5. Web Frontend — Speaker Picker

Add a speaker selection UI to the Pyxis web frontend:

**Component:** A cast/speaker button in the playback controls area that opens a speaker picker.

**Behavior:**
- Shows a list of discovered Sonos speakers with their room names
- Indicates which speakers are currently playing Pyxis audio
- Allows selecting one or multiple speakers
- Shows volume slider per speaker
- Groups are visually indicated
- Selecting a speaker immediately starts casting the current track
- Deselecting stops playback on that speaker

**States:**
- No speakers found → "No Sonos speakers found on network"
- Speakers found, none active → List with play buttons
- Active playback → Highlighted speakers with individual volume controls

**Design notes:**
- Use a popover/drawer triggered by a speaker icon in the player bar
- Follow existing UI patterns in the codebase (Tailwind, shadcn conventions)
- Mobile-friendly — this will be used on phones

### 6. Playback Coordination

When Pyxis is casting to Sonos, the playback service needs to coordinate:

- **Track advancement:** When a track ends, Pyxis must tell Sonos to play the next track URL
  - Option A: Poll Sonos transport state for "STOPPED" → trigger next track
  - Option B: Subscribe to Sonos UPnP events (SUBSCRIBE to AVTransport events)
  - Option B is preferred — less polling, faster response
- **Queue sync:** The Pyxis queue is the source of truth. Sonos doesn't manage its own queue — Pyxis feeds it track by track (or uses Sonos queue API to preload next)
- **Dual output:** Allow simultaneous browser + Sonos playback (user might want both)
- **Handoff:** Switching from browser to Sonos (or vice versa) should be seamless — continue from current position

### 7. Configuration

Add to `config.yaml` schema:

```yaml
sonos:
  enabled: true
  discoveryInterval: 30  # seconds between SSDP scans
  # externalUrl override handled by server.externalUrl above
```

Add corresponding env var: `PYXIS_SONOS_ENABLED`

Update `src/config.ts` to include the new schema fields.

## Error Types

Follow the existing tagged error pattern:

```typescript
// server/services/sonos-errors.ts
class SonosDiscoveryError extends Data.TaggedError("SonosDiscoveryError") { ... }
class SonosControlError extends Data.TaggedError("SonosControlError") { ... }
class SonosNotFoundError extends Data.TaggedError("SonosNotFoundError") { ... }
class SonosStreamError extends Data.TaggedError("SonosStreamError") { ... }
```

## Logging

Create a dedicated log file:
- `~/.local/state/pyxis/sonos.log` — discovery, control commands, errors
- Use `createLogger("sonos")` from `src/logger.ts`

## Testing Approach

- Unit test the DIDL-Lite metadata XML construction
- Unit test the SOAP envelope construction
- Mock SSDP responses for discovery tests
- Integration test with a real Sonos speaker (manual, not CI)

## Constraints

- **No cloud APIs.** Everything local UPnP/SOAP.
- **No new databases.** Speaker state is in-memory (ephemeral, re-discovered on startup).
- **Effect-TS everywhere.** All new service code uses Effect patterns.
- **Bun runtime.** Ensure all network code (UDP for SSDP, HTTP for SOAP) works under Bun.
- **Existing patterns.** Follow the conventions in AGENTS.md — structured logging, tagged errors, capability interfaces.

## Out of Scope (for now)

- Sonos cloud API / OAuth
- AirPlay output
- Snapcast integration
- Multi-user speaker access control
- Persistent speaker preferences (can add later — store preferred speakers per user in PGlite)

## Reference

- [Sonos UPnP API docs (unofficial)](http://www.ozhome.net/sonos/)
- [UPnP AV Transport spec](http://www.upnp.org/specs/av/UPnP-av-AVTransport-v1-Service.pdf)
- [DIDL-Lite XML format](http://www.upnp.org/specs/av/UPnP-av-ContentDirectory-v1-Service.pdf)
- [Sonos SOAP examples](https://github.com/SoCo/SoCo) (Python, but great API reference)
- [node-sonos](https://www.npmjs.com/package/sonos) (Node.js Sonos library — evaluate for Bun compat)
