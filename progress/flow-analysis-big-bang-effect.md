# Flow Analysis: Big-Bang Effect Runtime Cutover

## Codebase Context

- Current production API is tRPC in `server/routers/**`, mounted by `server/index.ts` at `/trpc`; the same file also owns `/stream/:compositeTrackId`, `/android-media-bridge/**`, health, static files, and Vite fallback.
- Browser wiring is global tRPC + React Query in `src/web/main.tsx` and `src/web/shared/lib/trpc.ts`; route/features import `trpc.*` directly across home, search, album detail, stations, settings, bookmarks, history, command palette, keyboard shortcuts, now-playing, and sandbox.
- Existing Effect Schema contracts in `src/api/contracts/**` are shallow parity islands, not a complete API contract. Some shapes already encode stricter rules than current services, especially player/queue numerics and composite IDs.
- Playback/queue are the highest-risk realtime seams: `src/web/shared/playback/use-playback.ts` manually opens `EventSource("/trpc/player.onStateChange")`, coordinates HTML audio side effects, mutation responses, heartbeats, reconnect backoff, autoplay suppression, progress handoff, and local media errors. Queue subscriptions are used in now-playing and station detail.
- `server/services/player.ts` and `server/services/queue.ts` are singleton state owners with persistence, listen-log side effects, radio auto-fetch, and subscribers. The Android media bridge (`/android-media-bridge/**`) also commands/subscribes to the same player singleton and must remain coherent after the RPC cutover.
- `server/trpc.ts` centralizes Pandora session context and refresh-on-auth-error behavior; `server/services/autoLogin.ts` separately registers radio auto-fetch and restores persisted player/queue state after the server starts.

## User Flows

1. **App/server boot and route dispatch**
   - Entry: user starts Pyxis or opens web/Android client.
   - Happy path: config loads; source manager/credentials are configured; Bun routes health, Android bridge, stream, RPC, and web fallback correctly; auto-login restores Pandora and player/queue state.
   - Terminal states: app usable; app usable without Pandora credentials; restored paused playback; boot failure/internal 500.
   - Branches: dev Vite vs static build; Android bridge enabled/disabled; auto-login success/failure; route order collision.

2. **Web initial load and read surfaces**
   - Entry: direct navigation to home/search/history/settings/stations/album routes.
   - Happy path: React root provides Effect runtime/layers; atoms call Effect RPC; raw results become feature ADTs; UI renders Loading/Ready/Empty/LoadError/Defect with current product behavior.
   - Terminal states: ready page, explicit empty state, typed load error, redacted defect.
   - Branches: no Pandora credentials, provider unavailable, DB empty, RPC validation error, stale cached data during navigation.

3. **Library/search/station mutations and refresh**
   - Entry: save album, change placement, edit metadata, create station, rename/delete station, add/remove seed, bookmark/feedback/sleep.
   - Happy path: command sends one RPC mutation; server applies current domain behavior; all affected views update without reload.
   - Terminal states: succeeded state, failed state with safe message, no-op/unavailable where current services no-op.
   - Branches: concurrent clicks, stale view state, provider auth refresh, partial upstream success, DB flush failure.

4. **Pandora-protected source flows**
   - Entry: stations/bookmarks/settings/feedback/Pandora search or radio track fetch.
   - Happy path: stored credentials yield session/source manager; protected operation succeeds; expired session refreshes once and retries.
   - Terminal states: success, unauthorized/no credentials, auth refresh failed, provider unavailable.
   - Branches: concurrent expired sessions, repeated refresh failures, auto-fetch refresh outside request handlers, Pandora raw error with sensitive provider detail.

5. **Playback and audio stream lifecycle**
   - Entry: user plays album/station/search result, resumes restored state, uses now-playing controls, or browser reconnects.
   - Happy path: command updates player singleton; stream emits current snapshot; browser loads `/stream/...`, suppresses unintended first-load autoplay, syncs play/pause/progress, reports duration/progress, handles track ended and prefetches next.
   - Terminal states: playing, paused, stopped, local media error, RPC/stream disconnected with retry.
   - Branches: duplicate/heartbeat events, stale tab progress report, double-click commands, stream range failure, autoplay policy rejection, reconnect during active playback.

