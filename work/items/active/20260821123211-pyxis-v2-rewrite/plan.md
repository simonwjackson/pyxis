---
title: "Pyxis v2: account-scoped music service with plugin sources and offline clients"
type: feat
status: active
date: 2026-08-21
verify_command: "just verify"
---

# Pyxis v2: account-scoped music service with plugin sources and offline clients

## Summary

Rebuild Pyxis from nothing as a Rust core service that owns accounts, library, playback
sessions, matching, and sync, with every music provider moved out to a TypeScript plugin
that talks a documented wire protocol. Clients are offline-first and read through a
headless worker data plane. The visual interface is explicitly not built here.

---

## Session Resumption Protocol

This plan is executed across a long session that will compact many times. Conversation
history is not durable. This document is.

On resuming with no memory of prior turns:

1. Read this document top to bottom. It is self-contained.
2. Treat every entry in `Decision Log` as settled. Do not re-litigate. If a decision
   looks wrong, raise it with the user rather than quietly changing course.
3. Run `git log --oneline -20`. Landed commits are the only truth about progress.
4. Read `work.md` for the current phase pointer.
5. Resume at the lowest-numbered unit whose commit does not exist.

When implementation contradicts the plan, edit the plan in the same commit that
contradicts it, and note the change in the commit body. A stale plan is worse than no plan.

---

## Problem Frame

Pyxis v1 works but has three structural faults that cannot be fixed incrementally.

State ownership is inverted. Mutable singletons hold player and queue truth, and a
persistence layer tries to save and rehydrate them. Eight of the most recent commits on
`legacy` fix restore, recovery, or stale-state bugs. `ARCHITECTURE.md` on `legacy`
describes its own playback authority modules as "intentional transitional adapters".

Provider code is welded into the core. Pandora and YouTube Music are compiled in, so the
service cannot start without them, cannot be extended without a core change, and cannot
be extended by anyone else at all.

The browser is both remote control and audio sink. The server filters "non-owner audio
timing events" after the fact, and the client carries a 394-line reconciliation module
plus a volume command queue to paper over the ambiguity.

v2 targets a different identity: the core is an account-scoped music state machine, and
everything provider-shaped lives at the edge behind a plugin protocol.

---

## Requirements

- R1. Big-bang v1 replacement. No strangler pattern, no parallel operation, no shared code.
- R2. Zero v1 compatibility. No old data formats, id formats, wire shapes, or compat constants.
- R3. Multi-account. An account named `default` works with no setup on first boot.
- R4. Every source is a third-party plugin. The core runs and serves with zero plugins installed.
- R5. Console mode is first-class: a device can control another device's playback.
- R6. A session is a first-class object hosted by a device.
- R7. Offline support for library browsing, downloaded playback, queue edits, listen
  logging, settings, and bookmarks, with replay on reconnect.
- R8. Soulseek raises fidelity of library tracks in the background, is never visible in
  any client, and never uploads.
- R9. yt-dlp updates on a nightly timer.
- R10. The RPC API is designed for third-party clients, not only the first-party app. Not REST.
- R11. Rust core, TypeScript plugins.
- R12. Install via `nix profile` and `systemctl --user`. NixOS module comes later.
- R13. Visual design is out of scope. Deliver the service, the protocol, the client data
  plane, and a deliberately ugly reference client.
- R14. Legacy data import is ephemeral tooling that is deleted once used.

---

## Scope Boundaries

- No visual design, layout, component library, styling, or interaction polish.
- No Android client. The v1 Android kiosk and its server-side media bridge are dropped entirely.
- No NixOS module in v1.
- No Soulseek uploading, sharing, or ratio management.
- No Soulseek playlist pre-fetching in v1. Library tracks only.
- No cross-device audio streaming. Console sends commands; the host device renders audio.
- No REST resource routes. Media bytes over plain HTTP are the only non-RPC surface.

### Deferred to Follow-Up Work

- NixOS module, replacing the `nix profile` install.
- Soulseek optimistic pre-fetch for Pandora and YouTube Music playlist tracks (R8 "eventually").
- Metadata enricher plugins (MusicBrainz, Discogs). The enricher capability class is
  designed in U7 but no enricher ships in v1. `VISION.md` marks Enrichment accordingly.
- Chromecast and AirPlay output plugins. The output capability class makes them possible.
- **Weekly Mix.** A first-class `VISION.md` feature that this plan does not build. It needs
  upstream recommendations, which now arrive through source plugins, so it cannot precede
  Phase 3. The listen events and placement data it depends on are recorded from U8 and U9
  onward, so deferring it loses no history. `VISION.md` carries a matching status note.
- Album-level neglect detection and time-travel history views. The append-only log in U9
  makes both pure projections, but neither is built in v1.

---

## Decision Log

Settled. Do not re-open without the user asking.

