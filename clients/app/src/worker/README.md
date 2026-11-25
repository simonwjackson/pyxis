# Pyxis client worker API

Pyxis supplies a headless data plane, not a player or an app shell. A host such as Vela,
Pyxamp, or an operator-supplied browser shell decides how to present sessions and when
to start playback. Browser hosts use `WorkerClient` from `client.ts` for local reads,
offline writes, and sync. Leave IndexedDB, Cache Storage, and merge rules to the worker.

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

## Lean-back: resume here or take over from another device

After `worker.open()`, use `createLeanBackClient(worker)` from `client.ts`. The two reads
are independent. Neither starts playback, moves a queue, nor creates a session.

- `resumeForDevice()` returns an Effect `Option<RpcSession>` from the local store. It works
  offline, including when the core last marked this device unreachable. It considers only
  sessions hosted by `settings().deviceId`: playing first, then newest `updatedAt`, then
  greatest `id` for a stable tie. `Some` contains the saved queue, cursor and `positionMs`,
  not a request to play. Once `worker.applySessionRetirement(id)` marks an ID retired, it
  is no longer eligible. No device ID or no matching session returns `None`.
- `takeoverCandidates()` requires the device grant. It reads the account's current
  `session.list`, not the cache. It returns other devices' reachable playing or paused
  sessions. Stopped, ended and core-hosted output sessions are not candidates. The core
  omits retired sessions. If the list cannot be read, the call rejects; that is not an
  empty list. A host can still use the local resume result.
- `handoff({ sessionId, targetSessionId })` is online and explicit. Pass the chosen remote
  session's ID as `sessionId` and an empty, reachable session on this device as
  `targetSessionId` (not a device ID). The helper returns the generated `SessionHandoffOutcome`.
  Only `ready` means the move succeeded: its `value` is the target snapshot. Surface any
  other status, such as `sourceUnreachable` or `targetBusy`, and handle rejected promises
  for transport, grant or protocol errors. Nothing is queued for later handoff. Reconcile
  via session events or `worker.syncSessions()` rather than rewriting the cached queues.

The host decides whether and when to offer either action. Network calls default to same-origin
`/rpc`. A host on another origin can pass `createSupportRpc(coreFetch)` from `../rpc/support`
as the factory's second argument; bind `coreFetch` to the intended Pyxis origin before use.

## Sync and writes

`syncSessions()` pulls authoritative sessions before replaying queued session commands. It
uses the same receipts, recovery fingerprints, retry rules, account fences, and worker sync
queue as `sync()`, but does not read albums, push listens, or resume offline-media
reconciliation. The report still counts unrelated retained intent as deferred. Use it for
transport/queue feedback; startup, reconnect gaps, library changes, and listen submission
continue to use full `sync()`. It is not a replacement for general offline recovery.

`sync()` pulls before pushing. Listen and session writes are queued locally
before they become visible. Retryable, auth, malformed, and uncertain failures preserve the
outbox. Permanent rejection is explicit and produces a durable notice.

Network requests run outside the account-fenced storage lock. `deferred` counts all writes
remaining at the final locked outbox read, including writes added during sync and excluded
domains. It does not promise that no new write can arrive after that read.

A session-command verdict does the same for sessions: it reads still-queued commands for that
session and replaces the session under one refreshed, account-fenced storage lock. Replay stops
at the first command the current state rejects, so one invalid later command cannot hide the
command that just succeeded. A command queued during an acknowledgement stays visible and
replays once instead of disappearing until the next sync. Verdict replay repairs missing
receipts before publishing the projection, so receipt failure cannot duplicate redelivery.
The retained journal repairs a later projection failure. Replay excludes commands with saved
terminal verdicts; their newest authoritative snapshot supplies the base when a pull fails.

Local settlement for sessions and listens has one owner in `sync-settlement.ts`,
behind `WorkerDatabase.settleOutbox`. It saves the server verdict in the existing opaque
outbox row, applies the projection, appends any deduplicated notice, and removes the write
last. Each phase finishes durable persistence before the next starts. Network calls remain
outside the lock. A local persistence failure reports `failure`, keeps recovery evidence,
and never becomes a server rejection or network outage. Failed attempt recording is also
retryable. If the first verdict save fails, replay uses the original command or listen ID.

