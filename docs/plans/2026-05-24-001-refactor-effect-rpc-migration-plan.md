---
title: refactor: Migrate Pyxis API runtime to Effect RPC
type: refactor
status: superseded
date: 2026-05-24
deepened: 2026-05-24
superseded_by: docs/plans/2026-05-25-003-refactor-effect-runtime-big-bang-plan.md
verify_command: "just typecheck && just test"
---

# refactor: Migrate Pyxis API runtime to Effect RPC

## Summary

Migrate Pyxis from tRPC + React Query to the Lattice target runtime: Effect RPC, Effect Schema-first contracts, Effect services/layers, and Effect atom-driven React state. The migration includes the full dependency target now — React 19 + Effect v4 / atom-react — while preserving current product behavior through a staged strangler sequence that leaves playback, queue subscriptions, and audio streaming until parity is proven.

---

## Problem Frame

Pyxis currently exposes its application API through tRPC routers with Zod inputs and inferred output types, while React components consume transport hooks directly through React Query. Effect is already present in islands such as Pandora operations and ProseQL schemas, but it is not the unifying runtime model required by the Lattice Stack.

The migration needs to change the runtime boundary without turning the app into an unreviewable rewrite or regressing fragile user-visible flows such as playback, queue state, station operations, and byte-range audio streaming.

---

## Requirements

- R1. Define client/server wire contracts with Effect Schema as the source of truth for payloads, success responses, and typed `_tag` errors.
- R2. Replace the tRPC transport with Effect RPC across server and browser clients, while allowing a temporary side-by-side `/rpc` + `/trpc` migration period.
- R3. Replace React Query/tRPC hook usage with Effect-first frontend state seams: atoms/runtime layers, domain ADTs, command states, and self-selecting React state components.
- R4. Preserve existing Pyxis product behavior for library, search, stations, auth/settings, history, playback, queue, logging, and stream URL generation.
- R5. Upgrade dependencies and tooling to the full Lattice target for this repo: React 19, Effect v4, Effect RPC, atom-react, and compatible platform/runtime packages.
- R6. Keep `/stream/:compositeTrackId` as a plain HTTP byte-range audio endpoint; RPC contracts may return stream URLs but must not carry audio bytes.
- R7. Remove tRPC, React Query, and Zod API-contract usage after all consumers are migrated, with docs and verification commands updated to match.
- R8. Preserve Pyxis' current local single-user trust model unless a separate product/security plan introduces real user authorization: default loopback binding, single-origin credentialed CORS, no credentialed wildcard or reflected origins, and no state-changing GET/simple-request RPC commands.

---

## Scope Boundaries

- This plan changes runtime, transport, API contracts, and frontend state seams; it does not intentionally change Pyxis domain behavior or UI product flows.
- `/stream/:compositeTrackId` remains plain HTTP and continues to support range requests, format parameters, cache/prefetch behavior, and existing stream URLs.
- Provider-internal source parsers under `src/sources/**` are not migrated just because they use other validation styles; only wire/API contracts are in active scope.
- Simple shared UI primitives are not rewritten for atomic design purity unless transport/state migration touches their behavior-bearing root.
- Generated files remain read-only and are regenerated through the project tooling if dependency upgrades affect them.

### Deferred to Follow-Up Work

- Full Storybook/fixture preview harness adoption is deferred unless needed to safely migrate a touched feature surface.
- Project-wide alias migration from `@/*` to `@app/*` / `@shared/*` is deferred except where new shared API/runtime modules need clear boundaries.
- Fallow baseline/configuration and Biome indentation normalization are deferred unless dependency/tooling work makes them cheap to add without distracting from the runtime migration.
- Runtime config validation and non-API Zod usage in provider/internal source parsers are deferred; this plan removes Zod from API/router contracts, not necessarily from all dependencies.

---

## Context & Research

### Relevant Code and Patterns

- `server/index.ts` owns current HTTP routing for `/trpc`, `/stream`, static files, Vite middleware, and CORS. The new `/rpc` branch must coexist here without disturbing stream or Vite fallback behavior.
- `server/trpc.ts` centralizes tRPC context creation and Pandora session refresh. Its `pandoraProtectedProcedure` behavior must become an Effect middleware/layer, not duplicated per handler.
- `server/router.ts` and `server/routers/*.ts` define the current API surface with Zod inputs and implicit output contracts.
- `src/web/shared/lib/trpc.ts` and `src/web/main.tsx` wire `trpc.Provider` and `QueryClientProvider` globally.
- Direct `trpc.*` usage appears throughout `src/web/features/**` and `src/web/shared/**`, including home, search, album detail, stations, settings, bookmarks, history, command palette, now playing, and sandbox surfaces.
- `src/web/shared/playback/use-playback.ts` manually opens `EventSource("/trpc/player.onStateChange")` and implements reconnect/backoff, autoplay suppression, server progress handoff, and local audio error handling. This is a migration hotspot.
- `server/routers/player.ts` and `server/routers/queue.ts` expose current tRPC subscriptions through `@trpc/server/observable`; they should migrate last.
- `src/db/config.ts` already uses Effect Schema with domain literals, optional exact fields, bounded numbers, and schema filters. This is the closest local pattern for Schema-first contracts.
- `server/services/libraryAlbums.ts` and `server/services/libraryAlbums.test.ts` show testable domain functions over passed dependencies and real ProseQL temp databases.

### Institutional Learnings

- `docs/solutions/correctness/enforce-strict-upgrade-domain-contracts-in-config-and-db-sch.md`: schema boundaries should encode domain invariants and include negative contract tests, not only shape checks.
- `docs/solutions/feature-patterns/2026-04-15-shared-primitives-react-audit.md`: avoid broad UI churn; refactor behavior-bearing roots and state seams while leaving stable leaf primitives alone.
- `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`: preserve deep endpoint semantics such as `album.getWithTracks`; do not split coherent UI workflows into thin calls that duplicate upstream work.
- `docs/solutions/feature-patterns/2026-02-10-listen-log.md`: server-side transition functions should remain the source of truth for side effects such as listen logging.
- `docs/solutions/ui-bugs/pause-resume-restarts-song-playback-20260210.md`: playback needs one authoritative state seam for server pushes, mutation results, and local-only audio operations.

### External References

- Effect RPC package/docs: https://github.com/Effect-TS/effect/tree/main/packages/rpc
- Effect RPC API reference: https://effect-ts.github.io/effect/docs/rpc
- Effect Schema docs: https://effect.website/docs/schema/introduction/
- Effect v4 beta announcement and migration notes: https://effect.website/blog/releases/effect/40-beta/
- Effect Atom docs: https://tim-smart.github.io/effect-atom/
- tRPC subscriptions docs: https://trpc.io/docs/server/subscriptions
- Strangler Fig migration pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html