| ID | Decision | Rationale |
|---|---|---|
| D1 | Rust core, TypeScript plugins | The plugin boundary is a wire protocol, not a language binding, so the two languages are independent choices. Rust gives native ProseQL crates, a single static binary, and systemd hardening. TypeScript keeps plugin authoring in the user's comfort zone and avoids porting Pandora and Sonos |
| D2 | Plugins are out-of-process subprocesses over stdio JSON | Crash isolation, language independence, and a protocol that third parties can implement |
| D3 | Sessions are first-class objects hosted by a device | Reconciles R6 with R7. A disconnected device runs its own session. A console attaches to a session it can see. Handoff between devices is explicit, never automatic |
| D4 | Sonos is an output plugin, not core | Outputs are a plugin capability class, which makes Chromecast and AirPlay possible later without core changes |
| D5 | The listen log is append-only events; history and hot albums are projections | Append-only merges trivially across offline devices. Replay replaces the entire v1 restore-and-rehydrate bug class |
| D6 | Track identity and matching live in core; MBIDs are optional enrichment | R4 requires the core to work with zero plugins, so core identity cannot depend on a plugin-supplied id space |
| D7 | Realtime is WebSocket | Console mode needs low-latency bidirectional command and state flow. Revision polling alone cannot serve R5 |
| D8 | Media bytes never cross the plugin stdio boundary | Plugins return a URL plus headers, or a local file path. The core does all fetching and caching |
| D9 | No auth until a second account exists; the first device claims `default` | Satisfies R3 zero-friction boot. Cost: on a shared tailnet, the first caller wins |
| D10 | Soulseek never uploads | User decision. Cost: many peers refuse download-only clients, so expect long queues and a low hit rate. The plugin is designed to be patient, not fast |
| D11 | Legacy import is an external ephemeral tool emitting a re-acquisition manifest | Honors R2 and R14. The 371 v1 albums are re-resolved through plugins as if added by hand. Old source-ref bindings are discarded deliberately |
| D12 | Monorepo, separate flake output per plugin | Fast iteration while plugins still only speak the public protocol, which keeps the third-party contract honest |
| D13 | `nix profile` plus `systemctl --user` for v1 | Matches the reference projects and iterates faster than a system rebuild. NixOS module deferred |
| D14 | The Rust contract module is the protocol source of truth, with typeshare and schemars codegen | One definition produces TypeScript types and a JSON Schema. The schema is the runtime trust boundary, mirroring the reference projects |
| D15 | The core owns a local media store and local-file playback | Soulseek downloads are local files, so local playback is a core capability rather than a plugin concern |
| D16 | The client worker data plane is in scope; the UI above it is not | Offline correctness is a distributed-systems problem, not a design problem. The design model consumes a documented worker API |

---

## Context & Research

### Verified findings from the v1 system

- v1 data lives at `/var/lib/pyxis/pyxis/db/` under a systemd `DynamicUser`, so reading it
  requires sudo. Contents: `albums.yaml` (371 albums), `album-tracks.yaml`,
  `album-source-refs.yaml`, `listen-log.jsonl` (107 events), plus ephemeral runtime state.
  Total 2.1 MB.
- **There are no recorded Pandora fixtures.** The v1 `.gitignore` excludes `fixtures/*.json`
  because they contain auth tokens, and the fixture directory does not exist on disk. v1's
  fixture-replay tests cannot be inherited. Fixtures must be re-recorded against a live
  account. This corrects an earlier assumption that recorded fixtures would de-risk the work.
- Sonos test captures **are** inheritable. The SOAP envelopes are inline string literals in
  v1 test sources (`git show legacy:server/sonos/soap.test.ts`), not external files.
- v1 already used a `client-mode-signing-key` for console identity, which is prior art for
  device tokens in U6.
- The NixOS wiring for v1 has already been removed from the `mountainous` repository.

### Reference architecture

Two sibling projects solve the same shape and should be read before implementing.

- `~/code/sandbox/ossicle` — offline-first listening library. Rust axum core linking
  `proseql-engine` and `proseql-native`; protocol owned by `services/ossicle/src/rpc/contract.rs`
  with typeshare and schemars codegen; PWA running ProseQL wasm inside a service worker over
  IndexedDB via `@proseql/browser/worker`; per-record revision plus deviceId sync with explicit
  conflict outcomes; a pure offline storage policy with pressure thresholds and LRU eviction.
- `~/code/sandbox/comics` — the same skeleton one generation earlier.

Patterns to lift directly: the contract generation script and its `--check` mode, the
worker/contract split that separates data plane from views, the offline policy module shape,
and the instance lock.

### External libraries

- `soulseek-ts` (jgchk) is a typed promise-based Node Soulseek client and is the intended
  base for U19. Quality and maintenance are **not yet audited**. `slsk-client` is stale.
- Rust-side Soulseek options were not fully surveyed (the search was rate-limited). Since
  D1 puts plugins in TypeScript, this does not block.

---

## High-Level Technical Design

> Directional guidance for review, not implementation specification.

```
  Clients                PWA (ugly reference client in v1)   third-party apps
                                    │
        RPC over HTTP (tagged unions) │ WebSocket (realtime) │ plain HTTP (media bytes)
                                    ▼
  ┌──────────────────────────── Core service (Rust) ────────────────────────────┐
  │  rpc/          contract, dispatch, transport                                 │
  │  accounts/     accounts, devices, pairing, tokens                            │
  │  sessions/     session objects, playback state machine, console routing      │
  │  library/      albums, tracks, placements, bookmarks, playlists              │
  │  listen/       append-only event log, projections (history, hot albums)      │
  │  media/        candidates, fidelity policy, local media store                │
  │  matching/     cross-source recording identity                               │
  │  stream/       proxy and byte cache                                          │
  │  sync/         per-domain revisions, conflict outcomes                       │
  │  plugins/      subprocess supervision, handshake, capability registry        │
  └──────────────────────────────────┬──────────────────────────────────────────┘
                    plugin protocol over stdio (JSON, line-delimited)
     ┌──────────────┬─────────────────┼──────────────────┬──────────────────┐
     ▼              ▼                 ▼                  ▼                  ▼
  pandora        ytmusic            sonos             soulseek         (enrichers,
  source         source            output            provider          deferred)
```

### Capability classes

| Class | Contributes | v1 plugins |
|---|---|---|
| `source` | search, album, playlist, radio, stream resolution | pandora, ytmusic |
| `output` | playback target discovery, transport, volume | sonos |
| `provider` | background media acquisition, no UI presence | soulseek |
| `enricher` | metadata augmentation | none in v1 |

### Session and console model

A session is `{ id, accountId, hostDeviceId, queue, cursor, transport, positionMs, volume, outputRef }`.

- The host device owns transport truth for its session.
- A console sends a command addressed to a session id. The core routes it to the host
  device over WebSocket, the host applies it, then state fans out to subscribers.
- Sonos sessions are hosted by the core itself through the sonos output plugin, so they
  play with no browser present.
- An offline device keeps running its session locally. It is not console-visible while
  offline, and its listen events merge on reconnect.
- Handoff is an explicit command that moves queue and cursor to another device.

