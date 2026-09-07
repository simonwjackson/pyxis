# Session-command acknowledgement race

The correction preserves a command queued while an earlier command is acknowledged.
This is the session analogue of the album-placement race corrected in `cac84b0`; see
`2026-09-07-placement-sync-race.md` for that work. Nothing was deployed and nothing was
pushed. No service, speaker, or browser was contacted.

## Reproduction and correction

The September 7 probe reproduced the race on `72a1f90`, the tip at the time of this work.
It used real `sync`, `openWorkerDatabase`, and `createMemoryEngine`, with configured RPC
replies and a scheduling Proxy on `replaceSession`.

| Schedule | Visible queue after sync | Pending outbox | Reported deferred writes |
|---|---|---|---|
| Queue the second track before the acknowledgement reads pending commands. | `[first, second]` | One command | 1 |
| Queue it between that read and the session replacement. | `[first]` | One command | 1 |

Another sync applied the second command and emptied the queue in both cases. The probe
demonstrated temporary loss of visible intent, not permanent outbox loss. `deferred` was
already correct, because `cac84b0` moved that count to a final locked outbox read.

The new regression in `sync.test.ts` failed first with `["first"]` instead of
`["first", "second"]`. After the correction the same schedule keeps the second track
visible, reports one deferred write, and replays it once on the next sync.

`WorkerDatabase.applySessionVerdict` now reads still-queued commands for the session and
replays them onto the server verdict within one account-fenced database operation. It
excludes the settled write without removing any outbox entry. Network requests remain
outside the lock. Dequeue still removes only the settled ID after successful local
application. `putServerSession` is deleted; `sync` no longer calls `replaceSession` for a
verdict, because a bare replace can be interleaved between the read and the write.

Replay behaviour is carried over unchanged: it stops at the first command the current state
rejects, so one invalid later command cannot hide the command that just succeeded. The
server returns the typed rejection when that entry reaches the front of the queue.

The cost is slightly longer lock occupancy per acknowledged command. This does not change
the command contract, receipts, idempotency keys, ordering, renderer confirmation, or the
worker schema, and it adds no migration.

### Probe status after the correction

The original probe is now inert rather than contradicted. It injected its competing write
from a Proxy hook on the public `replaceSession` call. That call no longer exists on the
verdict path, so the hook never fires and the probe's `before` value stays at its empty
initialiser. A method trace confirmed the new public sequence for one session command:

```
applyRemoteAlbums, applyRemoteSessions, outbox, session,
queueSessionCommand, applySessionVerdict, dequeue, outbox
```

The durable regression injects through `engine.outbox.all` instead, which fires inside the
new locked operation and holds the same `browserOfflineExclusive` lock production uses. Do
not treat the old probe's failure as a regression signal.

## Verification

All commands ran in the worktree's flake environment. Client tests used Node 22.22.1 and
Vitest. Plugin and SDK tests used Bun.

| Check | Result |
|---|---|
| New scheduling regression before implementation | Failed with `["first"]` instead of `["first", "second"]`. |
| Full client suite | 267 passed, up from 261. |
| Plugin and SDK tests through `just test-ts` | 84 passed, 2 private-fixture skips, zero failed. |
| Rust tests through `just test-rust` | All unit and integration suites passed. |
| Generated-contract check | In sync. |
| Whole-repository typecheck | Passed. |
| Owned-source Biome check on `clients/app/src/worker/` | Passed, 24 files. |
| Production client build and packaged PWA asset check | Passed, with 13 shell assets. |
| `just verify` | Failed at `lint-ts`, with 29 prototype errors and 17 warnings. |
| Clean detached baseline `72a1f90`, `biome check .` | The same 29 errors and 17 warnings. |

The full repository gate is not green. The failures are inherited and live entirely in
`prototypes/`, which this correction does not touch. The clean-baseline run at `72a1f90`
produced an identical count, so this change introduces no new lint finding. No Fallow
configuration exists in this checkout. No browser or physical-device acceptance, Nix package
build, deployment, or Sonos command was performed.

## Added coverage

- `sync.test.ts` — a command queued during acknowledgement stays visible and replays once.
  This is the race regression and the only test that failed before the fix.
- `database.test.ts` — replay in outbox order across sessions; the settled-only case;
  stopping at a rejected command; and account-switch rejection through the production
  `accountFencedDatabase` path.
- `proseql-engine.test.ts` — the same preservation through a real ProseQL engine reopen.

## Remaining work and safety

This corrects the local visibility race only. It makes no claim about physical playback,
renderer timing, or Sonos behaviour. M3 physical checks remain open.

Radio and any automatic queue refill depend on this fix, because both add commands while
earlier commands are still in flight. They remain unbuilt.

The ProseQL query-cache limitation is unchanged and still owned by follow-up
`01M1VZZYSRGB8C8G4Y0WMS2MXS`. The new real-WASM regression uses production refresh
boundaries. Do not remove refresh-under-lock without an equivalent consistency proof.

After a future authorized deployment, verify that adding two tracks in quick succession
leaves both visible and drains the outbox. A track vanishing from the queue, a stuck outbox
entry, or a cross-account write is a failure signal. Stop rollout and inspect worker state
if one occurs. This local pass makes no deployment or physical acceptance claim.

## Evidence

Durable logs are under `~/.local/state/pyxis-diagnostics/session-ack-race/`:

- `verify.log` records the final full gate and its inherited lint failure.
- `baseline-lint.log` records the clean-baseline comparison at `72a1f90`.
- `typecheck.log`, `test-ts.log`, `test-rust.log`, and `build-client.log` record the
  scoped gates.
- `owned-lint.log` records the scoped lint result.
- `probe.ts` is the durable copy of the reproduction probe, moved out of `/tmp`.

Durable source regressions live in `sync.test.ts`, `database.test.ts`, and
`proseql-engine.test.ts` under `clients/app/src/worker/`.
