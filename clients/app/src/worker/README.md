# Pyxis client worker API

The worker is the client data plane. A UI talks only to `WorkerClient` from `client.ts`; it
must not open IndexedDB, write Cache Storage, call sync RPCs, or invent merge rules itself.
The reference client is one consumer of this boundary, not part of it.

## Ownership

- One dedicated worker owns ProseQL over IndexedDB.
- Cache Storage owns complete offline media candidates.
- The service worker owns offline HTTP delivery and the application shell.
- The page owns rendering and browser audio confirmation.
- The core remains authoritative for account-scoped shared state.

A browser without Worker or IndexedDB receives an ephemeral client. Its `open()` report has
`ephemeral: true`, and `offlineOverview().available` is false. It must not promise offline
support.

## Opening and identity

Call `open()` first. `reason` is one of `created`, `opened`, `migrated`, or `reset`.
`settings()` returns the durable device/account grant. `writeSettings()` changes it.
Changing account is rejected while queued writes remain; a successful account change clears
all account-local albums, sessions, receipts, pins, media records, and media caches.

## Local reads

- `albums()`, `album(id)`
- `sessions()`, `session(id)`
- `offlineOverview()`

These read local state only. They never wait for the network.

## Sync and writes

`syncSessions()` pulls authoritative sessions before replaying queued session commands. It
uses the same receipts, recovery fingerprints, retry rules, account fences, and worker sync
queue as `sync()`, but does not read albums, push placements/listens, or resume offline-media
reconciliation. The report still counts unrelated retained intent as deferred. Use it for
transport/queue feedback; startup, reconnect gaps, library changes, and listen submission
continue to use full `sync()`. It is not a replacement for general offline recovery.

`sync()` pulls before pushing. Placement, listen, and session writes are queued locally
before they become visible. Retryable, auth, malformed, and uncertain failures preserve the
outbox. Permanent rejection is explicit and produces a durable notice.

A placement verdict reads pending intent and replaces the album under one refreshed,
account-fenced storage lock. A later local placement stays visible while its write remains
queued. Network requests run outside this lock. `deferred` counts all writes remaining at
the final locked outbox read, including writes added during sync and excluded domains.
It does not promise that no new write can arrive after that read.

- `queuePlacement(album, placement)`
- `queueListen(event)`
- `previewSessionCommand(sessionId, command, commandId)`
- `queueSessionCommand(session, command, commandId, expectedRevision)`
- `applySessionEvent(session)`

`applySessionEvent` applies one authoritative realtime session snapshot under one refreshed,
account-fenced storage lock. It preserves queued host intent and newer local revisions, handles
equal-revision reachability changes, and returns `{ status: "applied", session }` after storage.
It neither reads albums nor performs network sync, and does not remove unrelated sessions.
If local commands prevent application, it returns `{ status: "queued" }` without applying the
event. The caller must retain the event, wait for outstanding synchronization (or invoke
`sync()` for recovery), and retry before persisting its resume cursor. Do not treat a queued
result as success: an older in-flight command acknowledgement could otherwise overwrite the
event permanently. Abandon retries from retired connections without advancing their cursors.
Startup, dropped-history recovery, and command replay still use `sync()`.

A host previews a session command before touching audio. A durable receipt is checked before
renderer effects, stale state-machine commands fail early, and the expected revision closes
the gap between media confirmation and persistence.

## Offline albums

- `pinAlbum(albumId)` records durable pin intent and downloads every current track.
- `unpinAlbum(albumId)` removes retention intent but leaves bytes available until pressure
  evicts them.
- `resumeOffline()` restarts missing or interrupted work and probes pinned tracks for a new
  resolved candidate.
- `touchOfflineTrack(trackId)` updates LRU recency when playback opens a cached track.
- `clearOffline()` removes all local pins and media bytes.

A media row exists only after the complete response is verified and committed. The stream
response's `x-pyxis-candidate-id` selects the immutable cache object. A fidelity upgrade
therefore writes a new candidate, switches the track mapping, and removes the stale copy.
Storage pressure evicts unpinned least-recently-used tracks. Pinned and currently playing
tracks are retained.

## Offline HTTP

The service worker intercepts same-origin `/stream/:trackId` GETs. It follows the cached
track-to-candidate mapping and serves full or single-range responses from Cache Storage.
Requests carrying `x-pyxis-offline-refresh` bypass that cache so the download manager can
probe the core for fidelity upgrades.

The service worker also precaches the generated asset manifest. Navigations are
network-first with shell fallback; hashed assets are cache-first. New shell activation does
not touch the dedicated worker database.

## UI rules

- Render cached albums and sessions before connecting.
- Never clear a queued write because the network or response is uncertain.
- Show conflicts and dropped-write reasons.
- Do not report Playing until browser playback succeeds.
- Do not offer pinning when `offlineOverview().available` is false.