This is what removes the v1 ownership ambiguity: there is exactly one host per session,
and commands are addressed rather than broadcast.

### Sync domains

| Domain | Direction | Merge rule |
|---|---|---|
| listen events | client to server, batched | Append-only, ULID event ids, idempotent replay |
| album placements, bookmarks, feedback | two-way | Per-record revision plus deviceId, explicit conflict outcome |
| settings | two-way | Per-record revision, account and device scopes |
| sessions | host authoritative | Commands, not state merge |
| tracks, candidates, stations | server to client | Server wins, snapshot plus revision gate |
| credentials, media files, byte cache | server only | Never leaves the server |

---

## Output Structure

```
services/pyxis/              Rust core
  src/
    rpc/                     contract.rs, dispatch.rs, transport.rs
    accounts/  sessions/  library/  listen/  media/  matching/  stream/  sync/
    plugins/                 host.rs, protocol.rs, registry.rs, supervisor.rs
    db/                      schema.rs, store.rs
  generate-contracts.sh
services/pyxis-tsnet/        tailnet edge
contracts/generated/         pyxis.ts, pyxis.schema.json  (read-only artifacts)
packages/plugin-sdk/         TypeScript plugin SDK
plugins/
  pandora/  ytmusic/  sonos/  soulseek/
clients/app/
  src/worker/                store, sync, offline policy, download manager
  src/rpc/                   validated network client
  src/pwa/                   service worker, registration
  src/reference/             deliberately ugly reference views
tools/import-legacy/         ephemeral, deleted in U27
nix/                         packaging, systemd user units
```

---

## Implementation Units

### Phase 0 — Foundation

#### U1. Repo skeleton, flake, dev shell, verify gate

**Goal:** A buildable empty repo with one command that gates everything downstream.

**Requirements:** R11, R12

**Dependencies:** None

**Files:**
- Create: `flake.nix`, `justfile`, `rust-toolchain.toml`, `package.json`, `services/pyxis/Cargo.toml`, `services/pyxis/src/main.rs`, `services/pyxis/src/lib.rs`

**Approach:**
- Flake dev shell provides rust toolchain, bun, and the ProseQL crates.
- Vendor ProseQL the same way ossicle does, via a pinned path dependency.
- `just verify` runs Rust tests, TypeScript typecheck, lint, and contract `--check`.
  It is empty-but-passing at this stage and grows with each unit.
- Core binds `127.0.0.1` by default. The tailnet edge is a separate process.

**Test scenarios:**
- Happy path: `just verify` exits zero on a clean checkout.
- Happy path: `nix build` produces a runnable binary that starts and exits cleanly.

**Verification:** `just verify` and `nix build` both succeed from a clean clone.

---

#### U2. Protocol contract and codegen pipeline

**Goal:** One Rust definition generating TypeScript types and a JSON Schema.

**Requirements:** R10, R2

**Dependencies:** U1

**Files:**
- Create: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/rpc/mod.rs`, `services/pyxis/generate-contracts.sh`, `contracts/generated/pyxis.ts`, `contracts/generated/pyxis.schema.json`, `contracts/README.md`

**Approach:**
- Requests and responses are tagged unions. Every operation returns an explicit outcome
  enum rather than throwing, following the ossicle `*Outcome` pattern.
- Naming is `entity.concept.action`, carried forward from v1 as the one deliberate
  continuity: it is good naming, not a compatibility surface.
- Start with a minimal slice: `system.status.get` and `account.list`. The contract grows
  per unit rather than being written up front.
- `--check` mode fails when committed artifacts drift from Rust.

**Test scenarios:**
- Happy path: generating twice produces byte-identical artifacts.
- Error path: editing `contracts/generated/pyxis.ts` by hand makes `--check` fail.
- Integration: a TypeScript file importing the generated types typechecks.

**Verification:** `services/pyxis/generate-contracts.sh --check` passes in `just verify`.

---

#### U3. Storage layer and account-scoped data model

**Goal:** ProseQL-backed persistence where every domain record is account-scoped.

**Requirements:** R3, R2

**Dependencies:** U1

**Files:**
- Create: `services/pyxis/src/db/schema.rs`, `services/pyxis/src/db/store.rs`, `services/pyxis/src/db/mod.rs`

**Approach:**
- Collections: accounts, devices, sessions, albums, tracks, track_candidates, playlists,
  stations, bookmarks, feedback, listen_events, settings, plugin_credentials, media_files.
- Account id is part of every domain key. There is no global scope except the account list.
- Every syncable record carries `revision` and `updatedBy` (device id) from the start;
  retrofitting these later is far more expensive.
- State root is `$XDG_DATA_HOME/pyxis`, matching D13.

**Test scenarios:**
- Happy path: write and read back a record in each collection.
- Edge case: two accounts holding same-named albums do not collide.
- Edge case: reopening the store preserves all records.
- Error path: a corrupt store file surfaces a typed error instead of panicking.

**Verification:** Store round-trips every collection, and account isolation holds under test.

---

### Phase 1 — Core spine

#### U4. RPC transport and dispatch

**Goal:** One HTTP endpoint dispatching the tagged-union protocol.

**Requirements:** R10

**Dependencies:** U2, U3

**Files:**
- Create: `services/pyxis/src/rpc/dispatch.rs`, `services/pyxis/src/rpc/transport.rs`, `services/pyxis/src/api.rs`
- Modify: `services/pyxis/src/main.rs`

**Approach:**
- Single `POST /rpc` endpoint plus `GET /healthz`.
- Unknown request tags fail closed with a typed error rather than a generic 400.
- Uniform failure envelope across every operation.
- Instance lock so a second process cannot corrupt the store, lifted from ossicle.

**Test scenarios:**
- Happy path: `system.status.get` returns a well-formed response.
- Error path: an unknown tag returns the typed unknown-operation failure.
- Error path: a malformed body returns a typed parse failure, not a panic.
- Integration: a second process fails to start while the lock is held.

**Verification:** `/rpc` serves the U2 slice and `/healthz` returns 200.

---

#### U5. Realtime channel

**Goal:** WebSocket transport carrying state fan-out and addressed commands.

**Requirements:** R5, R10

**Dependencies:** U4

**Files:**
- Create: `services/pyxis/src/rpc/realtime.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/api.rs`

**Approach:**
- Subscribe and unsubscribe by topic, scoped to the caller's account.
- Message shapes live in the same contract as RPC, so third parties get generated types
  for realtime too.
- Reconnect uses a resume token so a brief drop does not lose state.

**Test scenarios:**
- Happy path: a subscriber receives an event published on its topic.
- Edge case: an account only receives its own account's events.
- Error path: an unauthenticated socket is closed with a typed reason.
- Integration: reconnect with a resume token replays missed state.

**Verification:** Two clients on one account see each other's published state.

---

#### U6. Accounts, devices, pairing, tokens

**Goal:** Multi-account identity with a zero-setup `default` account.

**Requirements:** R3, R10

**Dependencies:** U4

**Files:**
- Create: `services/pyxis/src/accounts/mod.rs`, `services/pyxis/src/accounts/tokens.rs`, `services/pyxis/src/accounts/pairing.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- On first boot with no accounts, `default` is created automatically.
- While exactly one account exists, an unpaired caller is auto-adopted into it and issued
  a device token. Once a second account exists, pairing becomes explicit (D9).