6. **Queue realtime consumers**
   - Entry: user opens now-playing/station detail or manipulates queue.
   - Happy path: initial queue snapshot arrives, updates propagate to all consumers, radio auto-fetch appends when low.
   - Terminal states: current queue, empty queue, stream disconnected, provider auto-fetch failure logged but non-fatal.
   - Branches: remove current/previous item, jump out of range, shuffle empty queue, concurrent queue/player commands.

7. **Android media controls**
   - Entry: Android MediaSession polls `/android-media-bridge/state`, opens `/events`, or posts `/commands`.
   - Happy path: token-authorized commands affect the same player singleton as web RPC; events/state projections stay current.
   - Terminal states: applied/noop/unavailable/rate-limited/unauthorized.
   - Branches: bridge disabled, stale Android state, rate limit, player service refactor accidentally forks state.

8. **Plain HTTP streaming**
   - Entry: browser audio element requests `currentTrack.streamUrl`, range request, or `next=` prefetch hint.
   - Happy path: `/stream/:id` validates/decodes ID, resolves source, honors Range and format, optionally prefetches next, returns audio bytes outside RPC.
   - Terminal states: 206/200 audio, 400 unsupported format/invalid ID, 502 upstream stream error, abort cleanup.
   - Branches: malformed opaque/composite IDs, invalid `next`, upstream timeout, CORS differences from RPC.

## Gaps

### Critical

1. **The old plan still encodes a production strangler (`/rpc` + `/trpc`) instead of a product-boundary big-bang.**
   - Missing: an explicit rule for what may exist only on the branch versus what ships. The current plan relies on a legacy React Query bridge and side-by-side transports as production migration machinery.
   - Why it matters: developers may implement compatibility code that should never ship, increasing state-fork and stale-cache risk during the cutover.
   - Codebase pattern/default: `server/index.ts` can host both routes, but the confirmed posture should use dual transport only for branch-internal parity/characterization, then ship one commit/release with `/trpc`, tRPC providers, and bridge removed.

2. **No single cutover readiness gate is defined for all externally observable endpoints.**
   - Missing: a complete inventory/gate that every current tRPC endpoint, browser consumer, Android bridge dependency, `/stream` behavior, and dependency removal condition is satisfied before production cutover.
   - Why it matters: big-bang means one missing endpoint or consumer is a product outage, not a staged fallback.
   - Codebase pattern/default: use grep/typecheck (`trpc.`, `@trpc/*`, `QueryClientProvider`, `/trpc/`) plus endpoint parity tests against `server/routers/**` before deletion.

3. **Realtime playback command/report idempotency and stale-client protection are under-specified for the cutover.**
   - Missing: final contracts for `clientRequestId`, `appliesToTrackId`, duplicate stream events, progress/duration/trackEnded reports from stale tabs, and double-click retries.
   - Why it matters: current `reportProgress`, `setDuration`, and `trackEnded` mutate the singleton without track identity; a stale or reconnecting client can update the wrong track after transport changes.
   - Codebase pattern/default: preserve singleton services, but add guarded command/report inputs and reject stale reports without emitting state.

4. **Effect RPC streaming semantics are not mapped to current manual SSE behavior.**
   - Missing: exact event framing, heartbeat cadence, reconnect behavior, cleanup lifecycle, and browser consumer API replacing `EventSource("/trpc/player.onStateChange")` and `trpc.queue.onChange.useSubscription`.
   - Why it matters: `server/index.ts` has a specific warning that wrapping streaming responses broke cleanup; playback relies on initial snapshot + heartbeat + backoff behavior.
   - Codebase pattern/default: snapshot-on-connect, live updates only, heartbeat retained for player, cleanup tested by listener count/subscription teardown.

