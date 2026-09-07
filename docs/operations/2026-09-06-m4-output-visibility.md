# Sonos output visibility and authority fencing

## Status

The user clarified the Sonos symptom: **“Currently, the devices are flashing on and off on the
web browser.”** Public reads confirmed availability changes without queue/revision changes.
A one-minute trace began with Kitchen unavailable and Living Room available; Living Room
became unavailable about 15 seconds later. Kitchen retained 42 tracks/revision 21 and Living
Room retained zero tracks/revision 33.

`63340186846f5612faf46d33332509a8353b0367` is deployed. It corrects disappearing session
entries and unsafe stale UI publication. **It does not fix the underlying discovery/state
request failures or establish Sonos playback acceptance.** The preceding discovery evidence
remains in [the discovery follow-up](2026-09-06-m4-sonos-discovery-follow-up.md).

## Correction

Previously, `remoteSessions` included only reachable rows. Both Other devices and Output
sessions consumed that list, so one failed probe removed the saved room and could show
“No output session exists” despite its durable queue remaining intact.

- Known output sessions now stay visible with explicit available/unavailable status.
- Unavailable session transport, queue, clear, and handoff controls are disabled. The existing
  topology/group controls are unchanged; this is not a claim that every output control shares
  that gate. Unsupported output handoff remains a separate parked affordance issue.
- Cached output reachability is clamped to false in the view until fresh authority arrives.
  The cached database value is not rewritten merely to render the unavailable state.
- Browser hosts still require current reachability before appearing. Realtime failure removes
  them and conservatively disables retained output rows.
- Output-session rows, like Other devices, use immutable ID ordering and explicit identity
  attributes. Data arrival order does not move existing rows.

Independent review found a blocker in the initial version: an in-flight resync could finish
its local snapshot read after `onFailure` and re-enable controls from stale authority. The
final correction captures a publication generation before queued sync, fallback HTTP reads,
and output creation. Failure or connection retirement advances that generation. The shared
session-publication boundary checks it after its reads, before updating session UI.

Durable operations still settle; stale session UI publication is discarded. A later fresh
observation can restore controls, and an intervening fresh event is not overwritten by an
older completion. No worker schema, persistence semantics, account fences, or public RPC
contract changed.

## Verification

- Six regressions were RED before their respective corrections: live row retention, offline
  cached visibility, and four combinations of resync/library event with held sync/local
  snapshot delivery. They include fresh authority arriving before the stale completion and
  recovery through another fresh pull.
- **248 client tests across 18 files and 71 plugin/SDK tests pass.**
- Independent follow-up review passed all **75 Console tests**, the original held-snapshot
  reproduction, typecheck, and scoped Biome. It found the blocker resolved and no new blocker.
- Rust format/Clippy/tests, shell lint, contracts, typecheck, product-scoped lint, client/PWA
  build, package build, and host flake checks passed. Fallback/output-creation generation
  capture was inspected rather than independently race-tested.
- Default `just verify` still stops at **25 prototype errors and 16 warnings**. Aggregate tests
  supplied Node 22.22.1 explicitly. Incompatible flake systems were not checked.

An isolated Chromium fixture used the actual reference components, a memory worker and a
fake backend. Across four availability flips, the same output DOM rows remained connected.
Native clicks on unavailable controls did not dispatch; a fresh available event restored the
fake control. Connection failure retained the rows with controls disabled. The fixture's HTTP
guard allowed only local GETs; it issued no real speaker commands.

## Exact deployment and production check

- Revision: `63340186846f5612faf46d33332509a8353b0367`.
- Nix profile: `pyxis-1`, priority 8; the verified prior `pyxis` entry was removed.
- Package: `/nix/store/rwsd0i7c24wcl8i9fmkp30lxszaixb5j-pyxis-2.0.0`.
- Served bundle: `assets/index-DVvhGIPJ.js`.

Public checks found no live playing session before the core restart. No push or NixOS switch
occurred. No automated command targeted a user browser or speaker.

The final production check was **read-only** through the established durable diagnostic A.
A page-RPC guard blocked writes, with a nonexistent-target negative probe. The probe verified
all four row instances—Kitchen and Living Room in each of the two views—retained the same
DOM nodes. Initially Kitchen was unavailable while Living Room was available. A real proxy
cut isolated only this diagnostic browser: all retained output controls became unavailable.
After reconnect and fresh synchronization, the rows remained present and reflected the core's
then-unavailable state. The whole check passed in 12 seconds. It did not test audio or issue
playback/queue/group/volume commands.

Later cleanup reads again found both rooms reachable, with the same stopped transport,
revisions 21/33 and queues 42/empty. This continued variation is why connection reliability
remains open, rather than being declared repaired by the UI correction.

## Cleanup, evidence and limits

Both fixture processes and the production diagnostic browser/proxy were stopped. Public
reads verified all diagnostic sessions stopped/unreachable: original A revision 116/queue 3,
B revision 124/empty, and durable A revision 30/queue 3. The library retained 370 albums; local
and tailnet health returned 200; LAN `/rpc` returned 404; all three user units were active.
The recent core error-priority journal had no entries.

Evidence is retained under `~/.local/state/pyxis-diagnostics/sonos-visibility-evidence/`.
The first background trace lacked Python on PATH and was rerun with its explicit Nix path.
The first native driver tried to serialize DOM nodes over CDP; returning scalar observations
instead corrected that harness error. Neither was a product failure. Temporary guards still
do not constitute the parked shared harness covering every mutation channel.

The user subsequently confirmed the room entries no longer blink, but the controls remain
disabled. Visibility is accepted; discovery and state-request failures still need correction.
See [the deadline/host-discovery follow-up](2026-09-06-m4-discovery-deadline.md). Do not claim
Sonos playback fixed, resume browser latency tuning, or issue an unsolicited physical test.