- Pairing codes are short-lived and issued by an already-paired device.
- API tokens for third-party clients are per-account, scoped, and revocable (R10).

**Test scenarios:**
- Happy path: first boot creates `default` and the first caller receives a device token.
- Happy path: an API token authenticates a non-browser client.
- Edge case: creating a second account stops auto-adoption for new devices.
- Edge case: existing device tokens keep working after a second account appears.
- Error path: an expired pairing code is rejected.
- Error path: a revoked token is rejected on the next call.

**Verification:** A fresh install serves an authenticated request with zero configuration.

---

#### U7. Plugin host and capability registry

**Goal:** Supervise plugin subprocesses and route capability calls, with none installed being valid.

**Requirements:** R4, R11

**Dependencies:** U4

**Files:**
- Create: `services/pyxis/src/plugins/protocol.rs`, `services/pyxis/src/plugins/host.rs`, `services/pyxis/src/plugins/supervisor.rs`, `services/pyxis/src/plugins/registry.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- Discovery scans a plugins directory and `pyxis-plugin-*` on PATH, so `nix profile add`
  of a plugin makes it appear without a core change.
- Handshake declares name, version, protocol version, capability classes, and a config schema.
- Protocol version mismatch refuses the plugin with a typed reason rather than degrading.
- Supervisor restarts crashed plugins with backoff, and quarantines a plugin that crashes
  repeatedly instead of restart-looping.
- `plugin.list` exposes live plugins and capabilities so clients can adapt (R10).
- Capability calls have per-call timeouts. A hung plugin fails one call, not the core.

**Test scenarios:**
- Happy path: a plugin declaring `source` is registered and appears in `plugin.list`.
- Edge case: with zero plugins installed, the core starts and serves every non-source operation.
- Edge case: two plugins declaring the same capability are both callable and distinguishable.
- Error path: a plugin with a mismatched protocol version is refused with a typed reason.
- Error path: a plugin that exits mid-call fails that call and restarts.
- Error path: a plugin crashing repeatedly is quarantined rather than restart-looped.
- Error path: a plugin exceeding its call timeout returns a typed timeout.

**Verification:** The core boots, serves, and reports honestly with zero plugins present.

---

### Phase 2 — Core domain

#### U8. Library domain

**Goal:** Albums, tracks, placements, bookmarks, and playlists as account-scoped records.

**Requirements:** R3, R7

**Dependencies:** U3, U6

**Files:**
- Create: `services/pyxis/src/library/mod.rs`, `services/pyxis/src/library/albums.rs`, `services/pyxis/src/library/placement.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- Placements are Discovery, Collection, Archive, Dismissed, carried from `VISION.md`.
- Albums enter only through an explicit add, from any surface.
- Album and track ids are internal and opaque. Plugin-supplied ids live in a separate
  candidate reference, never as primary identity (D6).

**Test scenarios:**
- Happy path: adding an album lands it in Discovery.
- Happy path: placement transitions persist and bump the record revision.
- Edge case: adding the same album twice does not duplicate it.
- Edge case: removing an album leaves its listen events intact.

**Verification:** Library operations round-trip and revisions increment correctly.

---

#### U9. Listen log and projections

**Goal:** Append-only listen events with derived history and hot albums.

**Requirements:** R7

**Dependencies:** U8

**Files:**
- Create: `services/pyxis/src/listen/mod.rs`, `services/pyxis/src/listen/events.rs`, `services/pyxis/src/listen/projections.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- Events carry ULID ids so client-generated events replay idempotently (D5).
- Batch append mirrors ossicle's mark-played-many shape, since offline devices submit runs.
- Hot albums project from a configurable recent-listen window.
- Projections rebuild from the log, so a projection schema change needs no migration.

**Test scenarios:**
- Happy path: appending events updates history.
- Happy path: hot albums reflect the configured window and threshold.
- Edge case: replaying the same batch twice changes nothing.
- Edge case: out-of-order events by timestamp still project correctly.
- Integration: deleting and rebuilding projections reproduces identical output.

**Verification:** Idempotent replay holds under a property test.

---

#### U10. Matching engine

**Goal:** Decide whether two media items are the same recording.

**Requirements:** R8, R4

**Dependencies:** U8

**Files:**
- Create: `services/pyxis/src/matching/mod.rs`, `services/pyxis/src/matching/score.rs`, `services/pyxis/src/matching/overrides.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- Pure scoring over artist, title, album, and duration with a tolerance band.
- Returns a confidence score plus a decision band, never a bare boolean, because U11 and
  U19 need to refuse ambiguous matches rather than guess.
