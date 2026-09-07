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
4. Read `work.md` for the current milestone pointer.
5. Resume at the next unit in `Shipping Milestones` execution order whose commit does not
   exist. Execution order is the milestone table, not numeric U-ID order.

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

- Verify ProseQL query-cache invalidation before reducing refresh-under-lock
  (`01M1VZZYSRGB8C8G4Y0WMS2MXS`). A real-WASM placement probe again found a persisted
  outbox row missing from a same-handle query. Production reopen boundaries remain required.
- NixOS module, replacing the `nix profile` install.
- Soulseek optimistic pre-fetch for Pandora and YouTube Music playlist tracks (R8 "eventually").
- Metadata enricher plugins (MusicBrainz, Discogs). The enricher capability class is
  designed in U7 but no enricher ships in v1. `VISION.md` marks Enrichment accordingly.
- Chromecast and AirPlay output plugins. The output capability class makes them possible.
- **M10, continuous radio.** M9 ships one explicit bounded batch per station. Endless play needs
  one refill owner per hosted session, bounded prefetch, batch idempotency, next-track
  advancement, and explicit failure and exhaustion states. A late batch must never append to the
  wrong account or seed, replace a user's queue, or restart playback after Stop. Clear, handoff,
  disconnect and account switch each need defined cancellation. Prefetch depth is bounded by a
  provider fact recorded in U30: a Pandora batch is perishable and process-bound. The session
  acknowledgement fix in `9c0efb7` was the stated precondition and has landed.
- **Typecheck every `.tsx` file, not only `.ts`.** The root `tsconfig.json` includes
  `clients/**/*.ts`, which excludes the entire React reference client and its tests. Found while
  building U30: three `RpcPlugin` fixtures in `clients/app/src/reference/Console.test.tsx` were
  missing a required contract field and `just typecheck` stayed green. Widening `include` is not
  a one-line change, because it turns the gate on for code that has never faced it, so it does
  not belong inside a feature unit.
- **Four reference-client tests fail on `main` and predate this work.** At `c45f0de`, `bun run
  --cwd clients/app test` reports 4 failed / 263 passed of 267, all in
  `clients/app/src/reference/Console.test.tsx`, all timing out at about 1,006 ms: "drives a
  session hosted by another device", "explains the valid zero-plugin product state", "lists a
  live source plugin without adding visual interpretation", and "searches, queues, and loads
  audio through the reference binding". `work.md` records M8 landing with 267 passing, so this
  regressed after that measurement. `a63036e` is the likely origin because it is the only recent
  commit that touched both `Console.test.tsx` and the reference client, but that is inference,
  not a bisect. The M8 milestone is deployed with these tests red.
- **The browse space: charts, moods, genres and provider playlists.** Deliberately unnamed under
  D21 until it is built, so the guess does not reach the generated contract. It reuses the station
  contract's opaque-cursor and declared-support rules.
- **Weekly Mix.** A first-class `VISION.md` feature that this plan does not build. It needs
  upstream recommendations, which now arrive through source plugins, so it cannot precede
  Phase 3. The generic station operations from U30 are the intended foundation: the mix is
  composed by Pyxis on top of provider answers, not requested from any one provider. The listen
  events and placement data it depends on are recorded from U8 and U9 onward, so deferring it
  loses no history. `VISION.md` carries a matching status note.
- Album-level neglect detection and time-travel history views. The append-only log in U9
  makes both pure projections, but neither is built in v1.
- Align reference handoff affordances and failure messages with the current contract
  (`01M1WMM0NJ8H3SKG58PTVMCA6N`). Output handoff is currently explicitly refused; implementing
  it is a separate behavior decision, not an automatic consequence of hiding a false affordance.