After reopen, a saved verdict resumes without repeating the RPC. A fresh authoritative
snapshot can supersede its projection, but not erase its historical rejection
notice. Notices retain their existing IDs and newest-100 bound. The optional recovery field
needs no schema migration. Separate files remain non-atomic across a crash, and settlement
adds an outbox save before the existing writes.

Full album pulls batch storage writes under the existing refreshed, account-fenced Web Lock.
Albums commit first, then offline pins and media relationships. Both batches finish before
sync acknowledges them. Separate files are not crash-atomic together. A retry repairs offline
relationships from retained album state, even when album revisions already match. Newer local revisions remain protected. This does not change the worker schema.

- `queueListen(event)`
- `previewSessionCommand(sessionId, command, commandId)`
- `queueSessionCommand(session, command, commandId, expectedRevision)`
- `applySessionEvent(session)`

`applySessionEvent` applies one authoritative realtime session snapshot under one refreshed,
account-fenced storage lock. It preserves queued host intent and newer local revisions, handles
equal-revision reachability changes, and returns `{ status: "applied", session }` after storage.
It neither reads albums nor performs network sync, and does not remove unrelated sessions.
If local commands prevent full application, it returns `{ status: "queued", timerProjection? }`.
The worker applies the core-owned timer immediately, without changing queued playback commands.
If `timerProjection` is present, give that host session to the renderer now. The caller must retain the event, wait for outstanding synchronization (or invoke
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
- Show dropped-write reasons and update blockers.
- Do not report Playing until browser playback succeeds.
- Do not offer pinning when `offlineOverview().available` is false.


## Wire v4 and playback modes

Generated `RPC_CONTRACT_ID` is `pyxis-rpc-v4`. Worker HTTP writes carry it as
`x-pyxis-contract`. Repeat (`off/all/one`), reversible shuffle and `queueOrder` belong to
session truth. Queue occurrence ordinals keep duplicate track IDs separate. Do not drop
these fields in a view adapter. The shared confirmed host applies seek and natural-end
renderer effects before `queueSessionCommand` commits their receipts.

Persisted current-v2 sessions default repeat off/shuffle false without losing queue/cursor.
Interrupted result fingerprints compare those same defaults; an old optimistic queue add
must not be applied twice just because the session gained mode fields. No schema reset is
needed for opaque bodies. Album tags pass through library snapshots. Organization policy lives outside Pyxis.

A pending current-v2 one-shot shuffle remains unchanged in the outbox and blocks session
replay with an explicit failure. It is not a public command in v4. Drain such intent with
matching v2 clients/service before deployment. Never clear storage or manufacture a new
mode command under the old receipt. See `docs/operations/2026-10-24-pyxamp-support-update.md`.

Unknown persisted outbox commands remain unchanged and report an explicit update blocker.
Before updating, use the matching client/service to drain obsolete intent. This includes
removed album commands. No conversion discards or invents pending offline writes.

### Sleep timer

Read `session.sleepTimer` from the worker's cached host session. `deadline` is an absolute
RFC 3339 time; `fadeSeconds` is zero for no fade. Set or replace it through the online
`session.command.send sleep.set` operation; use `sleep.cancel` to disarm. Do not enqueue
relative timer intent for offline replay. The headless playback host uses
this snapshot without a network round trip. It schedules a renderer fade/cutoff, then
confirms `transport.stop {sleepTimerId}` under command ID `sleep:<id>` in the worker
outbox. Redelivering that ID cannot stop later playback. The fade is a gain adjustment,
not a series of session volume commands. A fully frozen browser cannot execute JS or
write a receipt: the native audio clock silences audio, and the host reports on wake.
Without a running Web Audio context the host uses wall-clock and media/lifecycle events.

Third-party hosts can import `sleepSchedule(session, nowMs)` from
`clients/app/src/worker/sleep-schedule.ts`. The function has no DOM, timer, or network
dependency. Pass the latest worker session, not the raw socket payload. On each update,
replace the previous schedule. `disarmed` means cancel all callbacks and restore normal
gain. `armed` gives `gain` (0–1), `remainingMs`, `fadeStartInMs` and `fadeMs`; apply
gain to the session volume, not to the already-faded volume. Recheck at fade start,
during the fade and on wake. Before acting on `stop`, reread the session and check the
timer identity. Stop the renderer, restore `restoreVolume` (0–100), and queue the returned
`command` with its `commandId`, exactly as for the core directive. A retry uses the same
receipt. Do not let an old callback or receipt stop a newly started session.
