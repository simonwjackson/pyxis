# M3 latency: make database reopens read-only

## Status and deployment

After the previous latency fixes, the user still reported **2–3 seconds** between browsers.
M3 remains unaccepted. This pass improves the measured response again; it does not establish
physical-device audibility, phone behavior, or acceptable feel.

- Runtime: `d1261064f7e321f81b711abea339629fa311fb82`.
- Nix profile entry: `pyxis`, explicitly locked to that Git revision.
- Package: `/nix/store/k1nkn9cdv84acg8jwifygyrwz3jgw3hf-pyxis-2.0.0`.
- Bundle: `assets/index-C1ucwJRb.js`; worker schema remains 8.
- Origin: `https://pyxis.hummingbird-lake.ts.net`.

The exact revision was built, added alongside the older profile entry, verified, then made
active by removing the older entry and restarting the user core. Read-only observation found
no live user playback before deployment. Automated commands targeted only the two established
diagnostic sessions, never the user's sessions. No Sonos commands, pushes, or NixOS switches.

## Reproduction and correction

The worker correctly closes/reopens ProseQL under Web Locks to avoid stale collection queries.
But `createProseqlEngine` supplied eight empty arrays as `initialData` on every open. In pinned
ProseQL 0.16.0, every supplied initial-data collection is marked dirty, including an empty
array, and the worker constructor flushes those writes before returning.

A real-WASM regression reproduced **24 unwanted writes across three read-only reopens**.
An authoritative session update caused nine writes: all eight collections on open, followed
by the session mutation. This included rewriting the unrelated album library on a settings
or session read. Earlier session-scoped sync removed logical album operations but had not
removed this adapter-level work.

`d126106` passes `undefined` for initial data. The complete collection definitions, paths,
account fences, schema, refresh-under-lock and `writeDebounce: 0` remain unchanged. Existing
rows load normally; missing collections start empty; application schema initialization still
writes its metadata. Actual mutations still wait for durable flush.

The fix also handles a newly reachable failure boundary. Without constructor writes, a
first-run quota failure can occur during schema stamping. `openWorkerDatabase` can then
return an internal memory fallback, which the persistent worker would discard on every
subsequent reopen. The entry now closes the original handle and rejects that result. The
page's existing `open()` failure path can select a stable startup fallback; runtime operations
reject instead of silently substituting fresh memory. Existing schema-reset rules are unchanged.

No partial/scoped engine or cached-open shortcut was introduced. All collections still load
and deserialize on reopen, so those costs remain possible future bottlenecks.

## Verification

Five new tests cover:

1. Three read-only reopens perform zero writes and retain byte-identical data across all eight
   seeded collections, including queued intent and command receipts.
2. A session event writes only the session collection and survives reopen.
3. Readable storage remains persistent when a later mutation rejects quota; its old row survives.
4. The worker rejects an internal ephemeral result during startup and closes the original handle.
5. A failed runtime reopen rejects instead of returning fresh memory state.

The first two and entry cases were explicitly run red. The late-quota test supplements that
reproduction. Real-WASM tests use a Web Storage host; entry tests inject memory-backed handles.
They are not browser IndexedDB quota-injection tests.

Independent reviews checked the actual pinned implementation's initial-data scheduling,
configured-file loading, missing-file behavior, strict IndexedDB transaction completion,
mutation flush/quarantine, close semantics, and startup/runtime fallback ownership. Both
review passes found no remaining blocker within this slice.

Final gates: **237 client tests across 18 files and 71 plugin/SDK tests**, typechecking,
owned-source Biome, Rust tests/Clippy/formatting, shellcheck, contract drift, production/PWA
build, exact-commit Nix package build, and host flake check pass.

`just verify` still stops at unrelated prototype lint (25 errors, 16 warnings). A background
system-shell aggregate also failed the four previously known Console cases because that
process's Nix shell had no Node on PATH. Prepending explicit Node 22.22.1 made the same command
pass. The dev shell does not provide Node; the foreground tool had inherited it. This evidence
updates the existing test-runner follow-up rather than claiming the default gate is fixed.

## Production two-browser results

Chromium used the same restored profiles, real workers, WASM, IndexedDB, Web Locks and service
workers. A's connection used the browser-only CONNECT proxy. Each script asserted the exact
bundle and diagnostic session IDs before commands. Browser audio was muted.

| Command | B → A renderer effect | B → A core/UI convergence | A → B renderer effect | A → B core/UI convergence |
|---|---:|---:|---:|---:|
| Play | 517 ms | 1150 ms | 352 ms | 1008 ms |
| Pause | 521 ms | 1172 ms | 565 ms | 1197 ms |
| Play | 579 ms | 1204 ms | 576 ms | 1163 ms |
| Stop | 552 ms | 1206 ms | 695 ms | 1348 ms |

These include successive commands, not five-second-idle samples. The previous quieter
bidirectional repeat on `12e422e` measured 1289–1488 ms for follow-up Pause/Play/Stop effects.
The new sample measured **352–695 ms** overall, with core/UI convergence **1008–1348 ms**.
Core/UI convergence is not the exact instant of local outbox drain; the displayed deferred
count is a previous sync report. Eight samples are not a statistical latency guarantee.

Pressure was sampled every two seconds. I/O and memory full-stall `avg10` each peaked at 1.47%
during this run. The earlier severe-I/O-pressure result remains documented in the preceding
report; this pass does not prove performance under that workload.

The complete functional smoke also passed:

- Warm startup: B 2538 ms; A 2811 ms, with all 370 cached albums. Fresh full-library sync was
  not remeasured and is not claimed fixed.
- Local and bidirectional remote Play/Pause/Stop; only the intended renderer played.
- Stopped handoff both ways, empty source with no current track, and recipient Play/Stop:
  3974 ms forward and 4645 ms back.
- A real connection cut, core unreachability, and rejected offline command: 69 ms observation.
  Recovery: 3748 ms including a deliberate 2500-ms no-replay observation. This is not a
  silent-blackhole detection test.
- Durable reload preserved A's identity and original three queue entries.
- No Stop restart appeared in the recorded media events.

## Cleanup and next acceptance

Both diagnostic browsers and the proxy are stopped. Public observation verified A
`01M12Q96B93ZH4K8FCJ468XAVD` stopped/unreachable at revision 109 with three entries, and B
`01M1VZ1EJDRKSSXPS839H5GH38` stopped/unreachable at revision 77 with no queue/current track.
The library still has 370 albums. Local/tailnet health return 200, all three user units are
active, LAN `/rpc` returns 404, and no matching warning/error appeared in the last ten minutes
of the core journal.

Next: refresh the user's normal/incognito windows and recheck actual response, including
successive commands. Do not mark M3 accepted from muted automation. Physical-device audible
playback, autoplay, handoff, and background/network behavior remain separate acceptance work.
The broader performance item remains open for startup and product acceptance.

Local evidence:
- `/tmp/pyxis-m3-no-seed-two-browser.log`
- `/tmp/pyxis-m3-no-seed-pressure.jsonl`
- `/tmp/pyxis-m3-no-seed-cleanup.log`
- `/tmp/pyxis-m3-no-seed-explicit-node-tests.log`
- `/tmp/pyxis-m3-no-seed-final-gates.log`
- `/tmp/pyxis-m3-read-only-open-review.md`
- `/tmp/pyxis-m3-no-seed-entry-review.md`