- Consolidate fail-closed browser diagnostics with request-level target guards, section-scoped
  selectors, and persistent profiles outside temporary cleanup (`01M1WNM11MH33SPVVGE5P1KJN6`).
  A failed unintended Sonos queue-clear request and a missing temporary-profile manifest are
  documented in `docs/operations/2026-09-06-m3-handoff-sonos-follow-up.md`.

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
| D11 | Legacy import is an external ephemeral tool emitting a re-acquisition manifest | Honors R2 and R14. The live manifest contains 386 v1 albums, which are re-resolved through plugins as if added by hand. Old source-ref bindings are discarded deliberately |
| D12 | Monorepo, separate flake output per plugin | Fast iteration while plugins still only speak the public protocol, which keeps the third-party contract honest |
| D13 | `nix profile` plus `systemctl --user` for v1 | Matches the reference projects and iterates faster than a system rebuild. NixOS module deferred |
| D14 | The Rust contract module is the protocol source of truth, with typeshare and schemars codegen | One definition produces TypeScript types and a JSON Schema. The schema is the runtime trust boundary, mirroring the reference projects |
| D15 | The core owns a local media store and local-file playback | Soulseek downloads are local files, so local playback is a core capability rather than a plugin concern |
| D16 | The client worker data plane is in scope; the UI above it is not | Offline correctness is a distributed-systems problem, not a design problem. The design model consumes a documented worker API |
| D17 | Server album removal wins over queued offline placement intent, with an explicit conflict report | A placement cannot recreate a removed album. Keeping a stale copy wedges convergence; dropping the local change silently hides data loss |
| D18 | Track search asks the music catalog, and no general-video search remains | User decision, 2026-09-07: "i dont think i want this. not yet anyway". Catalog search returns real artist and album identity instead of uploader names. Cost: recordings that exist only as ordinary uploads, such as live sets and rare versions, stop being findable. Results must never mix catalog songs with general videos |
| D19 | Discovery search covers albums, artists and songs in one fan-out operation | User requirement, 2026-09-07. One search box asks once and shows three sections. Per-plugin partial failure already exists in the search result, so a source that answers only some kinds degrades honestly. Cost: one slow source delays every kind in that response |
| D20 | A `Station` is the one generic radio object, and every source maps its own mechanism onto it | User requirement, 2026-09-07: discovery and radio are a core concept, and YouTube Music and Pandora are only source plugins beneath it. A seed produces a station; a station yields bounded batches. Pandora station tokens and YouTube Music `RDAMVM` watch queues both fit that shape, so no provider needs its own operation, RPC or client surface. Cost: a provider concept that does not fit, such as Pandora thumbs or YouTube mood chips, stays unavailable until the generic model grows to hold it |
| D21 | `Discovery` keeps its existing meaning as a library placement, and the browse space stays unnamed until it is built | The placement model in `VISION.md` already owns the word, and `Station` is already the vision's word for a discovery engine. Naming a third concept before building it would put a guess into the generated contract and the client store, where renaming is expensive. Charts, moods and sections are not in M9, so the noun is not needed yet |
| D22 | A source declares its supported seed kinds in the handshake manifest, and the SDK refuses a declaration that its handlers do not back | User requirement, 2026-09-07: sources declare what they support so partial support degrades honestly. R10 needs a third-party client to adapt without probing every source. Declaring in the manifest keeps `plugin.list` the single place a client looks. The SDK check is what stops a declaration from drifting away from the implementation. Cost: adding a seed kind is a manifest change, not only a handler change |

---

## Context & Research

### Verified findings from the v1 system

- v1 data lives at `/var/lib/pyxis/pyxis/db/` under a systemd `DynamicUser`, so reading it
  requires sudo. Contents: `albums.yaml` (386 live manifest entries), `album-tracks.yaml`,
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

## Shipping Milestones

Units below are listed in numeric order. **Execution order is the milestone order in this
table.** Ship at a milestone boundary and nowhere else.

A milestone ends with a product the user can run and form an opinion about. "The core
boots with zero plugins" is not a milestone, because nobody can validate it. Every
milestone below answers a question the user can only answer by using the thing.

| # | Ships | Units, in execution order | The question it answers |
|---|---|---|---|
| M1 | **A song plays.** Local dev shell, one plugin, ugly client | U1, U2, U3, U4, U6, U7, U15, U17, U11, U14, U12, U24 | Does the plugin architecture work end to end, and does audio come out? |
| M2 | **The library is back, installed on the tailnet** | U8, U9, U10, U16, U25, U27 | Are my 386 legacy albums accounted for, and does the placement model feel correct? |
| M3 | **Console control from a second device** | U5, U13 | Does console mode feel good, and is the session model right? |
| M4 | **It plays on the Sonos** | U18 | Does output-as-a-plugin hold up against real hardware? |
| M5 | **It works with no network** | U20, U21, U22, U23 | Does offline survive real use, or only tests? |
| M6 | **Audio quietly improves** | U19 | Does no-upload Soulseek actually upgrade anything? |
| M7 | **Someone else could build a client** | U26 | Can a third party integrate from documentation alone? |
| M8 | **Search finds albums, artists and songs** | U28, U29 | Does discovery return real catalog identity instead of general video results? |
| M9 | **A station plays, whatever the source is behind it** | U30, U31, U32, U33 | Is one generic station model honest against two very different providers? |

Notes on sequencing:

- **M1 is deliberately large.** A vertical slice through a plugin architecture touches the
  contract, the host, the SDK, a plugin, a session, and the byte path. There is no smaller
  first slice that proves anything. Every unit in M1 is load-bearing for playing one song.
- **YouTube Music comes before Pandora.** It is a thin yt-dlp wrapper with no crypto
  handshake, so it reaches a playing song fastest. Pandora's Blowfish work is a distraction
  at M1 and lands in M2, where the library import needs it anyway.
- **Packaging lands in M2, not at the end.** Console mode in M3 needs a real install on the
  tailnet to validate against a phone. M1 validates from a dev shell.
- **M6 is the honest cut line.** If the project needs to stop early, M6 and M5 are the two
  milestones that remove the most work while breaking the least.
- **M8 was added on 2026-09-07**, after the Raziel assessment in
  `docs/research/2026-09-07-raziel-youtube-music-opportunities.md`. It is the assessment's
  first slice widened by the user from songs alone to albums, artists and songs. Radio,
  playlists, moods and personalization stay out; they need queue refill and authentication
  work that this milestone does not build.
- **M9 was added on 2026-09-07**, when the user required that YouTube Music and Pandora
  discovery/radio be source abstractions under a generic Pyxis model rather than two provider
  features. It ships a station the user can pick and hear from either source. It deliberately
  stops at one explicit bounded batch. **Continuous refill is M10, not M9.** The research report
  calls refill the largest correctness slice, and it needs session queue advancement that does
  not exist yet. Shipping the generic contract against two unlike providers is what proves the
  abstraction; endless play is what proves the session work, and that is a separate question the
  user can only answer after the first one is true.
- **Pandora leads M9, not YouTube Music.** Pandora already implements station list, station
  search and station tracks inside its plugin with no public route to them, so mapping it onto
  the generic contract tests the abstraction against real provider behavior with the least new
  provider research. YouTube Music needs a watch-next request and continuations that no code in
  this repo has ever made.

## Implementation Units


### U1. Repo skeleton, flake, dev shell, verify gate

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

### U2. Protocol contract and codegen pipeline

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

### U3. Storage layer and account-scoped data model

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


### U4. RPC transport and dispatch

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

### U5. Realtime channel

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

### U6. Accounts, devices, pairing, tokens

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

### U7. Plugin host and capability registry

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


### U8. Library domain

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

### U9. Listen log and projections

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

### U10. Matching engine

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

### U11. Media store, candidates, and fidelity resolution

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

### U12. Sessions and playback state machine

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

### U13. Console control and handoff

**Goal:** One device drives another device's session.

**Requirements:** R5, R6

**Dependencies:** U12

**Files:**
- Create: `services/pyxis/src/sessions/console.rs`, `services/pyxis/src/sessions/handoff.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/rpc/realtime.rs`

**Approach:**
- `session.list` shows reachable sessions on the account.
- A console command is addressed to a session id and routed to the host over WebSocket.
  The host validates it against current local state, confirms renderer effects, then records
  it through `session.command.run`; only that durable report is fanned out.
- Handoff moves queue and cursor to a target device explicitly.
- Commands to an unreachable session return a typed outcome rather than queueing silently.

**Test scenarios:**
- Happy path: a console pause stops audio on the host device before Paused is published.
- Happy path: handoff moves queue and cursor and leaves the source session empty.
- Edge case: refused autoplay leaves the prior session state and no Play write.
- Edge case: a media failure after Play is corrected to Paused.
- Edge case: Pause cancels a stream request that is still loading.
- Edge case: two consoles driving one session both observe the same resulting state.
- Edge case: an offline host's session is absent from `session.list`.
- Error path: commanding an unreachable session returns a typed unreachable outcome.
- Integration: a Sonos session is controllable with no browser present.

**Verification:** A console device changes playback on a separate host device.

---

### U14. Stream proxy and byte cache

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


### U15. TypeScript plugin SDK

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

### U16. Pandora plugin

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

### U17. YouTube Music plugin and yt-dlp updater

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

### U28. YouTube Music catalog song and artist search

**Goal:** The plugin answers song and artist queries from the music catalog, not from general
YouTube.

**Requirements:** R4

**Dependencies:** U17

**Files:**
- Modify: `plugins/ytmusic/src/internal-api.ts`, `plugins/ytmusic/src/index.ts`,
  `plugins/ytmusic/src/ytdlp.ts`, and their tests

**Approach:**
- The existing innertube request wrapper already serves album search. Song and artist search
  are two more `search` filters through the same wrapper, so no new transport is introduced.