5. **Android media bridge coherence is not called out as a cutover blocker.**
   - Missing: proof that `/android-media-bridge/state|events|commands|logs` still shares the same player state after `server/rpc/services/player.ts`/Layer work.
   - Why it matters: recent Android media session work commands `PlayerService` directly; a new Effect service instance or in-memory layer could fork web and Android controls.
   - Codebase pattern/default: keep one production player/queue singleton behind the Effect service layer until a deliberate state-store redesign exists; include bridge tests in the cutover gate.

### Important

6. **Contract parity is incomplete for real endpoint shapes.**
   - Missing: full schemas for radio station detail/list fields, raw Pandora search/bookmark/settings shapes, playlist details, album `getWithTracks`, library mutation results, and null-vs-optional rules.
   - Why it matters: current `src/api/contracts/**` omits or loosens several shapes (`pandoraArtists: Unknown`, partial radio schemas), so UI code may silently receive drifted data.
   - Codebase pattern/default: create endpoint-by-endpoint Effect Schema contracts from current router outputs and add negative tests like existing `src/api/contracts/*.test.ts`.

7. **Current service no-op/clamp behavior conflicts with stricter schemas.**
   - Missing: decisions for invalid indices, negative seek/progress/duration, out-of-range volume, empty arrays, and malformed IDs: validation error, clamp, or legacy no-op?
   - Why it matters: player/queue services currently clamp/no-op in places while schemas reject some inputs. Changing these semantics can alter UX and tests.
   - Codebase pattern/default: preserve product behavior unless dangerous; add explicit typed `ValidationError` only where current behavior is unsafe or externally invalid.

8. **React Query cache semantics need replacement before removal, not a production bridge.**
   - Missing: final Effect atom refresh/invalidation model for multi-view updates after save album, placement changes, station mutations, feedback/bookmark, and queue updates.
   - Why it matters: current features depend on `trpc.useUtils()` invalidations scattered across pages/dialogs. Big-bang removal requires all affected atoms to refresh coherently on day one.
   - Codebase pattern/default: branch-internal bridge may characterize existing invalidations; final code should have named atom/service refresh seams and no React Query bridge.

9. **Branch-internal parity strategy is ambiguous after deleting old routers.**
   - Missing: whether parity tests run against live old routers before deletion, copied characterization fixtures, or a retained test-only legacy harness.
   - Why it matters: once `server/routers/**` and `server/trpc.ts` are deleted, old/new parity can no longer execute unless captured first.
   - Codebase pattern/default: add characterization/parity tests first, snapshot/canonicalize old outputs, then convert them into permanent Effect RPC contract/handler tests before deletion.

10. **Server startup readiness and restored playback state are not modeled in the new runtime.**
   - Missing: whether RPC reads during async `tryAutoLogin()`/`restoreFromDb()` see empty unauthenticated state, loading/restoring state, or block until initialization finishes.
   - Why it matters: current server starts before auto-login restore completes; first web/Android clients may observe a transient stopped/manual state.
   - Codebase pattern/default: preserve current non-blocking boot only if characterized; otherwise add a documented readiness/init layer and user-visible Loading/Unavailable states.

11. **Protected auth behavior must include auto-fetch and source-manager globals, not only request middleware.**
   - Missing: how Effect session layers coordinate with `setGlobalSourceManager`, `registerPandoraPlaylistItems`, and queue radio auto-fetch refresh logic.
   - Why it matters: station playback depends on `radio.getTracks` registering Pandora playlist items for streaming and auto-fetch handling expired sessions outside normal RPC requests.
   - Codebase pattern/default: centralize session/source-manager refresh in one service used by RPC handlers and auto-fetch, not only an RPC middleware.

12. **Plain `/stream` validation and CORS behavior could accidentally change during route rewiring.**
   - Missing: exact expected responses for invalid IDs, invalid `next`, unsupported format, Range, abort, and CORS headers after `/trpc` is removed and `/rpc` is mounted.
   - Why it matters: `/stream` is intentionally plain HTTP and currently returns wildcard CORS on stream errors, while API CORS is credentialed single-origin.
   - Codebase pattern/default: keep `/stream` routing before RPC/static fallback and characterize byte-range responses with existing `server/services/stream.test.ts` plus integration route tests.

