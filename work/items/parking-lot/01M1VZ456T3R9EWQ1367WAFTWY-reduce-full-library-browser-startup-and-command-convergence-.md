---
id: 01M1VZ456T3R9EWQ1367WAFTWY
slug: reduce-full-library-browser-startup-and-command-convergence-
title: Reduce full-library browser startup and command convergence time
origin: parked
status: In Progress
priority: high
labels:[]
created: 2026-09-06
source: se-work
---

# Reduce full-library browser startup and command convergence time

## Why it matters

The deployed M3 smoke with two real Chromium profiles and 370 albums measured 87 seconds for a fresh profile and 153 seconds for a restored profile receiving the artwork backfill. The restored profile temporarily exceeded the 120-second realtime resync budget before recovering. Bidirectional transport convergence is taking roughly 3–8 seconds. These delays remain a product-acceptance risk even when state and audio ownership converge correctly.

## Acceptance Criteria

- [x] Profile the real ProseQL/IndexedDB worker path with a 370-album account and identify dominant costs before changing it.
- [ ] Reduce first-load and large-update startup enough to avoid the current resync timeout on representative devices.
- [x] Measure command-to-renderer and command-to-durable-state latency separately in both directions.
- [x] Preserve pull-before-push, durable-cursor ordering, cross-tab locking/account fences, startup-only storage failover, and retryable writes.

## Related

- `clients/app/src/worker/proseql-engine.ts`
- `clients/app/src/worker/database.ts`
- `clients/app/src/worker/client.ts`
- `clients/app/src/worker/sync.ts`
- `clients/app/src/reference/App.tsx`
- `work/items/active/20260821123211-pyxis-v2-rewrite/work.md`

## Notes

Observed 2026-09-06 on deployed ecbb285 with Chrome 146.0.7680.75. Browser A used a loopback CONNECT proxy; proxied HTTPS health was 16 ms, so the measured startup delay is not established as network latency. Do not simply raise timeouts or bypass durable writes.

The later normal/incognito manual test failed responsiveness acceptance. Instrumented production
Chromium traces found session events and command acknowledgements blocking the realtime lane
with full-library synchronization, media reconciliation, and redundant reads. `6855cf0` adds
atomic session events with delayed-acknowledgement recovery; `578f11b` adds session-scoped replay;
`12e422e` prevents a reproduced Stop restart while its storage write is pending. All three
received independent reviews. Final verification includes 232 client and 71 plugin/SDK tests,
PWA/Nix builds, and real-browser transport/handoff/network/reload checks.

Idle renderer effects measured 335–455 ms after the fixes. Back-to-back follow-up Play/Pause
still took 1467–2930 ms, versus 3023–4482 ms initially. Core/UI convergence is measured separately;
the displayed deferred count is not a live outbox measurement. A later two-host run during high disk-I/O pressure was much worse: up to 14459 ms for a
renderer effect and 22615 ms for core/UI convergence. This bad sample is retained, not
attributed conclusively to the concurrent build. A later repeat with sampled I/O and memory
pressure at zero measured 488–1488 ms renderer effects in both directions, with all functional
assertions passing. First/full-library startup is
not improved or remeasured. Keep this item open: responsiveness still needs user acceptance
and startup work remains. Detailed evidence is in
`docs/operations/2026-09-06-m3-reconnect-validation.md`.

After the user still reported 2–3 seconds, `d126106` removed ProseQL initial-data seeding
from reopens. Real-WASM tests measured 24 unintended writes across three read-only reopens;
the fix performs zero while retaining full collection loading, locks, and durable mutation
flushes. Internal worker-memory fallback now rejects so it cannot be silently discarded on
the next lock. All 237 client and 71 plugin tests pass with explicit Node 22; independent
reviews and production/PWA/Nix gates pass. The production two-host repeat measured 352–695 ms
renderer effects and 1008–1348 ms core/UI convergence, including successive commands.
Transport, handoff, refused offline intent, reconnect, and reload passed. Keep the item open
for fresh/full-library startup and user acceptance. See
`docs/operations/2026-09-06-m3-read-only-reopens.md`.
