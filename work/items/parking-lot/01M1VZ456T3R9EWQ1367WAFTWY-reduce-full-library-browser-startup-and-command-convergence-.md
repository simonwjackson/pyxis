---
id: 01M1VZ456T3R9EWQ1367WAFTWY
slug: reduce-full-library-browser-startup-and-command-convergence-
title: Reduce full-library browser startup and command convergence time
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-09-06
source: se-work
---

# Reduce full-library browser startup and command convergence time

## Why it matters

The deployed M3 smoke with two real Chromium profiles and 370 albums measured 87 seconds for a fresh profile and 153 seconds for a restored profile receiving the artwork backfill. The restored profile temporarily exceeded the 120-second realtime resync budget before recovering. Bidirectional transport convergence is taking roughly 3–8 seconds. These delays remain a product-acceptance risk even when state and audio ownership converge correctly.

## Acceptance Criteria

- [ ] Profile the real ProseQL/IndexedDB worker path with a 370-album account and identify dominant costs before changing it.
- [ ] Reduce first-load and large-update startup enough to avoid the current resync timeout on representative devices.
- [ ] Measure command-to-renderer and command-to-durable-state latency separately in both directions.
- [ ] Preserve pull-before-push, durable-cursor ordering, cross-tab locking/account fences, startup-only storage failover, and retryable writes.

## Related

- `clients/app/src/worker/proseql-engine.ts`
- `clients/app/src/worker/database.ts`
- `clients/app/src/worker/client.ts`
- `clients/app/src/worker/sync.ts`
- `clients/app/src/reference/App.tsx`
- `work/items/active/20260821123211-pyxis-v2-rewrite/work.md`

## Notes

Observed 2026-09-06 on deployed ecbb285 with Chrome 146.0.7680.75. Browser A used a loopback CONNECT proxy; proxied HTTPS health was 16 ms, so the measured startup delay is not established as network latency. Do not simply raise timeouts or bypass durable writes.
