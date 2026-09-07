# M3 handoff correction and renewed Sonos investigation

## User acceptance and remaining reports

Following the requested phone/desktop check, the user reported:

> Play/pause/stop work in both directions. Handoff does not appear to work.
> Sonos does not appear to work.

Record bidirectional transport as passed and retain provisional responsiveness acceptance.
Handoff is not yet user-accepted. M4's earlier audible Sonos acceptance remains historical
fact, but the current Sonos failure report requires diagnosis and revalidation. Do not infer
the user's failed handoff endpoints or Sonos control from this wording.

## Reproduced browser handoff defect

A production test clicked the actual handoff button between the known diagnostic browsers,
with a playing source and empty, previously audio-activated recipient. The API returned ready
and the queue eventually moved correctly, but the source emitted another Playing event at
234 ms and paused at 445 ms. The callback cleared `audioUrl` before the local Playing snapshot
changed, causing the automatic loader to reload the old track.

`a54ec1a` removes that competing reset. The confirmed Stop directive retains renderer ownership.
A narrow effect also tears down audio when source truth is Stopped with no current track.
Independent review caught why removing only the callback reset was insufficient: with the
cleared-state event but no Stop directive, the old audio remained mounted. Both event-before-
reply and event-after-reply regressions were run red, then fixed. Accepted/refused handoff
coverage preserves the source while the reply is pending or refused.

Final independent review found that blocker resolved. This does not fix loss of both the
state event and directive, nor establish the user's exact failing route.

## Deployment and verification

- Runtime: `a54ec1a7591b096bf01195d6242d5b2e403865aa`.
- Exact Git-pinned Nix profile entry: `pyxis-1`, priority 6.
- Package: `/nix/store/mc44awmc9mb347srb04xaz42fhi1b835-pyxis-2.0.0`.
- Bundle: `assets/index-d8ex_ecT.js`; worker schema remains 8.
- 241 client tests, including 68 Console tests, and 71 plugin/SDK tests pass with explicit
  Node 22. Typecheck, owned-source Biome, Rust/Clippy/formatting, shellcheck, generated contract,
  PWA/client build, exact-revision Nix build, and host flake check pass.
- A fresh `just verify` attempt still stops at prototype lint: 25 errors and 16 warnings.
  The inherited-Node-PATH exception also remains; this slice does not fix the default gate.

The exact revision was built and its profile/store path verified before the old entry was
removed. A read-only check found no live non-diagnostic playback before restarting the core.
No push, NixOS switch, or plugin-configuration change was made.

Final guarded production verification passed local and bidirectional remote transport,
stopped handoffs and recipient playback, real proxy cut/refusal/recovery, and durable reload.
It then clicked **playing handoff in both directions**: the source cleared, the recipient
started automatically, and source media traces contained only Pause at 245 ms / 261 ms,
with no extra Playing event. These muted tests do not establish physical audible continuity.
A nonempty destination still returns `targetBusy` without replacing its queue.

## Verification exceptions and an unintended request

Two harness problems were retained rather than reported as product success:

1. The old `/tmp/pyxis-m3-final-chrome` profile reopened without its expected identity.
   Chromium's LevelDB log said it was creating the DB because it was missing; its manifest
   had been recreated. System temporary-file cleanup had run earlier. This timing is evidence
   of a diagnostic-profile incident, not proof of the exact deletion mechanism. The identity
   guard refused to command the replacement ephemeral identity. The old core session and its
   three queue entries were left untouched. A deliberately new diagnostic was created under
   `~/.local/state/pyxis-diagnostics/m3-handoff-a-20260906`, outside temporary cleanup.
   It used real durable IndexedDB and took **83.621 seconds** to first-ready with 370 albums.
   First/full-library startup therefore remains slow, not fixed by the latency work.
2. An older smoke helper selected the first global **Clear queue** button. When Kitchen
   reappeared, that was an output control rather than the diagnostic browser's Session control.
   One unintended `session.command.send` queue-clear request returned `unavailable`. The user
   was informed immediately after discovery; the run stopped. Read-only checks showed Kitchen
   still stopped with all **42 tracks**, and Living Room still empty. The clear did not commit.
   No compensating queue or speaker command was issued. Kitchen's revision was 21 versus the
   earlier 20; the unchanged count alone is not a claim that no other state reconciliation ran.

The subsequent helpers scope Clear queue to the Session section, validate explicit RPC
arguments, and use page-level CDP Fetch request-stage guards to reject non-diagnostic session
commands and unsupported operations. A nonexistent-target negative probe verified rejection
before the positive smoke on each browser. These temporary helpers still need consolidation
into a durable shared harness; do not reuse the older unguarded helpers.