- Only `MUSIC_VIDEO_TYPE_ATV` entries are songs. Ordinary music videos and user uploads carry
  other types and are rejected, which is what keeps D18 honest.
- Artist references must match `UC` plus 22 characters. An album or playlist reference in the
  same shelf is not an artist.
- yt-dlp keeps stream resolution and fetch. Its general search is deleted rather than left
  unused, because a dormant general-search path invites D18 being reopened by accident.
- Duration parsing is hardened here because song search depends on it: every component must be
  digits, and the result must fit the core's u32 millisecond field.

**Test scenarios:**
- Happy path: song search reads video id, title, artist, album, duration and artwork.
- Happy path: artist search reads channel reference, name and artwork.
- Edge case: a song without a linked artist page still reports its leading detail run.
- Edge case: repeated recordings collapse, and the requested limit is honored.
- Error path: non-catalog recordings and non-artist references produce no results.
- Error path: `:`, `1:`, `4:70`, `999999999:00` and `LIVE` omit duration instead of inventing one.

**Verification:** `bun test` in `plugins/ytmusic`, repo typecheck, Biome.

**Closes:** `01M1W0J02HD295KB4SCDV074MN`.

---

### U29. Three-kind source discovery through one operation

**Goal:** One search request returns albums, artists and songs from every live source.

**Requirements:** R4, R10

**Dependencies:** U28

