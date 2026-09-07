# Sonos position-read deadline: deployed, reliability still open

## Outcome

`c1d0e6e0d2b8613805b0f66b153b2981be1d756a` is deployed. Only `GetPositionInfo` gets a separate,
bounded request deadline, allowing the observed successful five-second replies to complete.
The prior three-second deadline prematurely rejected these replies. This does not explain
why the speaker is slow, make it faster, or guarantee availability.

A three-minute production read-only watch found both saved rooms reachable in **88/90 samples**.
They stayed reachable for nearly two minutes, then Living Room dropped out at about 118 seconds,
both were unavailable at 120 seconds, and both recovered at 122 seconds. Their queues,
revisions, and stopped transport remained unchanged during the watch. **The remaining dropouts
are not explained by these observations. Sonos reliability and physical playback are not accepted.**
The preceding 60-second watch on `f95ed25` found both reachable in 22/30 samples; different windows
are not a controlled reliability benchmark.

The user explicitly said to continue without playing anything on Sonos. All live diagnostics in
this follow-up are reads. No playback, queue, grouping, or volume command was issued; no production
plugin configuration was read/decrypted or changed. The historical failed unintended Clear queue
request remains documented in the preceding handoff report; this pass does not erase that incident.

## Reproduction and bounded change

With the approved Avahi restart complete and `f95ed25` deployed, Kitchen still intermittently
failed `GetPositionInfo` before headers at the normal 3000ms deadline. `GetTransportInfo` completed.
Two identity-checked diagnostic controller runs, with an isolated 10000ms request budget, completed
all 4 plus 8 state reads. Three complete HTTP 200 position replies took **5033, 5033, and 5019ms**.
The other replies were fast. Neither run changed production configuration.

These probes admit only fixed private description endpoints and exact topology, transport-info,
and position-info SOAP reads, after checking device UDN. Negative validators make no network
request. Logs record action, timing, status and byte count, not response bodies or signed URIs.
The earlier default/no-reuse/Connection:close matrix failed equally; no HTTP workaround was added.

The plugin now declares optional `positionTimeoutMs`, an integer from 100 through 30000. Its
default is `max(requestTimeoutMs, 8000)`, retaining existing larger request budgets. Explicit
values are honored. Only `GetPositionInfo` consumes it. Descriptions, topology, other SOAP reads,
and writes keep their prior request deadline; discovery keeps its separate deadline. Direct
controller callers omitting the optional setting retain their old request budget.

The implementation still awaits the complete position response body and fails closed on timeout.
It does not substitute cached or partial state on failure, retry a write, change XML parsing,
change RPC/schema versions, or weaken stream/account ownership. Existing parsed XML fields remain
optional: complete body consumption is not newly added mandatory-field validation.

A transport-only fallback was considered but not implemented. Independent review confirmed that
missing URI currently fails core stream ownership and causes reconciliation to Stopped; simply
returning transport after a position failure would therefore be unsafe under the existing contract.
The earlier failed optional review-tool attempts did not establish any design conclusion.

**Cost:** a stalled position read can now hold serialized output work up to five seconds longer
at defaults. The core's overall plugin-call deadline remains 30 seconds, so a large individual
request budget does not extend the entire discovery-plus-state call. Genuine timeouts remain
retryable unavailable outcomes; generic session reads still do not wait for physical output I/O.

## Verification

Twelve new test cases cover default, explicit and larger-existing budgets; a real 3100ms delayed
complete response; header/body timeouts; unchanged transport and Pause budgets; and malformed
configuration rejected before I/O. The corrected RED run had 8 passes and 9 failures. An initial
fixture incorrectly treated an absent action as the absent stall selector; that harness error
was corrected before the retained RED run. Test-only timer/Response typings were corrected before
final typecheck and gates.