## Sonos observations — no root cause claimed yet

Read-only device-description, topology, transport and position queries found:

- Kitchen: `192.168.1.241`, `RINCON_38420B950B3E01400`, standalone, physically STOPPED/OK.
- Living Room: `192.168.1.216`, `RINCON_38420B950C8A01400`, standalone, physically
  PAUSED_PLAYBACK/OK on an existing core LAN URI. Public Pyxis state was Stopped with an empty
  queue; that observation does not prove ownership of the old URI or successful new playback.
- The media listener is bound to `192.168.1.243:9000`.
- Seeded discovery through the current Sonos controller found all four rooms. Its Kitchen
  GetPositionInfo query timed out at 3000 ms. Separate fetch probes also timed out on Kitchen
  under Bun 1.3.11 and packaged Bun 1.3.13 while Node 22 returned quickly. Later Bun requests
  succeeded; alternate-header results were mixed. No timeout/header workaround was shipped.
- An unseeded Avahi browse produced no resolved entries in its bounded window. Sonos is
  configured in the core, but that probe does not establish the current stored seed settings.
- Public output reachability varied; both output sessions were unreachable at final cleanup.
  General core health is not evidence that Sonos playback is healthy.

Apart from the unintended failed queue-clear request above, speaker interaction was read-only.
No intended playback, volume, grouping, URI-setting, or configuration test was run.

Two verified reference limitations can obscure the reported symptoms:

- The reference offers handoff to outputs although `session.handoff` explicitly returns
  `outputUnsupported`. Browser handoff also refuses destinations with existing queues;
  **Stop does not empty a queue**. Do not auto-clear one to make the test pass.
- Console failures discard the typed failure detail and show only `unavailable`.
  Sonos queueing is under Outputs; Sonos Play is under Other devices. Host transport controls
  the browser. These facts are not evidence that the user chose the wrong control.

## Cleanup and next step

All diagnostic browsers and the proxy are stopped. Read-only checks confirm:

| Diagnostic | Session | Revision | Final state |
|---|---|---:|---|
| Original A, profile incident | `01M12Q96B93ZH4K8FCJ468XAVD` | 116 | stopped, unreachable, original 3 entries |
| B | `01M1VZ1EJDRKSSXPS839H5GH38` | 115 | stopped, unreachable, empty/no current track |
| New durable A | `01M1WN15VV4CT6QNF32YEJHWKY` | 24 | stopped, unreachable, 3 diagnostic entries |

New A's device is `01M1WMYMRV3GDFDERAPQX3A6VT`. The library still contains 370 albums.
All three user units are active, local/tailnet health return 200, and LAN `/rpc` returns 404.

The user subsequently clarified that **browser-to-browser handoff still appears to have no
effect** and asked to focus there. Sonos investigation is paused. A read-only snapshot showed
`01M1W59YH76407X22XSRB4A3W6` paused with four tracks (revision 68), and
`01M1WBF931NWE131HBVZZN6QAR` stopped/empty (revision 18), both reachable. This does not reveal
which window initiated the failed action. The callback sends the clicking window's own queue,
and the API preserves paused/stopped transport intent. Next obtain the direction, queue
movement and error from a controlled user retry; do not assume wrong direction or autoplay.
The browser restart defect is fixed, but the user's remaining symptom is not resolved.
Physical autoplay/background/reconnect acceptance remains open.

Follow-ups: `01M1WMM0NJ8H3SKG58PTVMCA6N` (reference handoff/error affordances) and
`01M1WNM11MH33SPVVGE5P1KJN6` (fail-closed durable diagnostic harness).

Local evidence: `/tmp/pyxis-m3-playing-handoff-retry.log`,
`/tmp/pyxis-m3-handoff-final-review.md`, `/tmp/pyxis-m3-handoff-final-tests.log`,
`/tmp/pyxis-m3-handoff-final-gates.log`, `/tmp/pyxis-m3-handoff-guarded-smoke.log`,
`/tmp/pyxis-m3-playing-handoff-guarded.log`, `/tmp/pyxis-m3-handoff-final-cleanup.log`,
`/tmp/pyxis-m3-output-selector-audit.log`, `/tmp/pyxis-m3-sonos-read-only.log`,
`/tmp/pyxis-sonos-read-state.log`, and `/tmp/pyxis-sonos-fetch-*.log`.
