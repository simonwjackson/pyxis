# M3 browser handoff: silent click loss

## Status

The user reported browser-to-browser handoff moved neither queue nor sound and showed no
error, even after retrying from the four-track browser toward the empty browser. **Sonos
investigation remains paused at the user's request.**

Public reads after that retry showed the source still paused with four tracks at revision 71,
and the destination still stopped/empty at revision 18. No transfer had committed. This
ruled out a completed transfer hidden only by stale UI; it did not identify the failed request
or capture the user's pointer gesture.

`560b53099ccc66a00b9918d7396fc4326d72e742` fixes a newly reproduced silent-click defect. It
supersedes the deployment in [the preceding report](2026-09-06-m3-handoff-sonos-follow-up.md).
The user later identified the wrong initiating device and asked to move on, resolving the
reported handoff issue. This is not evidence that either diagnostic correction caused their
resolution. Bidirectional transport and provisional responsiveness acceptance are unchanged.

## Reproduction and correction

The realtime handler replaces a remote session by removing its previous row and appending
the updated row. The Other devices view rendered that arrival order directly. Even a
same-revision event with unchanged visible content could therefore move its controls.

An isolated Chromium fixture used the real `ReferenceApp` and `ReferenceRemote`, a memory
worker, and a fake client. It held a native mouse press for 80 ms, delivering a session event
between mouse-down and mouse-up. HTTP interception allowed only GETs to the local fixture
server; no live account or core mutation was involved.

| Trial | Destination button Y | Handoff calls |
| --- | --- | --- |
| Baseline, no intervening update | 221.125 | 1, correct source/target |
| Before fix, intervening update | 221.125 → 200.125 | 0; driver assertion failed |
| After fix, intervening update | 221.125 → 221.125 | 1, correct source/target |

The browser cancelled the click when the button moved away before release. No callback
meant no RPC, queue movement, or error. Earlier immediate press/release automation missed
this case. This reproduces the reported class of failure, not proof of the user's exact gesture.

The view now sorts a **copy** of the remote-session array by immutable session ID. Realtime
replacement and differently ordered full snapshots no longer reorder unchanged membership.
It preserves React identity keys and target callbacks, and adds `data-session-id` for precise
row locators. No worker state, transport contract, renderer behavior, or schema changed.
The earlier cleared-source teardown fix remains in place.

This does not freeze the entire page: presence changes, changing labels/counts, wrapping, and
surrounding content can still move controls. It is not a general layout-shift guarantee.

## Tests and review

- A permanent regression was RED before the correction. It covers equal/newer session events,
  reversed resync snapshots, stable row order and focus, and one exact handoff invocation.
- **242 client tests across 18 files; 71 plugin/SDK tests passed.**
- Rust format/Clippy/tests, shell lint, contract check, typecheck, product-scoped Biome,
  production client/PWA build, package build, and host flake checks passed.
- Independent review found no blocker and independently passed all **69 Console tests**.
  Its suggestion to require captured realtime handlers rather than optionally skipping calls
  was applied, followed by another full 242/71 test run and typecheck/Biome checks.
- The reviewer inspected native-browser evidence but did not independently rerun Chromium.
  The permanent jsdom regression verifies order/focus/callback identity, not native hit testing.
- `just verify` still stops at the unchanged prototype lint failures: **25 errors, 16 warnings**.
  Aggregate tests explicitly supplied Node 22.22.1; the default runner issue remains open.
  The flake check covered this host, not the three incompatible systems.

## Exact deployment and live verification

- Revision: `560b53099ccc66a00b9918d7396fc4326d72e742`.
- Immutable source: local Git URL with that revision and `ref=refs/heads/main`.
- Nix profile: `pyxis`, priority 7; verified previous `pyxis-1` entry removed.
- Package: `/nix/store/nincvcxiafmgli0y5ihspapvgks6n97d-pyxis-2.0.0`.
- Served bundle: `assets/index-EelMZonK.js`.

No live playing session was observed through the public API before the core restart. No push
or NixOS switch occurred. No automated command targeted either user browser.

The guarded live test used only the two established diagnostic sessions. Both profiles now
live under `~/.local/state/pyxis-diagnostics/`: `m3-handoff-a-20260906` and
`m3-handoff-b-20260906`. B was copied while closed; the old `/tmp` copy is retired and must
not be reused as another host with the same identity.

The test used session-ID row selectors, section-scoped hosted controls, RPC target guards,
and nonexistent-target negative probes. Native button presses lasted **120 ms**. Both
playing handoff directions passed: queue/current-track clearing on the source, automatic
recipient rendering, and no source restart. Source pause events occurred at 428 ms A→B and
339 ms B→A, measured from before the press and therefore including its 120 ms hold.
A deliberately nonempty diagnostic target correctly returned `targetBusy` before being
cleared through its own hosted Session control. No user queue was cleared.

Warm startup was 2.042 s for B and 2.240 s for A in the successful run. These are not fresh
full-library timings or renewed latency tuning. The tests were muted and do not establish
physical audibility, autoplay permission, background behavior, or user acceptance.

Verification exceptions were retained:

- The first live attempt scoped the seed button through the first heading of a section that
  actually contains both Source search and Library albums. It failed closed with `button 1
  unavailable`, before seeding; cleanup left A with three entries and B empty. Scoping the
  library list through its own heading corrected the helper, and the repeat passed.
- The cleanup read initially used the nonexistent `library.album.list` tag. The correct
  `library.albums.list` read then verified all 370 albums.
- These temporary guards are not a completed shared harness covering every mutation channel;
  that safety follow-up remains open.

## Cleanup and next check

After stopping both diagnostic browsers, public reads verified:

| Diagnostic session | Revision | Queue | Transport/reachability |
| --- | --- | --- | --- |
| Original A, `01M12Q96B93ZH4K8FCJ468XAVD` | 116 | 3 | stopped/unreachable |
| B, `01M1VZ1EJDRKSSXPS839H5GH38` | 124 | 0 | stopped/unreachable |
| Durable A, `01M1WN15VV4CT6QNF32YEJHWKY` | 30 | 3 | stopped/unreachable |

The user's sessions remained at revisions 71/18 with queues four/empty. Library count was
370; local and tailnet health returned 200; the LAN media listener rejected `/rpc` with 404.
All three user units were active, and the recent core error-priority journal had no entries.

Sanitized fixture, native red/green evidence, failed/passing live logs, review, tests, and cleanup
reads are retained under `~/.local/state/pyxis-diagnostics/handoff-gesture-evidence/`. This
report preserves the essential observations in Git; credential-bearing profiles are not committed.

The user was asked to reload both browsers and retry, then selected **“Still nothing happens.”**
The isolated correction therefore has not resolved their case. A subsequent public read showed
the source at revision 79 with nine tracks, while the empty destination remained revision 18.
No automated command targeted either user session. Next identify the actual clicked row and
Runtime status rather than repeat the same test or presume a cause. The current button sends
the clicking window's queue to the listed device, not the reverse; errors are rendered in Runtime
above the large library. Neither misleading direction nor missed input is established for the
user at that point.

The user subsequently clarified: “Nevermind, I was handing off from the wrong device aparently.
Let's move to the next thing.” The reported browser-handoff issue is now closed on that basis;
no further identical retest is requested. Sonos investigation resumes as the next outstanding
report. Physical autoplay/background/reconnect checks and the parked handoff-affordance work
remain distinct. Browser latency tuning remains paused.