**Files:**
- Modify: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/source_catalog.rs`,
  `services/pyxis/src/rpc/dispatch.rs`, `clients/app/src/reference/*`, generated contracts

**Approach:**
- `source.search.run` gains albums and artists beside its existing tracks and per-plugin
  failures. `source.album.search` and `source.album.get` keep their plugin-scoped role in the
  library-add flow.
- A source that does not implement a kind is not a failure. The core records it as unsupported
  so a songs-only plugin does not produce an error on every query.
- Each kind is bounded by the request limit, so one talkative source cannot flood a result.
- Discovery still registers playable candidates only for songs, and never writes the library.

**Test scenarios:**
- Happy path: a source implementing all three kinds returns all three.
- Edge case: a source implementing only songs contributes songs and reports no failure.
- Edge case: each kind is truncated to the requested limit.
- Error path: one failing source does not remove another source's results.

**Verification:** `just verify`, plus `tools/verify-api-example-local`, which runs the published
worked example against a core built from the working tree instead of the deployed service.

**Acceptance status (2026-09-07): deployed, awaiting user confirmation.** `a63036e` is the
installed revision. `tools/verify-api-example` passes against the running service and returns
`David Bowie — "Heroes"` where it previously returned
`David Bowie - "Heroes" (Official Video) [HD]`. A read-only "Radiohead" query through the HTTPS
origin returned four artists, four albums and four catalog songs, with one expected
`pandora: plugin.search` failure from missing credentials. Evidence and limits are in
`docs/operations/2026-09-07-catalog-search-deployment.md`. The user has not used the search yet.

**Known gap:** the reference client lists source albums and artists but cannot act on them.
Adding a source album to the library needs a `library.album.add` affordance the reference
client has never had; the 370 imported albums came from the ephemeral import tool. Opening an
artist needs artist detail, which no source operation provides yet.

---

### U30. Generic station contract and declared seed kinds

**Goal:** The core owns one station model that any source can implement, and a source states which
seeds it accepts.

**Requirements:** R4, R10

**Dependencies:** U7, U29

**Files:**
- Create: `services/pyxis/src/stations.rs`
- Modify: `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/plugins/protocol.rs`,
  `services/pyxis/src/rpc/dispatch.rs`, `services/pyxis/src/lib.rs`,
  `packages/plugin-sdk/src/capabilities.ts`, `packages/plugin-sdk/src/protocol.ts`, generated
  contracts

**Approach:**
- The model is deliberately small: a **seed** is what you point at, a **station** is what a seed
  produces, and a station yields **bounded batches**. Four `source` operations express it:
  `station.search`, `station.list`, `station.create`, `station.next`.
- `station.next` takes an opaque cursor and returns bounded tracks plus the next cursor, or
  reports exhaustion. The cursor is opaque outside the plugin and is bound to account, source and
  station, so a cursor cannot be replayed against another account or station.
- `PluginManifest` gains a source feature block declaring accepted seed kinds. The SDK refuses a
  manifest that declares a seed kind or station operation its handler table does not implement,
  which is the same consistency rule already applied to capability classes.
- The fan-out mirrors `source_catalog::search`: per-source calls, per-source typed failures, each
  kind bounded by the requested limit, and `capability.unknownOperation` treated as a capability
  boundary rather than a fault, per D19.
- Stations register playable candidates for returned tracks only. Stations never write the
  library, and a station batch is not a library placement. `Discovery` in `RpcPlacement` keeps its
  existing placement meaning, per D21.
- Batches are perishable. Pandora's `stream.resolve` needs its own `station.tracks` call to have
  filled a process-local cache first, and re-resolves URLs older than 60 seconds. The core must
  therefore not persist a batch and assume it stays playable across a plugin restart. This bounds
  prefetch depth in U34 and is recorded here because it is a provider fact, not a design choice.

**Test scenarios:**
- Happy path: a source implementing all four operations answers all four.
- Happy path: a track seed produces a station, and the station returns a bounded first batch.
- Edge case: a source implementing only `station.list` and `station.next` contributes both and
  reports no failure.
- Edge case: with zero plugins installed, every station operation reports no sources instead of
  failing.
- Edge case: each batch is truncated to the requested limit.
- Error path: a cursor issued for one account or station is refused for another.
- Error path: one failing source does not remove another source's stations.
- Error path: a manifest declaring an unimplemented seed kind fails the SDK check.

**Verification:** `just verify`, including `contract-check` after regeneration.

---

### U31. Pandora stations through the generic contract

**Goal:** Pandora's existing station code becomes reachable as generic stations, with no
Pandora-specific public operation.

**Requirements:** R4

**Dependencies:** U30

**Files:**
- Modify: `plugins/pandora/src/index.ts`, `plugins/pandora/src/api.ts`,
  `plugins/pandora/src/stations.ts`, `plugins/pandora/src/types.ts`, and their tests

**Approach:**
- `stations.list` becomes `station.list`, `station.tracks` becomes `station.next`, and
  `station.search` returns typed station summaries instead of the raw `music.search` envelope it
  currently passes through untouched.
- `station.create` is new: `music.search` returns seed tokens, and `station.createStation` turns a
  chosen seed into a station. The plugin declares the seed kinds Pandora actually accepts rather
  than every kind the contract can express.
- Pandora returns a fresh playlist per call and carries no continuation token, so its cursor is
  the absence of one. `station.next` reports more-available rather than inventing a cursor.
- The existing in-memory track cache stays. `station.next` must keep filling it, because
  `stream.resolve` still depends on it and losing that would break playback.
- The untyped `search(): Promise<unknown>` gains a parsed result type. An unrecognized envelope is
  a typed failure, never an empty list, so a changed layout cannot look like "no stations".

**Test scenarios:**
- Happy path: station list, station search, station create and a first batch each return typed
  results.
- Happy path: a track from `station.next` resolves to a stream URL through the existing cache.
- Edge case: a playlist item missing a token, title, artist or album is dropped, not invented.
- Edge case: a QuickMix station is listed like any other station.
- Error path: an unrecognized `music.search` envelope fails with a typed code.
- Error path: `stream.resolve` for a track no batch produced still reports `pandora.trackNotCached`.

**Verification:** `bun test` in `plugins/pandora`, plus `just test-pandora-fixtures`.

**Note:** Pandora has no credentials configured on the deployed service. Fixture coverage proves
the mapping; a live check needs the user to supply an account.

---

### U32. YouTube Music stations through the generic contract

**Goal:** YouTube Music answers the same station operations using its watch-next queue.

**Requirements:** R4

**Dependencies:** U30

**Files:**
- Modify: `plugins/ytmusic/src/internal-api.ts`, `plugins/ytmusic/src/index.ts`, and their tests

**Approach:**
- A YouTube Music station is derived, not stored: a track seed yields the `RDAMVM<videoId>` radio
  queue. `station.create` therefore performs no upstream write, and `station.list` is unimplemented
  rather than faked, which is exactly the honest degradation D22 exists to allow.
- `station.next` issues the watch-next request and follows continuations. The recovered Raziel
  parser is the field-mapping reference, not the implementation: it returns empty arrays on
  unknown layouts, which would make a broken parse look like an exhausted station.
- A changed layout must be a typed failure distinct from an empty result. This is the specific
  hardening the research report requires before shipping recovered parser knowledge.
- Requests reuse the existing innertube wrapper and its rate limiting, and must fit inside the
  core's 30-second plugin call deadline. An unbounded fetch plus retry backoff does not.
- Only `MUSIC_VIDEO_TYPE_ATV` entries are songs, per D18. A radio queue that returns other types
  drops them rather than widening what search is allowed to return.

**Test scenarios:**
- Happy path: a track seed produces a station whose first batch reads ids, titles, artists,
  durations and artwork.
- Happy path: a continuation returns the next batch and a new cursor.
- Edge case: a queue that runs out reports exhaustion rather than an error.
- Edge case: non-catalog entries in a radio queue are dropped.
- Edge case: `station.list` is absent, and the core records it as unsupported with no failure.
- Error path: an unknown response layout fails with a typed code, not an empty batch.
- Error path: a malformed duration omits duration instead of inventing one, per U28.

**Verification:** `bun test` in `plugins/ytmusic`, repo typecheck, Biome.

---

### U33. One station surface in the reference client

**Goal:** The user picks a station from one list and hears it, without knowing which source served
it.

**Requirements:** R10, R13

**Dependencies:** U31, U32

**Files:**
- Modify: `clients/app/src/reference/*`, `clients/app/src/worker/*`, `clients/app/src/rpc/*`

**Approach:**
- One list, source label per row, no Pandora section and no YouTube Music section. This is the
  visible test of D20.
- Starting a station queues its first batch through the existing session queue commands. The
  client issues no Play by itself; fetching recommendations must never start playback.
- A source that reports no station support contributes nothing and shows no error, matching how
  the three-kind search already treats an unimplemented kind.
- Stations are server-to-client under the existing sync domain table. The client does not merge
  station state.
- Visual design stays out of scope under R13. This surface is deliberately ugly.

**Test scenarios:**
- Happy path: stations from two sources appear in one labelled list, and starting one adds its
  batch to the queue.
- Edge case: with no configured source, the surface reports no stations rather than an error.
- Edge case: a partial source failure still shows the working source's stations.
- Error path: a failed batch leaves the queue and transport untouched.

**Verification:** `just verify`, plus a read-only check against the deployed service.

---

### U18. Sonos output plugin

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

**Acceptance status (2026-08-24): M4 complete.** Fixture and integration coverage proves
discovery, authoritative topology, transport, group volume, grouping, candidate- and
format-bound LAN range streaming, core-hosted sessions, console control, background hardware
reconciliation, rollback, account/target ownership, and restart recovery. Real-network testing
added mDNS fallback for a LAN that suppresses SSDP, moved the media listener to firewall-allowed
port 9000, and made YouTube Music resolve M4A instead of Sonos-incompatible WebM/Opus. A direct
Living Room probe and the reference client both produced audible playback; the user confirmed it
works. Output queues can be cleared from the reference client.

**Follow-up (2026-09-06): Sonos reliability requires revalidation.** A new user report exposed
intermittent discovery/state-read failures and saved room entries disappearing with availability
changes. `6334018` retains known output entries as unavailable, disables their session controls,
and fences stale publication after connection failure. Reviewed tests and the exact deployed
read-only browser check pass; underlying Sonos connection failures remain unresolved and no
new physical playback acceptance is claimed. See
`docs/operations/2026-09-06-m4-output-visibility.md` for evidence and scope. The user subsequently
confirmed no blinking but disabled controls. `f95ed25` bounds a reproduced Avahi helper deadline
overrun and was deployed after the user-approved shared Avahi restart completed. The restart
restored fast discovery-service replies, but Kitchen's three-second position deadline still
rejected legitimate five-second replies. `c1d0e6e` adds a position-only deadline (default greater
of eight seconds and the existing request budget), preserving full-body waiting, genuine failure
outcomes and ownership checks. Twelve new regressions, independent review, 248 client/86 plugin
tests and scoped gates pass; the exact revision is deployed. A three-minute read-only watch found
both rooms reachable in 88/90 samples, with a brief two-room failure and recovery. Reliability
remains open; no physical playback was attempted or accepted. The user subsequently confirmed
**"Both rooms enabled"** after inspecting Kitchen and Living Room without playback. This closes
the disabled-controls retest, not physical command or continuous-availability acceptance. The
user explicitly prohibited Sonos playback in this investigation. See `docs/operations/2026-09-06-m4-discovery-deadline.md`
and `docs/operations/2026-09-07-m4-position-deadline.md` for deployment, retained failures and
verification exceptions.

---

### U19. Soulseek fidelity plugin

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

**Implementation status (2026-08-24):** Fixture-complete, reviewed, packaged, and deployed in
`d6cf5fb` plus `9da7340`. The provider remains absent from every public plugin summary; the pinned
client advertises zero shares and bounds hostile peer frames/results. Persistent account jobs,
AutoMerge-only selection, exact byte binding, core-owned staging, ffprobe verification, strict
fidelity improvement, playback-safe formats, active-media retention, a 50 GiB budget, patient
retry, weekly reacquisition checks, and cooperative shutdown are covered by automated tests.
M6 product acceptance completed on 2026-08-24 with a live peer upgrade of A Static Lullaby's
“Withered”: 32,853,203 bytes, verified stereo FLAC, 239.347 seconds, 44.1 kHz, 1,098 kbps,
registered as the preferred lossless local candidate and served through an exact authenticated
HTTP range. Acceptance also exposed a durable `.partial` suffix inherited from staging;
`2840076` fixes future imports to use the probed format, and the accepted record was repaired to
`.flac`. Test credentials were removed after validation, leaving the provider idle without
removing the verified local candidate.

**Operational follow-up, 2026-09-07:** The user supplied a temporary account for ongoing use
and will rotate it later. Configuration succeeded through the public encrypted-config operation
for `default`. The scheduler resumed and started a fresh attempt without a restart. Keep the
credentials configured until rotation or a removal request. Two new automatic lossless FLAC
upgrades then completed, with ready files matching the stored byte counts and core completion logs.
An ambiguous match entered retry. Sustained throughput and physical playback were not tested. See
`docs/operations/2026-09-07-soulseek-background-enablement.md` for bounded verification.

---


### U20. Client store and worker schema

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

### U21. Sync engine

**Goal:** Two-way sync with explicit conflict outcomes and an offline write queue.

**Requirements:** R7

**Dependencies:** U20, U9

**Files:**
- Create: `clients/app/src/worker/sync.ts`, `clients/app/src/worker/listen-sync.ts`, `clients/app/src/worker/conflict.ts`, `clients/app/src/worker/session-local.ts`, `clients/app/src/rpc/client.ts`
- Modify: `clients/app/src/reference/App.tsx`, `services/pyxis/src/rpc/contract.rs`, `services/pyxis/src/sessions/mod.rs`

**Approach:**
- Per-domain revision gates drive pulls. Writes queue locally and replay on reconnect.
- Merge rules follow the `Sync domains` table exactly.
- The service worker cannot depend on the page's validator bundle, so it re-validates the
  shapes it consumes by hand, exactly as ossicle does at the same boundary.
- Listen events batch on reconnect and are idempotent by public event id.
- Device-hosted session commands queue locally and replay with a separate monotonic outbox id
  plus a public `commandId`. Core receipts bind each command id to its content, so a lost
  response cannot duplicate `queue.add`.
- Realtime cursors persist only after the worker has stored the state they cover.
- Server album removal follows D17. Conflict and rejected-write notices persist locally.
- Placement verdicts read pending intent and replace the album within one account-fenced
  database operation. Network I/O stays outside the lock. Sync reports all writes remaining
  at its final locked outbox read, including writes queued during the pass.
- Session-command verdicts follow the same rule: still-queued commands for that session are
  read and replayed onto the server verdict within one account-fenced database operation.
  Replay stops at the first command the current state rejects, so an invalid later command
  cannot hide the command that just succeeded. Sync never calls `replaceSession` directly
  for a verdict, because a bare replace can be interleaved between the read and the write.
- Full album pulls batch durable writes under that same refreshed account lock. Commit
  albums before offline relationships. Retry repairs partially persisted relationships even
  when album revisions already match. Separate files are not crash-atomic together.

**Test scenarios:**
- Happy path: an offline placement change replays on reconnect.
- Happy path: offline listen events batch-submit and appear in server history.
- Edge case: replaying the same queued write twice produces one result.
- Edge case: a conflicting two-device edit resolves to the documented outcome and is reported.
- Edge case: a partially failed batch retries only the failed remainder.
- Edge case: removing an album elsewhere discards queued placement intent and reports it.
- Edge case: replaying one session `commandId` with different content is rejected.
- Edge case: a command queued during an acknowledgement stays visible and replays once.
- Error path: a malformed or uncertain server response stays retryable at the trust boundary.
- Integration: a full offline session of queue edits and listens reconciles correctly.

**Verification:** Property test proves offline replay is idempotent.

**Startup follow-up (2026-09-07):** `dcf702e` replaces 370 growing collection saves with one.
The deployed 370-album Chromium startup measured 2.542 seconds versus 82.857 seconds before;
warm reload retained identity and all albums. Real-WASM tests cover first/full replacement,
queued and newer records, durable completion, and retry after partial relationship-file writes.
Public contracts, schema 8, lock/account guards, and startup-only fallback remain unchanged.
See `docs/operations/2026-09-07-full-library-startup.md` for exact scope and verification limits.

---

### U22. Offline download manager

**Goal:** Pinned albums play with no network.

**Requirements:** R7

**Dependencies:** U21, U14

**Files:**
- Create: `clients/app/src/worker/downloads.ts`, `clients/app/src/worker/offline-cache.ts`, `clients/app/src/worker/offline-policy.ts`, `clients/app/src/worker/range.ts`
- Modify: `clients/app/src/worker/contract.ts`, `services/pyxis/src/stream/mod.rs`

**Approach:**
- Port ossicle's offline policy: free-space floor, pressure fraction, LRU eviction, and a
  retained set that is never evicted.
- Audio lands in bounded chunks in Cache Storage, keyed by the resolved candidate identity
  returned by the core. A fidelity upgrade publishes a new candidate mapping without
  interrupting an active lease on the old bytes.
- Durable pin generations, album revisions, account/device fences, ProseQL refresh under
  Web Locks, and candidate publication generations close cross-tab races.
- Cache/DB publication is recoverable in either crash order. Orphaned staging and old
  candidates receive a grace period before cleanup.
- Policy decisions stay pure and separately testable; the worker only executes them.

**Test scenarios:**
- Happy path: a pinned album downloads and plays with the network disabled.
- Edge case: storage pressure evicts least-recently-used items first.
- Edge case: the currently playing item is never evicted.
- Edge case: a fidelity upgrade invalidates the previously cached bytes.
- Error path: an interrupted download resumes or restarts cleanly with no partial entry.

**Verification:** Pinned content plays offline, and eviction order matches the policy tests.

---

### U23. Service worker, PWA shell, and typed RPC client

**Goal:** An installable offline shell exposing the documented worker API.

**Requirements:** R7, R13

**Dependencies:** U22

**Files:**
- Create: `clients/app/src/pwa/service-worker.ts`, `clients/app/src/pwa/register.ts`, `clients/app/src/pwa/offline-response.ts`, `clients/app/src/pwa/shell.ts`, `clients/app/public/manifest.webmanifest`, `clients/app/src/worker/README.md`, `clients/app/src/rpc/validation.ts`
- Modify: `clients/app/vite.config.ts`, `clients/app/src/reference/api.ts`

**Approach:**
- No-store shell with an embedded build-specific immutable asset manifest. An old restarted
  worker can never adopt a newer deployment's cache identity.
- Offline media requests are candidate-leased and streamed chunk-by-chunk with byte-range
  backpressure. Service-worker stream credentials use a durable monotonic account-switch
  fence and exact transaction rollback.
- `clients/app/src/worker/README.md` documents the worker API for the design model. This
  is the formal handoff artifact for D16 and should be written as if for a stranger.
- The RPC client validates responses against the generated JSON Schema at the page boundary.

**Test scenarios:**
- Happy path: the app installs and boots with the network disabled.
- Edge case: a new deployment activates without orphaning the local database.
- Error path: a schema-invalid response is rejected and surfaced as a typed error.

**Verification:** The app cold-boots offline after one online visit.

---


### U24. Ugly reference client

**Goal:** Prove every protocol surface works, with zero design intent.

**Requirements:** R13, R10

**Dependencies:** U12, U14, U17 for M1. Later milestones extend the same client after U8,
U13, and U23 land.

**Files:**
- Create: `clients/app/src/reference/App.tsx`, `clients/app/src/reference/Library.tsx`, `clients/app/src/reference/Sessions.tsx`, `clients/app/src/reference/Console.tsx`, `clients/app/src/reference/Plugins.tsx`

**Approach:**
- Unstyled semantic HTML. No CSS beyond browser defaults. Deliberately ugly so nobody
  mistakes it for the real interface.
- At each milestone, exercise every capability shipped so far. M1 covers account claim,
  plugin status, source search, device-hosted session queue/transport, and audio. M2 adds
  library/placements/account switching, M3 adds console/handoff, and M5 adds offline pinning.
- Any shipped surface not reachable here is a surface the design model cannot build on.

**Test scenarios:**
- Integration: every product operation shipped in the current milestone is exercised by at
  least one view. Administrative RPCs remain API-only.
- Happy path (M3 extension): console control works between two browser tabs.
- Edge case: with zero plugins installed, the client renders and explains the absence.

**Verification:** A human can run the whole product through this client, ugly but complete.

---

### U25. Packaging and deployment

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

### U26. Public API documentation

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

### U27. Ephemeral legacy import, then deletion

**Goal:** Account for the live 386-album manifest, then delete the tooling.

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
- Report unresolved albums for manual handling. Expect roughly 10 to 30 of 386.
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