- Focused plugin suite: 17 passed; independent four-file suite: **32 passed, 56 assertions**.
- Full product suite: **248 client tests and 86 plugin/SDK tests** passed.
- Rust tests, formatting/clippy, shellcheck, generated-contract check, typecheck, owned-source
  Biome, client/PWA build, package build, and host flake check passed.
- `just verify` still stops at unrelated prototype lint: **25 errors, 16 warnings**. Aggregate
  tests require explicit Node 22.22.1. Flake checks omit incompatible systems.
- Independent review found no blocking defect. It verified deadline isolation, configuration
  compatibility, failure behavior and unchanged core ownership, and documented the longer wait.
- A guarded read through the new plugin configuration path completed all four trials, including
  a full position response at **5027ms**. This used explicit diagnostic seeds, not live config.

The first full-gate run's temporary process logs were absent when archiving after compaction;
why they disappeared is not established. The same gates were rerun directly into a durable log.
Earlier probe, RED/GREEN, review and exact-build evidence was retained. No missing artifact is
silently treated as a new verification result.

## Exact deployment and cleanup

Built and flake-checked the immutable source:

```text
git+file:///home/simonwjackson/code/github/simonwjackson/pyxis?ref=refs/heads/main&rev=c1d0e6e0d2b8613805b0f66b153b2981be1d756a
/nix/store/nbhaarswfzi6cg6bzr704ymk8jxx3cr7-pyxis-2.0.0
```

Added `pyxis-1`, priority 10, verified both candidate and old `pyxis`/priority 9 identities,
then removed only the verified `f95ed25` entry. Public checks before installation and immediately
before restart found no live playing host and both saved outputs stopped/reachable. Three old
unreachable browser records retained cached Playing state and were not changed. No push or
NixOS switch occurred. Pyxis restarted at **2026-09-07 08:29:29 MDT**.

Runtime verification checked the installed profile and the running Sonos child source, not just
the unchanged frontend bundle (`assets/index-DVvhGIPJ.js`). The child uses
`/nix/store/ng11bmbax5hdx5vd7imx79dy3s3bbk0m-pyxis-plugin-sonos-1.0.0/lib/pyxis/plugins/sonos/src/index.ts`;
both the position-specific deadline and previous SIGKILL discovery safeguard are present.

| Saved room | Before and after this deployment |
|---|---|
| Kitchen | Stopped, 9 tracks, revision 23 |
| Living Room | Stopped, 0 tracks, revision 33 |

Kitchen's earlier historical snapshot was 42 tracks/revision 21. It was already 9/revision 23
at the start of the September 7 post-`f95ed25` watch, before this position-deadline deployment.
Read-only observations do not establish who changed it. No attempt was made to restore an old
queue or attribute that change to this correction.

The library still has **370 albums**. All three diagnostic browser sessions are stopped and
unreachable with their prior queues. Pyxis, tsnet and the yt-dlp update timer are active; local
and tailnet health are 200; LAN `/rpc` is 404. The post-restart error-priority Pyxis journal query
had no entries; that does not mean no output read failed. Avahi remains on the authorized
restart's PID 2493290; a later one-second CPU sample was 15%, distinct from the immediate post-
restart 0/0/1% samples. No second shared-service restart was performed.

## Remaining work

Identify the stage and typed failure behind the brief two-room availability loss. Do not infer
that the three-second Kitchen deadline explains every dropout, invent cached authority, or
keep widening deadlines without evidence. Check the user's current controls without asking
for playback. Physical Sonos playback and M3 autoplay/background/reconnect checks remain
separate and unauthorized in this investigation. Accepted browser latency and the user-closed
handoff report stay closed.

Evidence: `~/.local/state/pyxis-diagnostics/sonos-position-evidence/` contains guarded probes,
RED/GREEN logs, independent review, exact-build logs, profile snapshots, pre-restart reads,
live plugin verification, the complete three-minute availability trace, cleanup and the
full-gate rerun. The approved Avahi restart journal and post-restart comparisons were also
archived under `sonos-deadline-evidence/`. Credentials were not copied into either archive.