---

## Key Technical Decisions

- Use the full Lattice dependency target now: the user explicitly chose React 19 + Effect v4 / atom-react over an Effect 3 interim frontend state path. Because Effect 3 and Effect v4 cannot safely coexist behind the same `effect` import surface, the existing Effect islands must be ported and verified before new RPC work depends on them.
- Use a strangler migration even with the full target: `/rpc` is introduced beside `/trpc`, then endpoint families migrate vertically until `/trpc` can be removed.
- Keep API schemas separate from DB schemas by default: reuse `src/db/config.ts` schemas only when the wire shape is identical, because current API shapes include nullability, stream URLs, capabilities, and source-normalized views that differ from persistence records. `src/api/**` may selectively restate or derive equivalent shapes, but `src/db/**` must never import `src/api/**`, and API contracts must not re-export DB schema values as the public wire contract.
- Implement server domain access through Effect services/layers before removing tRPC: existing service functions remain the source of domain behavior while handlers and tests move to Effect boundaries. During coexistence, mutations and event emitters are owned by the shared service layer so both legacy tRPC subscriptions and new Effect streams observe the same state changes.
- Preserve Pandora auth semantics as a shared Effect middleware/layer: require credentials, coalesce and rate-cap refreshes on known Pandora auth error codes, retry once at the request/connect boundary, atomically use the refreshed session/manager for that request, and expose stable typed errors. In-stream auth failures terminate the stream with a typed auth-refresh error rather than retrying on every event.
- Migrate read-only endpoints before mutations, and migrate playback/queue realtime last: this minimizes user-visible regression risk while contract and state infrastructure mature.
- Keep `/stream` outside RPC: byte-range media streaming remains a dedicated HTTP concern; RPC responses continue to return stream URLs.
- During coexistence, every migrated mutation must refresh both old React Query consumers and new Effect atom/state consumers through one named bridge seam. That bridge is the only place allowed to touch legacy query invalidation from new Effect command code, and U9 can remove tRPC only when the bridge has no remaining entries.
- Player and queue realtime contracts use snapshot-on-connect/current-state semantics rather than historical replay. Reconnect emits current state once and then live events; sequence numbers may support de-duplication but must not create a listening-history backfill channel.
- State-changing RPC actions must use POST or another transport that triggers CORS preflight. Query/subscription GETs may not mutate server state.

---

## Open Questions

### Resolved During Planning

- Should this be a narrow pilot or broad migration plan? Resolved by user choice: plan the full server/frontend/dependency migration.
- Should frontend state target a staged Effect 3 bridge or the full Lattice atom path now? Resolved by user choice: include React 19 + Effect v4 / atom-react in the plan.
- Should `/stream` move to RPC? Resolved from research and existing stream behavior: no, keep it plain HTTP.

### Deferred to Implementation

- Exact Effect v4 package versions and import names: confirm against the lockfile during dependency upgrade because v4 is beta and package consolidation is still moving.
- Exact generated-file behavior, if any: decide once the chosen Effect RPC client/server tooling is installed.
- Final per-endpoint RPC tag grouping: the plan defines naming rules and migration order, but implementation should adjust grouping around actual shared contract ergonomics.
- Exact atom API names and hook imports: implement through the installed React 19 + Effect v4 atom package after U12 validates the package set; the architecture-level refresh bridge and ADT boundaries are already decided.

---

## Output Structure

Expected new structure, subject to adjustment during implementation:

```text
src/api/
  contracts/
    common.ts
    auth.ts
    library.ts
    search.ts
    radio.ts
    playlist.ts
    player.ts
    queue.ts
    listenLog.ts
    log.ts
    track.ts
    *.test.ts
  rpc.ts
server/rpc/
  context.ts
  errors.ts
  sourceErrorMap.ts
  handler.ts
  middleware.ts
  services/
    library.ts
    sourceCatalog.ts
    session.ts
  handlers/
    auth.ts
    library.ts
    search.ts
    radio.ts
    playlist.ts
    player.ts
    queue.ts
    listenLog.ts
    log.ts
    track.ts
  *.test.ts
src/web/shared/effect/
  layerAtom.ts
  runtime.ts
src/web/shared/api/
  rpcClient.ts
  legacyBridge.ts
src/web/features/**/
  *State.ts
  *State.test.ts
```

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TD
  Browser[React 19 UI] --> Atom[Effect atom/runtime layer]
  Atom --> RpcClient[Effect RPC browser client]
  Atom --> Bridge[Legacy refresh bridge]
  Bridge -. temporary invalidation .-> TrpcPath[/trpc]
  RpcClient --> RpcPath[/rpc]
  Browser -. temporary legacy consumers .-> TrpcPath[/trpc]
  RpcPath --> RpcHandler[Effect RPC handlers]
  TrpcPath -. temporary .-> TrpcHandler[tRPC routers]
  RpcHandler --> Services[Effect services/layers]
  TrpcHandler -. during coexistence .-> Services
  Services --> ExistingDomain[Existing domain services]
  ExistingDomain --> DB[ProseQL + Effect Schema]
  ExistingDomain --> Sources[Source Manager + Pandora/YTMusic]
  Browser --> Stream[/stream plain HTTP]
  Stream --> Sources