- No plugin dependency, per D6.
- Manual overrides are persistent and always beat the scorer. `VISION.md` calls the ability
  to split a wrong merge critical, because automated matching will get it wrong. A split is
  a durable negative assertion ("these two are not the same recording"), so re-running the
  matcher can never silently re-merge them.
- Overrides sync like any other account record, so a correction made on one device holds
  everywhere.

**Test scenarios:**
- Happy path: identical metadata scores at the top of the range.
- Happy path: splitting a wrongly merged pair separates them and survives a re-run.
- Happy path: a manual merge of two items the scorer rejected holds.
- Edge case: remaster and live variants score below the auto-accept band.
- Edge case: featured-artist and punctuation differences still match.
- Edge case: a duration difference beyond tolerance drops the score below acceptance.
- Edge case: a split pair stays split after new candidates arrive for either side.
- Error path: missing duration degrades confidence rather than erroring.

**Verification:** A fixture table of real-world title variants classifies as expected, and
a manual split cannot be undone by the automatic matcher.

---

#### U11. Media store, candidates, and fidelity resolution

**Goal:** Multiple playable candidates per track, with the best one chosen automatically.

**Requirements:** R8 (see D15 for local-file playback in core)

**Dependencies:** U10

**Files:**
- Create: `services/pyxis/src/media/mod.rs`, `services/pyxis/src/media/candidates.rs`, `services/pyxis/src/media/fidelity.rs`, `services/pyxis/src/media/store.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- A candidate is either a plugin-resolvable reference or a local file in the media store.
- Fidelity ranks lossless above lossy, then bitrate, then sample rate.
- Resolution picks the best available candidate at play time, so an upgrade takes effect
  without touching the library record.
- Local files carry checksums and a byte budget with LRU eviction.

**Test scenarios:**
- Happy path: adding a higher-fidelity candidate changes what resolution returns.
- Edge case: with no candidates, resolution returns a typed unavailable outcome.
- Edge case: a local candidate is preferred over a remote one at equal fidelity.
- Edge case: eviction removes the least recently used file and never the pinned one.
- Error path: a checksum mismatch quarantines the file instead of serving it.

**Verification:** Fidelity ordering and eviction hold under unit test.

---

#### U12. Sessions and playback state machine

**Goal:** Device-hosted session objects with a single owner for transport truth.

**Requirements:** R5, R6, R7

**Dependencies:** U5, U8

**Files:**
- Create: `services/pyxis/src/sessions/mod.rs`, `services/pyxis/src/sessions/machine.rs`, `services/pyxis/src/sessions/queue.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`

**Approach:**
- Exactly one host device per session. Position reports from any other device are rejected
  by the protocol, which is what removes the v1 non-owner-timing bug class.
- Queue operations are session-scoped: add, remove, clear, shuffle, cursor jump.
- Transport states are explicit: Stopped, Playing, Paused, Ended.
- Stream URLs are resolved at play time and re-resolved on expiry, so there is no
  persisted-URL recovery subsystem.

**Test scenarios:**
- Happy path: transport transitions follow the state machine.
- Happy path: queue edits persist and survive a restart.
- Edge case: a position report from a non-host device is rejected.
- Edge case: a session whose host disconnects is marked unreachable, not destroyed.
- Error path: an expired stream URL triggers re-resolution rather than a failure.

**Verification:** Only the host device can move transport state.

---

#### U13. Console control and handoff

**Goal:** One device drives another device's session.

**Requirements:** R5, R6

**Dependencies:** U12

**Files:**
- Create: `services/pyxis/src/sessions/console.rs`, `services/pyxis/src/sessions/handoff.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/rpc/realtime.rs`

**Approach:**
- `session.list` shows reachable sessions on the account.
- A console command is addressed to a session id, routed to the host over WebSocket,
  applied by the host, then fanned out.
- Handoff moves queue and cursor to a target device explicitly.
- Commands to an unreachable session return a typed outcome rather than queueing silently.

**Test scenarios:**
- Happy path: a console pause stops audio on the host device.
- Happy path: handoff moves queue and cursor and leaves the source session empty.
- Edge case: two consoles driving one session both observe the same resulting state.
- Edge case: an offline host's session is absent from `session.list`.
- Error path: commanding an unreachable session returns a typed unreachable outcome.
- Integration: a Sonos session is controllable with no browser present.

**Verification:** A console device changes playback on a separate host device.

---

#### U14. Stream proxy and byte cache

**Goal:** Serve audio bytes over plain HTTP with caching and range support.

**Requirements:** R7, R10

**Dependencies:** U11

**Files:**
- Create: `services/pyxis/src/stream/mod.rs`, `services/pyxis/src/stream/cache.rs`, `services/pyxis/src/stream/proxy.rs`
- Modify: `services/pyxis/src/api.rs`

**Approach:**
- `GET /stream/:trackId` resolves the best candidate (U11), then serves from the local
  media store or proxies the upstream URL supplied by a plugin (D8).
- Range requests are supported, which Sonos requires.
- Cache and fetch pipeline are separate modules. v1 tangled them into one 1328-line file.

**Test scenarios:**
- Happy path: a full-file request returns the correct bytes and content type.
- Happy path: a range request returns 206 with correct bounds.
- Edge case: two concurrent requests for one uncached track fetch upstream once.
- Edge case: a local candidate is served without any upstream call.
- Error path: an upstream failure returns a typed error, and no partial file is cached.

**Verification:** Range and concurrent-fetch behavior hold under integration test.

---

### Phase 3 — Plugins

#### U15. TypeScript plugin SDK

**Goal:** Writing a plugin is implementing a few typed functions.

**Requirements:** R4, R11, R10

**Dependencies:** U7

**Files:**
- Create: `packages/plugin-sdk/package.json`, `packages/plugin-sdk/src/index.ts`, `packages/plugin-sdk/src/protocol.ts`, `packages/plugin-sdk/src/capabilities.ts`, `packages/plugin-sdk/src/testing.ts`, `packages/plugin-sdk/README.md`

**Approach:**
- Types derive from `contracts/generated/pyxis.ts`, so the SDK cannot drift from the core.
- The SDK owns the stdio loop, framing, handshake, and error mapping. A plugin author
  writes capability functions and a manifest, nothing else.
- Ship a conformance harness so a plugin can be tested with no core running. This is what
  makes the third-party claim real rather than aspirational.

**Test scenarios:**
- Happy path: a minimal plugin built on the SDK completes a handshake.
- Edge case: a plugin declaring multiple capability classes registers all of them.
- Error path: a capability throwing returns a typed failure instead of killing the process.
- Error path: malformed input from the core is rejected without crashing.
- Integration: the conformance harness passes against a reference plugin.

**Verification:** A plugin authored only against the SDK runs under the real host.

---

#### U16. Pandora plugin

**Goal:** Pandora search, albums, playlists, stations, and stream resolution as a plugin.

**Requirements:** R4, R8

**Dependencies:** U15

**Files:**
- Create: `plugins/pandora/package.json`, `plugins/pandora/src/index.ts`, `plugins/pandora/src/crypto.ts`, `plugins/pandora/src/api.ts`, `plugins/pandora/src/stations.ts`, `plugins/pandora/fixtures/.gitkeep`

**Approach:**
- Reimplement the Blowfish ECB handshake and syncTime offset against the SDK. This is
  third-party protocol knowledge, not v1 code reuse (R2).
- Stream URLs are returned as URL plus headers. Bytes stay with the core (D8).
- Radio stations are exposed through the source capability.
- **Fixtures must be re-recorded** against a live account. They are gitignored because
  they carry auth tokens. Record before writing replay tests, not after.

**Test scenarios:**
- Happy path: the partner-then-user login sequence produces a usable token.
- Happy path: a station playlist fetch returns canonical tracks.
- Edge case: a token expiring mid-session triggers re-auth transparently.
- Error path: invalid credentials return a typed auth failure.
- Error path: an upstream 5xx surfaces as a typed provider failure.

**Verification:** Replay tests pass against freshly recorded fixtures.

---

#### U17. YouTube Music plugin and yt-dlp updater

**Goal:** YouTube Music as a plugin, with yt-dlp kept current nightly.

**Requirements:** R4, R9

**Dependencies:** U15

**Files:**
- Create: `plugins/ytmusic/package.json`, `plugins/ytmusic/src/index.ts`, `plugins/ytmusic/src/ytdlp.ts`, `plugins/ytmusic/src/api.ts`, `nix/plugin-ytmusic.nix`, `nix/units/pyxis-ytdlp-update.timer.nix`

**Approach:**
- yt-dlp stays a subprocess. The plugin resolves stream URLs and returns them (D8).
- The nightly timer ships with this plugin's package, not with the core, which is the
  first proof that a plugin can carry its own services (R9).
- A yt-dlp failure degrades this plugin only.

**Test scenarios:**
- Happy path: search returns canonical tracks.
- Happy path: stream resolution returns a playable URL with required headers.
- Edge case: a missing yt-dlp binary reports a typed unavailable state at handshake.
- Error path: a yt-dlp non-zero exit maps to a typed provider failure.
- Integration: the timer unit updates the binary and the plugin picks up the new version.

**Verification:** The timer runs on schedule under `systemctl --user`.

---

#### U18. Sonos output plugin

**Goal:** Sonos rooms as controllable playback targets.

**Requirements:** R4, R5

**Dependencies:** U15, U13

**Files:**
- Create: `plugins/sonos/package.json`, `plugins/sonos/src/index.ts`, `plugins/sonos/src/ssdp.ts`, `plugins/sonos/src/soap.ts`, `plugins/sonos/src/transport.ts`, `plugins/sonos/src/topology.ts`

**Approach:**
- Implements the `output` capability class: discover, transport, volume, grouping.
- SOAP envelopes and fault parsing carry over from v1 test sources, which hold them as
  inline literals and are therefore inheritable as test data.
- A Sonos session is hosted by the core, so it plays with no browser present (D4).
- Speakers fetch bytes from the core's LAN stream URL, which needs range support (U14).

**Test scenarios:**
- Happy path: discovery finds seeded speakers and reports topology.
- Happy path: transport commands change speaker state.
- Edge case: grouping and ungrouping rooms updates topology.
- Edge case: an unreachable speaker is dropped from the list without failing discovery.
- Error path: a UPnP fault maps to a typed error with its numeric code preserved.

**Verification:** A real speaker plays a library track under console control.

---

#### U19. Soulseek fidelity plugin

**Goal:** Silently upgrade library-track audio quality. Never visible. Never uploads.

**Requirements:** R8

**Dependencies:** U15, U11, U10

**Files:**
- Create: `plugins/soulseek/package.json`, `plugins/soulseek/src/index.ts`, `plugins/soulseek/src/client.ts`, `plugins/soulseek/src/upgrade.ts`, `plugins/soulseek/src/policy.ts`

**Approach:**
- Implements the `provider` class only. It contributes no search, browse, or radio surface,
  so no client can render it (R8).
- Loop: pick a library track below the fidelity target, search, score candidates through
  the core matching engine (U10), download to temp, verify, then register as a new
  candidate (U11). Resolution does the rest.
- Auto-accept only above the matching auto-accept band. Ambiguous matches are discarded,
  never guessed.
- **No upload path exists in the code** (D10). Not a disabled flag: absent.
- Designed for patience. Long queue tolerance, retries across days, low expected hit rate,
  and a bounded concurrent-download budget.
- v1 scope is library tracks only. Playlist pre-fetch is deferred.

**Test scenarios:**
- Happy path: a lossless candidate for a 128kbps track is downloaded and registered.
- Happy path: after registration, resolution returns the upgraded candidate.
- Edge case: a below-threshold match is discarded and the track is not upgraded.
- Edge case: an equal-or-lower fidelity result is ignored.
- Edge case: a download interrupted mid-transfer leaves no partial candidate.
- Error path: peer refusal or queue timeout retries later rather than failing the loop.
- Integration: the plugin exposes no source capability, so no client surface can list it.

**Verification:** No upload code path exists, confirmed by inspection and by the absence
of any share configuration. Upgrades appear without any client-visible action.

---

### Phase 4 — Client data plane

#### U20. Client store and worker schema

**Goal:** ProseQL wasm inside a worker over IndexedDB.

**Requirements:** R7, R13

**Dependencies:** U2

**Files:**
- Create: `clients/app/package.json`, `clients/app/src/worker/database.ts`, `clients/app/src/worker/contract.ts`, `clients/app/src/worker/client.ts`

**Approach:**
- Mirrors ossicle's `@proseql/browser/worker` setup.
- `worker/contract.ts` is the documented boundary the design model builds against (D16).
  Treat it as a public API and keep it free of view concerns.
- A schema version drives an explicit upgrade path, since a stale worker schema against a
  new contract is the most likely field failure.

**Test scenarios:**
- Happy path: records written in the worker read back after a page reload.
- Edge case: a schema version bump upgrades an existing database without data loss.
- Error path: a corrupt local database resets and re-syncs rather than wedging.

**Verification:** Worker persists across reloads and survives a schema bump.

---

#### U21. Sync engine

**Goal:** Two-way sync with explicit conflict outcomes and an offline write queue.

**Requirements:** R7

**Dependencies:** U20, U9

**Files:**
- Create: `clients/app/src/worker/sync.ts`, `clients/app/src/worker/listen-sync.ts`, `clients/app/src/worker/conflict.ts`, `clients/app/src/rpc/client.ts`

**Approach:**
- Per-domain revision gates drive pulls. Writes queue locally and replay on reconnect.
- Merge rules follow the `Sync domains` table exactly.
- The service worker cannot depend on the page's validator bundle, so it re-validates the
  shapes it consumes by hand, exactly as ossicle does at the same boundary.
- Listen events batch on reconnect and are idempotent by ULID.

**Test scenarios:**
- Happy path: an offline placement change replays on reconnect.
- Happy path: offline listen events batch-submit and appear in server history.
- Edge case: replaying the same queued write twice produces one result.
- Edge case: a conflicting two-device edit resolves to the documented outcome and is reported.
- Edge case: a partially failed batch retries only the failed remainder.
- Error path: a malformed server response is rejected at the trust boundary.
- Integration: a full offline session of queue edits and listens reconciles correctly.

**Verification:** Property test proves offline replay is idempotent.

---

#### U22. Offline download manager

**Goal:** Pinned albums play with no network.

**Requirements:** R7

**Dependencies:** U21, U14

**Files:**
- Create: `clients/app/src/worker/downloads.ts`, `clients/app/src/worker/offline-policy.ts`, `clients/app/src/worker/range.ts`

**Approach:**
- Port ossicle's offline policy: free-space floor, pressure fraction, LRU eviction, and a
  retained set that is never evicted.
- Audio lands in Cache Storage keyed by resolved candidate, so a fidelity upgrade
  invalidates the stale cached copy rather than serving it forever.
- Policy decisions stay pure and separately testable; the worker only executes them.

**Test scenarios:**
- Happy path: a pinned album downloads and plays with the network disabled.
- Edge case: storage pressure evicts least-recently-used items first.
- Edge case: the currently playing item is never evicted.
- Edge case: a fidelity upgrade invalidates the previously cached bytes.
- Error path: an interrupted download resumes or restarts cleanly with no partial entry.

**Verification:** Pinned content plays offline, and eviction order matches the policy tests.

---

#### U23. Service worker, PWA shell, and typed RPC client

**Goal:** An installable offline shell exposing the documented worker API.

**Requirements:** R7, R13

**Dependencies:** U22

**Files:**
- Create: `clients/app/src/pwa/service-worker.ts`, `clients/app/src/pwa/register.ts`, `clients/app/vite.config.ts`, `clients/app/public/manifest.webmanifest`, `clients/app/src/worker/README.md`

**Approach:**
- No-store shell with immutable hashed assets, following comics.
- `clients/app/src/worker/README.md` documents the worker API for the design model. This
  is the formal handoff artifact for D16 and should be written as if for a stranger.
- The RPC client validates responses against the generated JSON Schema at the page boundary.

**Test scenarios:**
- Happy path: the app installs and boots with the network disabled.
- Edge case: a new deployment activates without orphaning the local database.
- Error path: a schema-invalid response is rejected and surfaced as a typed error.

**Verification:** The app cold-boots offline after one online visit.

---

### Phase 5 — Delivery

#### U24. Ugly reference client

**Goal:** Prove every protocol surface works, with zero design intent.

**Requirements:** R13, R10

**Dependencies:** U23, U13

**Files:**
- Create: `clients/app/src/reference/App.tsx`, `clients/app/src/reference/Library.tsx`, `clients/app/src/reference/Sessions.tsx`, `clients/app/src/reference/Console.tsx`, `clients/app/src/reference/Plugins.tsx`

**Approach:**
- Unstyled semantic HTML. No CSS beyond browser defaults. Deliberately ugly so nobody
  mistakes it for the real interface.
- Must exercise every capability: library, placements, search, sessions, console control,
  handoff, offline pinning, plugin status, account switching.
- Any surface not reachable here is a surface the design model cannot build on.

**Test scenarios:**
- Integration: every RPC operation in the contract is exercised by at least one view.
- Happy path: console control works between two browser tabs.
- Edge case: with zero plugins installed, the client renders and explains the absence.

**Verification:** A human can run the whole product through this client, ugly but complete.

---

#### U25. Packaging and deployment

**Goal:** `nix profile add` installs the core, plugins, and units.

**Requirements:** R12, R9

**Dependencies:** U24, U17

**Files:**
- Create: `nix/package.nix`, `nix/plugins.nix`, `nix/units/pyxis.service.nix`, `nix/units/pyxis-tsnet.service.nix`, `services/pyxis-tsnet/`, `docs/install.md`
- Modify: `flake.nix`

**Approach:**
- Separate flake output per plugin (D12), so plugins install independently of the core.
- Core binds localhost. The tsnet edge is its own unit, matching ossicle.
- Keep the tailnet hostname `pyxis`, because changing the origin orphans installed PWA
  storage and offline downloads on every device.
- State at `$XDG_DATA_HOME/pyxis`. No `/var/lib` until the NixOS module lands.

**Test scenarios:**
- Happy path: `nix profile add` then `systemctl --user enable --now` yields a healthy service.
- Happy path: installing a plugin package makes it appear in `plugin.list` after restart.
- Edge case: removing a plugin package leaves the core healthy.
- Integration: `/healthz` returns 200 through the tailnet edge.

**Verification:** A from-scratch install serves the reference client over the tailnet.

---

#### U26. Public API documentation

**Goal:** A third party can build a client without reading Rust.

**Requirements:** R10

**Dependencies:** U25

**Files:**
- Create: `docs/api/README.md`, `docs/api/operations.md`, `docs/api/realtime.md`, `docs/api/authentication.md`, `docs/api/plugin-protocol.md`

**Approach:**
- Document the transport, the tagged-union convention, failure envelopes, capability
  discovery, token issuance, and the realtime protocol.
- `plugin-protocol.md` is what makes "third-party plugins" true rather than a slogan.
- Include a worked example that authenticates and plays a track using only documented calls.

**Test scenarios:**
- Test expectation: none. Documentation unit, verified by the review below.

**Verification:** The worked example runs end to end against a live server, copied verbatim.

---

#### U27. Ephemeral legacy import, then deletion

**Goal:** Recover the 371-album library, then delete the tooling.

**Requirements:** R14, R2

**Dependencies:** U26

**Files:**
- Create then delete: `tools/import-legacy/`

**Approach:**
- Read `albums.yaml` from the v1 state directory with sudo, emit a flat manifest of artist
  and album title. Nothing else is imported. Source refs, track rows, and the 107 listen
  events are discarded deliberately (D11).
- Feed the manifest through the public API, resolving each album through plugins as if
  added by hand. This doubles as the strongest end-to-end test of the plugin layer.
- Report unresolved albums for manual handling. Expect roughly 10 to 30 of 371.
- The final commit of this unit deletes `tools/import-legacy/` entirely (R14).

**Test scenarios:**
- Happy path: the manifest parses and resolves against a live plugin set.
- Edge case: an unresolvable album is reported, not silently dropped.
- Edge case: re-running the import does not duplicate albums.

**Verification:** The library is repopulated, the unresolved list is reviewed, and
`tools/import-legacy/` no longer exists in the tree.

---

## System-Wide Impact

- **Interaction graph:** The plugin host, session machine, and sync engine are the three
  hubs. A change to the plugin protocol touches the SDK and every plugin. A change to
  session state touches realtime, console, and the client worker.
- **Error propagation:** Plugin failures must degrade one capability, never the core (R4).
  Sync failures must never destroy local writes.
- **State lifecycle risks:** The client's queued offline writes are the only data that
  exists in one place. Losing them loses user work. Treat that queue as precious.
- **API surface parity:** Every operation must be reachable by a third-party client with a
  token, not only by the first-party app (R10).
- **Unchanged invariants:** `VISION.md` product principles carry forward. Principle 5 was
  amended on 2026-08-21 to separate library ownership (the service) from playback ownership
  (the device), and principles 6 through 9 were added for console mode, plugin sources,
  offline, and quiet fidelity upgrades. The placement model, listening-history-is-truth,
  album-as-unit-of-art, and progressive disclosure are unchanged and binding.

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pandora fixtures must be re-recorded from scratch | Certain | Medium | Record early in U16, before writing replay tests. Fixtures stay gitignored |
| `soulseek-ts` is unmaintained or incomplete | Medium | Medium | Audit at the start of U19. The plugin boundary means replacing it touches one package |
| No-upload Soulseek yields a low hit rate | High | Low | Accepted by D10. Design for patience, not throughput. Never present it as reliable |
| Plugin protocol churn forces rewrites of every plugin | Medium | High | Version the handshake from U7. Refuse mismatches loudly rather than degrading |
| Offline conflict edge cases corrupt library state | Medium | High | Property tests in U21. Explicit conflict outcomes rather than silent last-writer-wins |
| The user cannot read the Rust core when it breaks | Certain | Medium | Accepted by D1. All expansion surface is TypeScript. Keep core logs structured and legible |
| Scope is large enough to stall before delivering value | Medium | High | Phase 0 through 2 produce a serving core with zero plugins. Each phase ends somewhere demonstrable |

---

## Open Questions

### Resolved During Planning

- Rust or TypeScript: both. Rust core, TypeScript plugins (D1).
- Client data plane ownership: in scope for this session (D16).
- Import: ephemeral external tool producing a re-acquisition manifest (D11).
- Console versus offline tension: device-hosted sessions resolve it (D3).
- Soulseek sharing: no uploads at all (D10).

### Deferred to Implementation

- Exact ProseQL collection shapes. Settle while writing U3 against the real crate API.
- Whether `session.list` needs pagination. Unknowable until device counts are real.
- Concrete matching thresholds in U10. Tune against a real fixture table, not by guessing.
- Whether the enricher capability class needs changes before a real enricher exists.
- Soulseek concurrency and retry budgets. Tune against observed peer behavior in U19.

---

## Sources & References

- v1 codebase: `git show legacy:<path>`, full history on the `legacy` branch
- Reference architecture: `~/code/sandbox/ossicle`, `~/code/sandbox/comics`
- Product principles: `VISION.md`
- Soulseek client candidate: `soulseek-ts` by jgchk
- v1 state directory inspected on 2026-08-21: `/var/lib/pyxis/pyxis/db/`
