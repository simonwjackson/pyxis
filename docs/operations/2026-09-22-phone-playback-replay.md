# Phone playback replays old album choices

The user reported that previously requested albums kept competing for the queue.
This change reproduces that failure in the player and corrects its worker integration.
It does not claim a capture of the user's phone or physical playback acceptance.

## Cause and correction

| Path | Before | After |
| --- | --- | --- |
| Session refresh | Re-ranks every local session and can select an old album's session. | Keeps the selected session ID. Never renders a different device's session locally. |
| Realtime updates | Sends raw server snapshots straight to the renderer. Replaying the command outbox therefore replays historical albums through the speakers. | Calls `WorkerClient.applySessionEvent`. The existing worker guards pending intent and revisions. Retains a blocked event until sync completes. |
| Album replacement | Concurrent `clear`, `add`, and `play` sequences interleave. Bootstrap can also choose a sibling session. | Serializes each sequence and reuses the selected session. |
| Command delivery | Local commands remain queued until another startup or resync. | Starts session sync after the local command queue settles. |
| Old audio element | An end event from the old stream can advance the newly selected album before it loads. | Pauses mismatched audio and accepts playback reports only for the loaded track. |
| Offline sync failure | The first correction discarded the retained renderer state and paused loaded audio. | Uses `shownValue` while retaining the explicit sync failure. Two tests reproduced this regression before correction. |

The worker schema, RPC contract, server session machine, and persisted outbox are unchanged.
No saved commands or sessions are deleted. The cost is an additional session sync after local
commands, including position reports. Sync failure keeps writes retryable. This change does not
prove phone background playback, browser autoplay permission, or ownership across multiple tabs.

## Verification

The five initial regression cases failed before the fix. They cover sticky selection, late
updates, historical outbox replay, missing command delivery, and concurrent album replacement.
Further tests cover an event burst, an unpaired device, selected-session reuse, and offline
playback and duration reporting. Another regression proves that the previous audio element cannot
end the newly selected album while its stream loads. All 267 player tests pass. Twelve architecture tests and the
full-product architecture check pass. The player TypeScript check and changed-file Biome check
pass. An independent reviewer found no remaining blocker after the offline correction.

The shared fixture in `clients/player/test/playback-source.tsx` uses the real worker database,
account fences, sync engine, and local command application. Its in-memory remote service keeps
command receipts. Database operations and sync passes use the same serialization boundaries as
the browser worker. Replies arrive on separate tasks so React cannot hide the intermediate states
by batching all updates.

Run the browser regression with a Vite server on port 5181:

```sh
node clients/player/node_modules/vite/bin/vite.js --config clients/player/vite.config.ts --port 5181
node tools/verify-player-playback.mjs
```

The script accepts another origin as its first argument. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`
can override the existing local browser tools. It blocks API, media, and external requests before
delivery. The fixture decodes PCM silence through the production audio renderer. It uses no
provider, live account, or speaker.

Against `c26554b`, the browser loaded `historical-a` and failed the latest-album assertion.
Against the correction, the result was:

```json
{"result":"PASS","recovered":["latest-saved"],"queue":["latest-choice"],"pending":0,"remoteQueue":["latest-choice"],"loads":["latest-saved","latest-choice"],"decodedAudioAdvances":true}
```

This proves actual browser decoding and state convergence, not sound from the user's phone.
The browser permits autoplay explicitly; mobile autoplay restrictions remain outside this test.

## Repository gate exceptions

`just verify` was run and stopped at the existing Rust formatting difference in
`services/pyxis/src/sessions/machine.rs:84`. A separate pristine `c26554b` worktree fails the same
check. Whole-repo typecheck fails on the unchanged JPEG import in
`clients/player/src/shapes/album-fixtures.ts`. The pristine worktree reports the same error.

Owned-source Biome diagnostics match the pristine worktree exactly: 48 diagnostics. The agent's
untracked skill checkout adds three unrelated errors. No changed file has a Biome error.
`just test-ts` passes 115 plugin/SDK tests and 276 reference-client/worker tests, with two private
Pandora fixture skips. `just build-client` passes. These scoped checks do not turn the failed
whole-repository gate into a pass.

Gate logs are in `~/.local/state/pyxis/phone-playback-20260922/` on the development host.
The final full player suite timed out while three unrelated Nix builds consumed most memory.
Running the same suite with `--maxWorkers=1` passed all 267 tests in 35.34 seconds. No unrelated
process was stopped.

## Deployment and acceptance

**Deployed and verified:** `16b16f5c1a07057282932d7ba917658b7641cd01`.

| Item | Verified value |
| --- | --- |
| Installed package | `/nix/store/z08w0d41ppbj3f09w7ksvl9j4fynihnx-pyxis-2.0.0` |
| Running `PYXIS_WEB_ROOT` | `/nix/store/gdd475v8flcdrb84rx3929mbp71l2i9q-pyxis-player-2.0.0` |
| Previous bundle | `index-BIZMAJja.js` |
| New bundle | `index-C_dEkOCQ.js` |
| Bundle SHA-256 | `baa73315c0dfb2e4afbef680ef97f9c28041b1bf5992e67c4a14a51e88b5b3d8` |

Local and tailnet health return 200. The served shell, main bundle, and service worker match the
installed artifact byte for byte at both origins. The running process's web root matches the
installed wrapper. Both user services are active.

`tools/deploy-revision` exited 141 before producing its build message. A local Nix-shebang Python
script instead built the exact commit, read the profile as JSON, replaced only the `pyxis` entry,
and restarted the two Pyxis services. It preserved the old priority and included restoration of
the old package if installation failed. No deployment script was changed in this fix.

A read-only `session.list` before deployment returned no reachable sessions. No playback, queue,
grouping, or volume command was sent to a live device. Physical phone acceptance remains open.
The phone needs to use **Reload now** to load the new bundle. Do not clear site data or discard its
outbox. Only the user can confirm that the reported cycling has stopped on that phone.