```

Migration shape:

1. Upgrade and stabilize dependency/runtime tooling.
2. Define shared Effect Schema/RPC contracts, typed errors, canonical parity normalization, and browser/server import boundaries.
3. Add `/rpc` side-by-side with `/trpc` while both call the same domain services.
4. Prove low-risk reads first, then cut over coherent feature surfaces with bridge refresh, then Pandora-protected flows.
5. Move player/queue streams only after characterization and reconnect/lifecycle parity are proven.
6. Remove tRPC, React Query, and Zod API contracts after no runtime consumers remain.

---

## Implementation Units

### U1. Port existing Effect islands to Effect v4

**Goal:** Move the existing Effect 3 usage in Pyxis onto the Effect v4 import/API surface before introducing new RPC or atom consumers.

**Requirements:** R1, R5

**Dependencies:** None

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `bun.nix`
- Modify: `src/db/config.ts`
- Modify: `src/db/index.ts`
- Modify: `src/sources/pandora/**/*.ts`
- Modify: `server/**/*.ts`
- Test: `src/db/config.test.ts`
- Test: `server/services/libraryAlbums.test.ts`

**Approach:**
- Treat this as the one unavoidable atomic runtime port: every current `import ... from "effect"` call site must compile and behave on Effect v4 before new contracts are added.
- Resolve ProseQL compatibility explicitly in this unit. If the installed ProseQL packages remain Effect-3-only, implementation must upgrade, fork, replace, or temporarily vendor the compatible persistence layer before the Effect v4 plan can proceed.
- Preserve existing ProseQL schema behavior, Pandora tagged errors, and `Effect.runPromise` seams while updating only what the v4 API requires.
- Keep React at 18 in this unit so failures are attributable to the Effect port rather than the React upgrade.
- Regenerate `bun.nix` after dependency changes.

**Execution note:** Characterization-first for existing schema and Pandora behavior. Do not start new RPC work until the existing Effect islands pass whole-repo typecheck and tests on v4.

**Patterns to follow:**
- `src/db/config.ts` for existing Effect Schema invariants.
- Existing Pandora tagged errors in `src/sources/pandora/types/errors.ts`.
- Existing Nix/Bun dependency flow documented by `just nix-lock`.

**Test scenarios:**
- Happy path: existing ProseQL schema definitions still decode current album, queue, player, listen-log, and upgrade records.
- Edge case: exact optional fields in DB schemas remain exact after the v4 schema port.
- Error path: invalid upgrade queue status, out-of-range confidence, and invalid retry timestamps still fail validation.
- Integration: existing Pandora Effect operations still surface tagged errors through their current public APIs.

**Verification:**
- Existing Effect-dependent tests and whole-repo typecheck pass on Effect v4.
- `bun.nix` matches `bun.lock` after dependency changes.

---

### U11. Upgrade React runtime and app root compatibility

**Goal:** Upgrade React/React DOM and compatible UI/router dependencies separately from the Effect v4 port so React-specific behavior changes are isolated.

**Requirements:** R3, R5

**Dependencies:** U1

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `bun.nix`
- Modify: `src/web/main.tsx`
- Modify: `src/web/shared/playback/use-playback.ts`
- Modify: `tsconfig.web.json`
- Modify: `package.json`
- Test: `src/web/shared/playback/use-playback.test.tsx`

**Approach:**
- Upgrade React and React DOM to the React 19 target and adjust peer dependencies such as router, Radix, and animation packages only where required.
- Add or confirm a DOM-capable React test harness and web TypeScript coverage so migrated `.tsx` state components and hooks are actually verified, not only bundled by Vite.
- Add playback characterization coverage before or alongside the React upgrade because Strict Mode/effect cleanup behavior can change listener, reconnect, and autoplay timing before the transport migration begins.
- Keep tRPC and React Query providers in place during this unit; the only intended behavior change is framework compatibility.

**Execution note:** Characterization-first for playback lifecycle effects before accepting React 19 behavior.

**Patterns to follow:**
- `src/web/main.tsx` provider hierarchy.
- `src/web/shared/playback/use-playback.ts` manual EventSource lifecycle.

**Test scenarios:**
- Happy path: app root renders with the existing provider hierarchy under React 19.
- Edge case: playback effect cleanup does not create duplicate EventSource connections under Strict Mode.
- Error path: audio error handling and client diagnostic logging still surface playback errors without crashing the app root.

**Verification:**
- React 19 upgrade is independently typechecked and tested before RPC/atom packages are consumed.

---

### U12. Add Effect RPC, atom-react, and Lattice verification wrappers

**Goal:** Add the new runtime packages and project command wrappers without yet changing API behavior.

**Requirements:** R2, R3, R5, R7

**Dependencies:** U1

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `bun.nix`
- Modify: `flake.nix`
- Modify: `justfile`
- Modify: `biome.json`

**Approach:**
- Add Effect RPC, atom-react, and compatible platform/runtime packages as a version-aligned set.
- Add or repair `just lint`, `just format`, and `just test-unit` wrappers so Lattice verification commands exist before broad migration work starts.
- Do not mass-reformat as part of the runtime migration. If the project adopts Lattice 2-space formatting, split that into an isolated formatting change so runtime diffs stay reviewable.
- Regenerate `bun.nix` after lockfile changes.

**Patterns to follow:**
- Existing `justfile` command wrappers.
- Existing Nix/Bun dependency flow documented by `just nix-lock`.

**Test scenarios:**
- Test expectation: none -- this unit is dependency/tooling scaffolding. Behavioral verification is through whole-repo install, typecheck, test, lint/format, and Nix build outcomes.

**Verification:**
- Dependency graph resolves without duplicate incompatible Effect/React major versions.
- Existing unit tests and typecheck still run through project wrappers.
- `bun.nix` matches `bun.lock` after dependency changes.

---

### U2. Define shared Effect Schema contracts and typed RPC errors

**Goal:** Create the shared contract layer that replaces Zod inputs and implicit tRPC output inference with Effect Schema request, response, event, and error contracts.

**Requirements:** R1, R2, R4, R6

**Dependencies:** U1, U12

**Files:**
- Create: `src/api/contracts/common.ts`
- Create: `src/api/contracts/auth.ts`
- Create: `src/api/contracts/library.ts`
- Create: `src/api/contracts/search.ts`
- Create: `src/api/contracts/radio.ts`
- Create: `src/api/contracts/playlist.ts`
- Create: `src/api/contracts/player.ts`
- Create: `src/api/contracts/queue.ts`
- Create: `src/api/contracts/listenLog.ts`
- Create: `src/api/contracts/log.ts`
- Create: `src/api/contracts/track.ts`
- Create: `src/api/contracts/import-boundary.test.ts`
- Create: `server/rpc/parityCanonicalize.test-support.ts`
- Create: `src/api/contracts/common.test.ts`
- Create: `src/api/contracts/library.test.ts`
- Create: `src/api/contracts/player.test.ts`
- Modify: `src/db/config.ts`

**Approach:**
- Define public API schemas by endpoint family, not by database table, with stable RPC tags such as `library.albums.list`, `library.album.get`, `search.unified`, `player.state.get`, and `queue.events.watch`.
- Establish common schemas for composite IDs, source IDs, placement literals, stream URLs, pagination, timestamps, success markers, bounded playback numerics, bounded client-log messages, and command identity fields.
- Define `CompositeTrackId` as either a bounded local opaque ID or `<knownSource>:<boundedSourceId>` with a closed source literal set; use it for player, queue, stream URL, and prefetch inputs.
- Define typed error unions with `_tag` values for validation, unauthorized credentials, Pandora refresh failure, not found, source unavailable, persistence failure, upstream provider failure, and defects. Public error payloads use a closed set of allow-listed fields; they do not expose open `message`, `cause`, stack trace, filesystem path, provider URL, or secret-shaped values.
- Add canonical parity normalization helpers in test support so old tRPC outputs and new Effect Schema encoded outputs are compared through one shared normal form without making parity helpers part of the public contract surface.
- Declare browser/server import boundaries: contract files may import only Effect, other contract files, and explicitly safe primitive utilities. They must not import from `server/**`, provider internals under `src/sources/**`, filesystem/env modules, or modules with DB side effects at import time.
- Reuse existing DB schemas only where the encoded wire shape is identical; otherwise create API-specific schemas that preserve today’s null vs optional behavior.
- Freeze player/queue stream contracts as snapshot/current-state streams: reconnect emits current state once and resumes live updates, not historical replay.

**Execution note:** Implement schema tests first, including negative contract cases from the institutional schema learning.

**Patterns to follow:**
- `src/db/config.ts` for `Schema.Struct`, `Schema.Literal`, exact optional fields, bounded numbers, and domain filters.
- `docs/solutions/correctness/enforce-strict-upgrade-domain-contracts-in-config-and-db-sch.md` for negative schema tests.

**Test scenarios:**
- Happy path: decoding and encoding a current library album response preserves placement, source IDs, artwork, optional year, and hot-state fields.
- Happy path: decoding and encoding a current playback state preserves `null` current track, non-null current track, `streamUrl`, progress, duration, volume, and `updatedAt`.
- Edge case: optional fields that are absent remain absent when the current wire contract omits them.
- Edge case: nullable current playback/queue fields remain `null` where current UI code expects `null`, not `undefined`.
- Error path: invalid placement, invalid status, malformed composite ID, unknown source prefix, out-of-range volume/progress/duration, oversized strings, negative pagination, and malformed event IDs fail schema decoding.
- Error path: an upstream `ApiCallError` with a verbose provider message encodes to an allow-listed public error payload only.
- Error path: a thrown defect containing a path or secret-shaped string never appears in the wire payload.
- Integration: tRPC output and Effect Schema encoded output for the same seeded value canonicalize to the same comparable JSON form.

**Verification:**
- Shared contract modules are importable by both server and web code without importing server-only modules.
- A boundary check fails if `src/api/contracts/**` transitively imports `server/**`, provider internals, filesystem/env modules, or DB-side-effect modules.
- Contract tests prove positive round trips, negative boundary failures, and public-error redaction.

---

### U3. Introduce Effect RPC group and side-by-side `/rpc` server route

**Goal:** Mount Effect RPC beside the existing tRPC handler without changing current user-facing endpoints.

**Requirements:** R1, R2, R4, R6

**Dependencies:** U1, U2

**Files:**
- Create: `src/api/rpc.ts`
- Create: `server/rpc/context.ts`
- Create: `server/rpc/errors.ts`
- Create: `server/rpc/sourceErrorMap.ts`
- Create: `server/rpc/handler.ts`
- Create: `server/rpc/middleware.ts`
- Create: `server/rpc/handler.test.ts`
- Modify: `server/index.ts`
- Modify: `server/lib/ids.ts`
- Test: `server/lib/ids.test.ts`
- Modify: `ARCHITECTURE.md`
- Modify: `server/trpc.ts`

**Approach:**
- Define the combined Pyxis RPC group from the shared contract modules.
- Add an Effect RPC web handler under `/rpc` in `server/index.ts`, after `/stream` and before static/Vite fallback.
- Add the coexistence architecture note when `/rpc` first appears: Pyxis is temporarily dual-transport, and new API work should prefer Effect RPC.
- Preserve `/trpc` unchanged during this unit so existing UI remains live.
- Build an Effect request context that carries source manager access, config, logger, DB access, and optional Pandora session.
- Implement a Pandora auth middleware/layer that matches and hardens `pandoraProtectedProcedure`: require credentials, coalesce concurrent refresh attempts into one login, rate-cap repeated refresh failures, retry once at the request/connect boundary, atomically use the refreshed session/manager for that request, and return typed public errors.
- Ensure `/rpc` responses use the same explicit CORS/credentials policy as the same-origin web app: a single computed allowed origin, no wildcard with credentials, no reflected `Origin`, and matching OPTIONS behavior for old/new transports.
- Ensure state-changing RPCs use a preflighted transport; query and stream transports must not mutate server state.
- Validate `/stream` path IDs and `next=` prefetch hints through the shared composite-ID schema before DB lookup or upstream/provider work. Cross-origin GET-triggered stream work is accepted only under the local single-user trust model and should be bounded by validation and stream-rate safeguards.

**Patterns to follow:**
- `server/index.ts` routing order and the existing warning about not wrapping streaming responses in a way that breaks lifecycle cleanup.
- `server/trpc.ts` for current Pandora session refresh semantics.
- `src/logger.ts` for structured logging.

**Test scenarios:**
- Happy path: a simple read RPC request reaches the handler and returns a schema-encoded response without affecting `/trpc`.
- Edge case: non-`/rpc` paths still fall through to `/stream`, `/trpc`, static files, or Vite exactly as before.
- Error path: malformed RPC payload returns a typed validation error rather than an internal exception string.
- Error path: cross-origin POST from a foreign `Origin` is rejected at preflight, while credentialed requests from the configured app origin succeed.
- Error path: Pandora-protected RPC without credentials returns a typed unauthorized error.
- Error path: concurrent expired-session requests coalesce into one refresh attempt and rate-capped failures fail closed.
- Error path: invalid `/stream` or `next=` IDs return a validation response without DB lookup, upstream provider call, or raw upstream error text.
- Integration: `/rpc` and `/trpc` coexist in the same Bun server without changing `/stream` range responses or Vite fallback.

**Verification:**
- Existing tRPC clients still work after `/rpc` is mounted.
- `/rpc` has contract-level tests and structured logs for handler failures.

---

### U4. Wrap server domain behavior in Effect services/layers

**Goal:** Move handler dependencies behind Effect service/layer seams so both old tRPC adapters and new Effect RPC handlers call one domain implementation during migration.

**Requirements:** R2, R4, R5

**Dependencies:** U2, U3

**Files:**
- Create: `server/rpc/handlers/library.ts`
- Create: `server/rpc/handlers/listenLog.ts`
- Create: `server/rpc/handlers/auth.ts`
- Create: `server/rpc/handlers/log.ts`
- Create: `server/rpc/handlers/track.ts`
- Create: `server/rpc/services/library.ts`
- Create: `server/rpc/services/sourceCatalog.ts`
- Create: `server/rpc/services/session.ts`
- Create: `server/rpc/services/library.test.ts`
- Modify: `server/routers/library.ts`
- Modify: `server/routers/listenLog.ts`
- Modify: `server/routers/auth.ts`
- Modify: `server/routers/track.ts`
- Modify: `server/services/libraryAlbums.ts`
- Modify: `server/services/sourceManager.ts`
- Modify: `server/services/credentials.ts`

**Approach:**
- Start by wrapping existing service modules rather than replacing their internals.
- Expose service contracts through Effect v4 service declarations and production layers.
- Wrap existing synchronous and async functions in Effects at the service boundary; service methods return typed Effect values and never leak raw thrown provider/database errors as public RPC errors.
- Add one shared source/error mapping seam for known upstream failures such as Pandora `ApiCallError`, source-manager failures, network timeouts, and persistence failures. Unknown failures remain defects and are logged/redacted at the RPC boundary.
- Add an allow-listed error-to-log mapper so server logs keep useful `_tag`, code, source, and route context without serializing raw causes, stack traces, provider URLs, filesystem paths, or secret-shaped values.
- Add in-memory/configurable layers for tests where needed, but keep them real implementations with behavior/config inputs rather than mock-prefixed doubles.
- Defer player and queue service wrappers until U8, where the realtime handlers and UI stream consumers are migrated together.
- For coexistence, tRPC adapters for migrated non-realtime families call the same service seam and translate typed errors back to their legacy tRPC error shape where needed.

**Execution note:** Add characterization coverage around existing service behavior before moving any handler logic that currently lacks tests.

**Patterns to follow:**
- `server/services/libraryAlbums.ts` dependency-passing style.
- `server/services/libraryAlbums.test.ts` real temp ProseQL database setup.
- `docs/solutions/feature-patterns/2026-02-10-listen-log.md` for server-owned side effects.

**Test scenarios:**
- Happy path: library service lists albums from a real temp ProseQL database with the same ordering and placement filtering as current code.
- Happy path: listen log service returns paginated entries with stable sort order.
- Error path: source manager failure maps to a typed source-unavailable error.
- Error path: persistence failure maps to a typed persistence error and logs structured context.
- Integration: tRPC adapter and Effect RPC handler call the same service seam for a migrated domain and produce equivalent canonical JSON.

**Verification:**
- No new domain state fork is introduced between tRPC and Effect RPC paths.
- Service tests exercise public service contracts, not private helper shape.

---

### U5. Migrate read-only RPC endpoint families with parity tests

**Goal:** Move low-risk read surfaces to Effect RPC first, proving contracts, browser client wiring, and old/new parity before mutations are migrated.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U2, U3, U4, U11

**Files:**
- Modify: `server/rpc/handlers/listenLog.ts`
- Modify: `server/rpc/handlers/library.ts`
- Modify: `server/rpc/handlers/auth.ts`
- Modify: `server/rpc/handlers/playlist.ts`
- Modify: `server/rpc/handlers/track.ts`
- Create: `server/rpc/parity.test.ts`
- Create: `src/web/shared/api/rpcClient.ts`
- Create: `src/web/shared/api/legacyBridge.ts`
- Create: `src/web/shared/effect/runtime.ts`
- Create: `src/web/shared/effect/layerAtom.ts`
- Modify: `src/web/features/history/history-page.tsx`
- Modify: `src/web/features/home/home-page.tsx`
- Modify: `src/web/shared/track-info-modal/TrackInfoTraits.tsx`
- Test: `src/web/features/history/history-page.test.tsx`
- Test: `src/web/features/home/home-page.test.tsx`

**Approach:**
- Start with read-only endpoints such as `listenLog.list`, `auth.status`, `track.explain`, `playlist.list`, and library album lists/details before touching station or playback flows.
- Build a browser-safe Effect RPC client layer and runtime source that components can consume through atoms/state adapters.
- Establish the legacy refresh bridge in this unit, even if it has few entries at first, so U6 mutations have a named owner for old React Query invalidation.
- For migrated pages, convert RPC results into domain ADTs such as `Loading`, `Ready`, `Empty`, `LoadError`, and `Defect` before rendering.
- Keep old tRPC endpoints active and add parity tests that compare normalized old/new outputs for seeded data through the U2 canonicalization helper.
- Prefer cutting over coherent feature surfaces once a surface includes mutations. U6 owns library/search mutation surfaces; U7 owns source-backed and Pandora/station surfaces so those cross-source flows are cut over together rather than half-migrated across units.
- Avoid adding generic result-boundary frameworks; keep state adapters feature-specific until repeated patterns justify extraction.

**Execution note:** Implement old/new parity tests before switching each read surface in the UI.

**Patterns to follow:**
- Functional state component pattern from the Lattice React guidance.
- Existing route/component ownership in `src/web/features/**`.
- Existing global provider wiring in `src/web/main.tsx`, with transport details kept out of leaf components.

**Test scenarios:**
- Happy path: history page renders ready state from Effect RPC `listenLog.list` with the same entries as the old tRPC endpoint.
- Happy path: home page renders discovery, collection, archive, hot albums, and playlists after their read RPCs resolve.
- Edge case: empty list responses render explicit empty states where the current UI has no records.
- Error path: a typed load error maps to `LoadError` and a defect maps to `Defect`, without exposing raw RPC internals in JSX.
- Integration: old tRPC and new Effect RPC read endpoints return equivalent canonical JSON for the same seeded DB and source-manager configuration.
- Integration: the legacy refresh bridge can invalidate a named remaining tRPC consumer from an Effect-side refresh event without exposing `trpc.useUtils()` to feature components.

**Verification:**
- Migrated read components no longer import `src/web/shared/lib/trpc.ts`.
- Read-only pages keep current loading, empty, error, and ready behavior while using Effect RPC underneath.

---

### U6. Migrate mutations and cross-store refresh semantics

**Goal:** Move command-style endpoints to Effect RPC with explicit command ADTs, optimistic UI where appropriate, and bridge refresh for any remaining tRPC/React Query consumers.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U5

**Files:**
- Modify: `server/rpc/handlers/library.ts`
- Modify: `server/rpc/handlers/radio.ts`
- Modify: `server/rpc/handlers/playlist.ts`
- Modify: `server/rpc/handlers/auth.ts`
- Modify: `src/web/features/album-detail/library-album-detail-root.tsx`
- Modify: `src/web/features/album-detail/source-album-detail-root.tsx`
- Modify: `src/web/features/search/search-page.tsx`
- Modify: `src/web/features/settings/settings-page.tsx`
- Modify: `src/web/features/stations/stations-page.tsx`
- Modify: `src/web/features/stations/rename-station-dialog.tsx`
- Modify: `src/web/features/stations/delete-station-dialog.tsx`
- Modify: `src/web/features/stations/add-seed-dialog.tsx`
- Modify: `src/web/features/sandbox/queue-coverflow/QueueCoverflowPage.tsx`
- Modify: `src/web/shared/keyboard-shortcuts.ts`
- Modify: `src/web/shared/api/legacyBridge.ts`
- Test: `server/rpc/handlers/library.test.ts`
- Test: `server/rpc/handlers/radio.test.ts`
- Test: `src/web/features/album-detail/AlbumDetailState.test.ts`
- Test: `src/web/features/search/SearchState.test.ts`
- Test: `src/web/features/stations/StationCommandState.test.ts`

**Approach:**
- Define command states such as `Idle`, `Submitting`, `Succeeded`, `Failed`, and domain-specific success outcomes such as `Created`, `Restored`, or `Existing` where current services already distinguish them.
- Preserve optimistic-first behavior in Roots/providers rather than leaking pending transport state into children.
- For the coexistence period, every migrated mutation refreshes both new Effect state and old React Query consumers through `src/web/shared/api/legacyBridge.ts`; new feature code should not import `trpc.useUtils()` directly.
- Each bridge entry names the remaining legacy consumer keys it refreshes. When a feature surface has fully moved, its bridge entry is deleted, making U9's removal gate mechanical.
- Migrate library mutations before Pandora-heavy station flows, because library services already have stronger tests and schema-adjacent patterns.
- Cut over coherent surfaces together after the read pilot where the endpoints are within this unit: library album detail roots, library/search save-placement actions, and keyboard/command actions tied to those library mutations. Source-backed album detail and Pandora/station surfaces wait for U7.
- Keep mutation signatures domain-level; do not pass transport clients or environment arguments through component trees.

**Execution note:** Characterize current invalidation behavior before migrating each mutation family, then replace it with explicit state refresh tests.

**Patterns to follow:**
- Current invalidation call sites in `src/web/features/album-detail/**`, `src/web/features/search/search-page.tsx`, and `src/web/features/stations/**`.
- Lattice React Root/provider mutation contract rules.

**Test scenarios:**
- Happy path: saving a source album updates source detail, library detail, home album lists, and search library-state indicators.
- Happy path: changing album placement updates discovery, collection, archive, dismissed, and hot album views without a full page reload.
- Happy path: renaming, deleting, quick-mixing, and adding station seeds update the station list/detail views that still exist during migration.
- Edge case: concurrent placement changes resolve to one authoritative final album state and do not leave stale mixed old/new cache entries.
- Error path: typed validation errors and upstream source errors surface as command `Failed` states with user-safe messages.
- Integration: while both transports coexist, a migrated mutation refreshes remaining React Query consumers and new Effect atom consumers through the bridge.
- Integration: each bridge entry can be deleted once its named legacy consumer keys disappear, and tests fail if a migrated mutation lacks a refresh path for an existing legacy consumer.

**Verification:**
- Migrated command surfaces expose domain command states, not raw mutation objects or boolean forests.
- No migrated mutation leaves known old tRPC consumers stale during the coexistence period.
- No feature component outside the legacy bridge imports `trpc.useUtils()` after its surface migrates.

---

### U7. Migrate Pandora-protected and source-backed flows

**Goal:** Move auth/settings, bookmarks, stations, genres, feedback, sleep, playlist/radio creation, and source-backed search/album detail flows to Effect RPC while preserving centralized Pandora session behavior.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U3, U4, U6

**Files:**
- Modify: `server/rpc/middleware.ts`
- Modify: `server/rpc/handlers/auth.ts`
- Modify: `server/rpc/handlers/radio.ts`
- Modify: `server/rpc/handlers/playlist.ts`
- Modify: `server/rpc/handlers/search.ts`
- Modify: `server/rpc/handlers/track.ts`
- Modify: `src/web/features/bookmarks/bookmarks-page.tsx`
- Modify: `src/web/features/genres/genres-page.tsx`
- Modify: `src/web/features/playlist-detail/playlist-detail-page.tsx`
- Modify: `src/web/features/station-detail/station-detail-page.tsx`
- Modify: `src/web/shared/layout/command-palette.tsx`
- Modify: `src/web/shared/layout/sidebar.tsx`
- Modify: `src/web/shared/layout/mobile-nav.tsx`
- Test: `server/rpc/middleware.test.ts`
- Test: `server/rpc/handlers/radio.test.ts`
- Test: `server/rpc/handlers/search.test.ts`
- Test: `src/web/features/station-detail/StationDetailState.test.ts`

**Approach:**
- Move protected handlers only after the shared Pandora auth layer is tested.
- Preserve one retry after known Pandora auth failures and one source manager refresh path.
- Keep deep endpoint semantics such as source album `getWithTracks` and unified search so React does not reassemble expensive upstream workflows.
- Model provider/source failures as typed load or command errors at the UI seam.
- Keep client diagnostic logging available for playback and command palette flows until their replacement logging RPC is migrated.
- The replacement for `log.client` must bound message length, strip control characters, rate-limit bursts at the handler, store text under a clearly namespaced field, and never echo client log messages back to other clients.

**Patterns to follow:**
- `server/trpc.ts` for current Pandora protected behavior.
- `server/routers/album.ts`, `server/routers/search.ts`, `server/routers/radio.ts`, and `server/routers/track.ts` for current source-backed endpoint semantics.
- `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md` for preserving deep source album behavior.

**Test scenarios:**
- Happy path: authenticated Pandora-backed station and bookmark endpoints return the same domain data as their tRPC predecessors.
- Happy path: unified search and source album details preserve current source IDs, album/track metadata, and library-state resolution.
- Edge case: missing stored credentials produces the same user-facing unauthorized state across settings, stations, bookmarks, and feedback.
- Error path: expired Pandora session triggers refresh and retries once; refresh failure returns the typed auth-refresh error.
- Error path: upstream provider failure maps to a typed source-unavailable error without exposing internal provider stack traces.
- Error path: oversized or bursty client diagnostic log messages are rejected or dropped without buffering unbounded log data.
- Integration: search result actions update library/station state seams after source-backed mutations.

**Verification:**
- All migrated protected endpoints share one auth/session layer.
- No handler copies Pandora refresh logic inline.

---

### U8. Migrate player and queue realtime flows with characterization parity

**Goal:** Replace tRPC subscriptions and manual `/trpc/player.onStateChange` EventSource with Effect RPC/Effect Stream-backed realtime state only after current playback and queue behavior is characterized.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** U5, U6, U7

**Files:**
- Modify: `server/rpc/handlers/player.ts`
- Modify: `server/rpc/handlers/queue.ts`
- Create: `server/rpc/services/player.ts`
- Create: `server/rpc/services/queue.ts`
- Modify: `server/services/player.ts`
- Modify: `server/services/queue.ts`
- Modify: `src/web/shared/playback/use-playback.ts`
- Modify: `src/web/shared/playback/playback-context.tsx`
- Modify: `src/web/shared/playback/types.ts`
- Modify: `src/web/shared/layout/now-playing-bar.tsx`
- Modify: `src/web/features/station-detail/station-detail-page.tsx`
- Test: `server/rpc/handlers/player.test.ts`
- Test: `server/rpc/handlers/queue.test.ts`
- Test: `src/web/shared/playback/PlaybackState.test.ts`
- Test: `src/web/shared/playback/use-playback.test.tsx`

**Approach:**
- First add characterization tests for current player and queue behavior: initial state, heartbeat/reconnect, listener cleanup, mutation response handling, autoplay suppression, progress handoff, track-ended flow, and queue subscription updates.
- Use the U2 snapshot/current-state stream contract: reconnect emits one current state and then live updates; it does not replay missed historical events. Sequence numbers, if present, are only for de-duplication.
- Include `clientRequestId` on command contracts where retry/double-click idempotency matters, and include `appliesToTrackId` on progress, duration, and track-ended reports so stale tabs cannot update the wrong current track.
- Keep current player and queue singleton services as the single source of truth during transport migration.
- Convert server push events, mutation responses, and local audio operations into one playback domain state seam so local-only operations do not drift from server pushes.
- Preserve `streamUrl` generation and comparison behavior, including ignoring `next` hints when deciding whether a track changed.
- Switch queue consumers from tRPC subscription hooks to the new stream only after player lifecycle tests pass.

**Execution note:** Characterization-first. Do not replace the realtime transport until tests cover the existing manual EventSource behavior and the previous pause/resume regression class.

**Patterns to follow:**
- `src/web/shared/playback/use-playback.ts` for existing lifecycle behavior.
- `server/routers/player.ts` and `server/routers/queue.ts` for current serialized state shape.
- `docs/solutions/ui-bugs/pause-resume-restarts-song-playback-20260210.md` for stale-progress risk.

**Test scenarios:**
- Happy path: initial player stream emits current stopped/paused/playing state and does not autoplay a newly loaded track on first app sync.
- Happy path: play, pause, resume, seek, skip, previous, stop, jump, progress report, duration report, and track-ended commands update the same playback state seam.
- Happy path: queue add/remove/jump/reorder updates now-playing and station detail consumers.
- Edge case: reconnect after stream error uses backoff, avoids duplicate listeners, emits current state once, does not replay missed history, and resumes to a coherent state.
- Edge case: first sync after page load suppresses unintended autoplay, but reconnect during the same active session does not re-suppress autoplay or reload the same stream URL.
- Edge case: heartbeats or duplicate events do not reload the same audio source or reset progress unexpectedly.
- Error path: media load/play errors surface as playback error state and preserve diagnostic logging.
- Error path: out-of-range progress/duration reports and stale `appliesToTrackId` reports are rejected without mutating state or emitting to subscribers.
- Integration: `/stream` range requests and prefetch hints continue to work after player RPC migration because audio bytes remain outside RPC.

**Verification:**
- No UI code opens `/trpc/player.onStateChange` after migration.
- Playback and queue behavior match characterization tests before old subscriptions are removed.

---

### U9. Remove tRPC, React Query, and Zod API-contract usage

**Goal:** Delete the old transport/client stack once no runtime code imports it and all endpoint families have Effect RPC replacements.

**Requirements:** R2, R3, R5, R7

**Dependencies:** U5, U6, U7, U8

**Files:**
- Delete: `src/web/shared/lib/trpc.ts`
- Delete: `server/trpc.ts`
- Delete: `server/router.ts`
- Delete: `server/routers/auth.ts`
- Delete: `server/routers/track.ts`
- Delete: `server/routers/album.ts`
- Delete: `server/routers/artist.ts`
- Delete: `server/routers/radio.ts`
- Delete: `server/routers/playlist.ts`
- Delete: `server/routers/library.ts`
- Delete: `server/routers/search.ts`
- Delete: `server/routers/player.ts`
- Delete: `server/routers/queue.ts`
- Delete: `server/routers/log.ts`
- Delete: `server/routers/listenLog.ts`
- Modify: `server/index.ts`
- Modify: `src/web/main.tsx`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `bun.nix`
- Test: `server/rpc/parity.test.ts`

**Approach:**
- Use grep/typecheck to prove no `trpc.*`, `createTRPCReact`, `@trpc/*`, `QueryClientProvider`, or `@tanstack/react-query` imports remain.
- Remove `/trpc` routing after all clients are off it.
- Remove Zod from API routers. Keep the `zod` dependency if runtime config or provider-internal parsers still use it; removing all Zod usage is a separate follow-up unless implementation has already eliminated every non-API import.
- Keep parity tests or convert them into canonical RPC contract tests before deleting old tRPC fixtures.
- Remove React Query only if no non-tRPC feature still uses it.
- Remove the legacy bridge only when all bridge entries are empty and no remaining feature surface depends on React Query invalidation.

**Patterns to follow:**
- Existing `server/index.ts` comments for endpoint routing documentation.
- Current `package.json` dependency organization.

**Test scenarios:**
- Happy path: every previously exposed endpoint family has an Effect RPC equivalent covered by contract or handler tests before old routers are deleted.
- Edge case: application boot no longer creates a tRPC client or QueryClient.
- Error path: old `/trpc` requests fail intentionally after removal rather than silently hitting static fallback.
- Integration: full app typecheck catches any stale client-side tRPC imports.

**Verification:**
- `@trpc/client`, `@trpc/react-query`, `@trpc/server`, and `@tanstack/react-query` are absent from runtime dependencies when unused.
- Zod is absent from API/router contracts; the package may remain only for explicitly deferred non-API parsers or config until a follow-up removes it.
- `/rpc` is the only application RPC transport.

---

### U10. Update docs and runtime architecture records

**Goal:** Bring durable project docs, scripts, and architecture records in line with the new Effect-first architecture.

**Requirements:** R1, R5, R7

**Dependencies:** U9

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `Procfile`
- Modify: `.github/workflows/release.yml`
- Modify: `justfile`

**Approach:**
- Update architecture docs from tRPC/React Query to Effect RPC, Effect Schema, Effect services/layers, and atom-driven frontend state.
- Fix stale database references in docs where they still describe PGlite/Drizzle instead of ProseQL.
- Repair stale scripts and workflow references discovered during research, especially missing `dev:web`, `dev:server`, `npm run build`, or stale CLI paths.
- Keep documentation focused on current architecture and explicit transition decisions; do not preserve outdated tRPC diagrams as active docs.

**Patterns to follow:**
- `ARCHITECTURE.md` as the canonical architecture overview.
- Current `ARCHITECTURE.md` section structure for durable architecture overview updates.

**Test scenarios:**
- Happy path: `ARCHITECTURE.md` describes the active transport state accurately during coexistence and after tRPC removal.
- Edge case: stale command references such as missing dev scripts or release workflow paths are removed or corrected.
- Integration: documented commands in `README.md`, `AGENTS.md`, and `justfile` match actual package scripts.

**Verification:**
- Docs no longer describe tRPC or React Query as the active architecture after U9.
- During coexistence, docs clearly state which transport is preferred for new work and which remains legacy.

---

## System-Wide Impact

### Trust Model

- Pyxis currently behaves as a local, single-user application. Most current tRPC endpoints are unauthenticated from a user-auth perspective; Pandora protection gates upstream credential availability, not Pyxis user authorization.
- This migration must preserve default loopback/same-origin assumptions and must not accidentally make the app safe-looking for non-loopback exposure. Binding to a non-loopback host remains a deployment risk unless a separate auth/CSRF plan addresses it.
- State-changing RPC actions must require preflighted requests, and `/rpc` CORS must use the same explicit single-origin allow-list as the existing app: never `*` with credentials and never reflected `Origin`.

- **Interaction graph:** `server/index.ts`, API handlers, source manager, ProseQL DB, Pandora session refresh, React app root providers, feature Roots, playback context, queue consumers, and stream URL generation all participate in the migration.
- **Error propagation:** Expected API failures become typed `_tag` errors at Effect RPC boundaries; unexpected defects remain defects and are mapped/logged at the server boundary with user-safe client states.
- **State lifecycle risks:** The coexistence period risks stale UI if old React Query caches and new Effect atoms both represent the same server truth. Each migrated mutation needs an explicit bridge refresh until old consumers are removed.
- **Connection and bundle cost:** During coexistence the browser may carry both old and new client runtimes and, for realtime surfaces, both old subscriptions and new streams. This is an accepted temporary cost, not a steady-state architecture.
- **API surface parity:** Every current tRPC endpoint family needs an Effect RPC equivalent or an explicit deprecation decision before old routers are deleted.
- **Integration coverage:** Old/new parity tests, input-validation parity tests, real ProseQL service tests, Pandora auth middleware tests, and playback/queue stream characterization are required because unit tests alone will not prove cross-layer behavior.
- **Unchanged invariants:** `/stream` remains plain HTTP; stream URL format stays valid across both transports during coexistence; source manager remains the provider aggregation seam; existing album/station/playback domain behavior remains the user-visible contract.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Effect v4 / atom package churn breaks dependency upgrade | Split the port into Effect v4 existing-island work (U1), React 19 compatibility (U11), and package introduction/tooling (U12) with separate gates. |
| ProseQL or other dependencies remain Effect-3-only | U1 must resolve compatibility by upgrading, forking, replacing, or vendoring before any new Effect v4 contracts land. |
| Big-bang migration becomes unreviewable | Use side-by-side `/rpc` + `/trpc` and migrate vertical endpoint families in dependency order shown by each unit. |
| Wire contracts drift from current tRPC inferred outputs | Add Effect Schema round-trip tests, input-negative tests matching current Zod behavior, and old/new parity tests for each migrated endpoint family through one canonical comparator. |
| Old React Query and new Effect atom state diverge | Require one named legacy bridge with explicit remaining consumer keys for every migrated mutation until all consumers move. |
| Pandora auth behavior becomes inconsistent or amplifies upstream login traffic | Implement one shared Effect auth middleware/layer with refresh coalescing, rate caps, atomic manager swap, and retry-once semantics before migrating protected endpoints. |
| Playback regressions from realtime transport changes | Migrate player/queue last and require characterization tests for SSE/reconnect/autoplay/progress behavior first. |
| Realtime replay leaks listening history or increases memory pressure | Use current-state-on-reconnect streams with no historical replay buffer; sequence numbers are only for de-duplication. |
| Audio streaming breaks if routed through RPC | Keep `/stream` outside RPC and verify stream URL behavior during playback migration. |
| Stream ID or `next=` validation triggers unintended DB/provider calls | Decode IDs through shared bounded schemas before DB lookup or prefetch and reject invalid IDs without upstream calls. |
| Server-only types or provider secrets leak into the browser, logs, or shared contracts | Enforce forbidden imports for `src/api/contracts/**`; keep all provider credentials/tokens outside public contracts and redacted from config serialization, logs, and wire errors. |
| Local single-user app is accidentally exposed as if it had auth | Preserve loopback/same-origin trust posture, preflighted mutating RPCs, and explicit CORS allow-list; document non-loopback exposure as unsafe without separate auth work. |
| Documentation and scripts mislead future agents | Update docs, Procfile, workflows, and just recipes after transport removal. |

---

## Alternative Approaches Considered

- Effect 3-compatible RPC first, React 19 / Effect v4 atoms later: rejected by user preference for the full Lattice target now, though the plan still borrows its staged migration discipline.
- Big-bang rewrite from tRPC/React Query to Effect RPC/atoms: rejected because playback, queue, auth refresh, stream routing, and dozens of direct hook consumers make this too risky to review or verify.
- Adapter that preserves existing `trpc.*.useQuery()` call sites while swapping transport underneath: rejected because it would preserve the leaky transport hook architecture that Lattice is trying to remove.
- Move `/stream` into Effect RPC: rejected because byte-range audio streaming and prefetch behavior are better modeled as plain HTTP.

---

## Documentation / Operational Notes

- Dependency work must update `bun.lock` and regenerate `bun.nix`.
- Runtime logs should continue through `src/logger.ts`; client-side playback diagnostics need an Effect RPC replacement before `trpc.log.client` disappears.
- `ARCHITECTURE.md` should be updated once `/rpc` is established and again when `/trpc` is removed if the migration spans multiple PRs.
- If the migration is split across PRs, each PR should state which endpoint families still run through `/trpc` and which have moved to `/rpc`.

---

## Sources & References

- Handoff input: `/tmp/handoff-J4DZ3z.md`
- Current architecture: `ARCHITECTURE.md`
- Current tRPC server setup: `server/trpc.ts`, `server/router.ts`, `server/routers/*.ts`
- Current HTTP routing: `server/index.ts`
- Current web client setup: `src/web/shared/lib/trpc.ts`, `src/web/main.tsx`
- Current playback seam: `src/web/shared/playback/use-playback.ts`
- Current schema pattern: `src/db/config.ts`
- Current service test pattern: `server/services/libraryAlbums.test.ts`
- Institutional learning: `docs/solutions/correctness/enforce-strict-upgrade-domain-contracts-in-config-and-db-sch.md`
- Institutional learning: `docs/solutions/feature-patterns/2026-04-15-shared-primitives-react-audit.md`
- Institutional learning: `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`
- Institutional learning: `docs/solutions/feature-patterns/2026-02-10-listen-log.md`
- Institutional learning: `docs/solutions/ui-bugs/pause-resume-restarts-song-playback-20260210.md`
- Effect RPC docs: https://effect-ts.github.io/effect/docs/rpc
- Effect Schema docs: https://effect.website/docs/schema/introduction/
- Effect v4 notes: https://effect.website/blog/releases/effect/40-beta/