13. **Dependency upgrade sequencing is a product risk with Effect v4 beta + React 19.**
   - Missing: a rollback/checkpoint plan for converting current Effect 3-style imports/contracts and React root behavior before RPC/atom work begins.
   - Why it matters: the same `effect` import is used in DB/API contracts and provider calls; a failed upgrade can block unrelated endpoint migration.
   - Codebase pattern/default: first branch checkpoint should be dependency/tooling compile + existing tests green, before API rewrites.

### Minor

14. **Logging RPC replacement needs explicit UX/ops limits.**
   - Missing: final behavior for oversized/bursty client logs, control characters, and failures from playback diagnostic logging.
   - Why it matters: `use-playback.ts` logs frequently; if logging fails noisily it can pollute playback state or network load.
   - Codebase pattern/default: fire-and-forget, bounded, rate-limited, never echoed to clients.

15. **Post-removal `/trpc` behavior should be intentional.**
   - Missing: whether old `/trpc/*` returns 404/410 JSON/plain text or falls through to SPA/static fallback.
   - Why it matters: stale clients/bookmarks should fail clearly, not render the web app for API paths.
   - Codebase pattern/default: add explicit removed-route response before static/Vite fallback.

## Questions

1. **Should any dual `/rpc` + `/trpc` or React Query bridge code be allowed to ship, or is it strictly branch-internal test scaffolding?**
   - Stakes: determines architecture and cleanup burden.
   - Default: strictly branch-internal; production cutover ships only Effect RPC/atoms and no tRPC provider/bridge.

2. **What is the exact production cutover gate?**
   - Stakes: big-bang without a gate risks missing an endpoint or stale consumer.
   - Default: no `trpc` imports/strings except tests, all current endpoint families covered by Effect RPC tests, `/stream` and Android bridge integration tests pass, full `just typecheck && just test-unit && just lint` pass.

3. **For playback reports, should stale `appliesToTrackId` progress/duration/ended commands be rejected silently, return a typed no-op, or surface a user error?**
   - Stakes: stale tabs can corrupt current playback state.
   - Default: typed no-op/unavailable response, logged at debug/warn, no subscriber emission.

4. **Do invalid queue/player commands preserve legacy no-op/clamp behavior or become validation errors?**
   - Stakes: affects UX for out-of-range seek/jump/volume and tests.
   - Default: preserve clamp for volume/seek, preserve no-op for invalid queue index, reject malformed/non-finite values at schema boundary.

5. **Should server boot block API readiness until auto-login and playback restore finish?**
   - Stakes: affects first web/Android state after restart.
   - Default: preserve non-blocking boot, but expose/handle a transient restoring state only if characterization shows user-visible races.

6. **How should old/new parity survive after old routers are deleted?**
   - Stakes: permanent verification cannot depend on removed code.
   - Default: run live parity before deletion, then keep canonical fixtures/contract tests for permanent coverage.

7. **What should `/trpc/*` return after the cutover?**
   - Stakes: stale clients should fail predictably and not hit SPA fallback.
   - Default: explicit 410 Gone or 404 API response before static/Vite fallback.

## Recommended Next Steps

1. Rewrite the plan around **branch-internal preparation + one production cutover**, removing production strangler language and making bridge/dual routes temporary test scaffolding only (Q1).
2. Add a cutover checklist/inventory table covering every current router endpoint, every `trpc.*` consumer, `/stream`, `/android-media-bridge/**`, and dependency removals (Q2).
3. Move playback/queue characterization earlier as a prerequisite, not a late unit: current manual SSE/audio behavior is the main product-risk surface (Q3, Q4).
4. Define final Effect RPC stream event semantics and route-order/CORS behavior before implementation touches `server/index.ts`.
5. Expand API contracts endpoint-by-endpoint from current router outputs, including radio/search/Pandora raw shapes and null-vs-optional parity.
6. Decide the parity artifact strategy before deleting old routers: live old/new tests first, then permanent canonical fixtures/Effect handler tests (Q6).
7. Add Android bridge and `/stream` preservation tests to the same release gate as web RPC migration, because both depend on the player/queue singleton but are not tRPC clients.
