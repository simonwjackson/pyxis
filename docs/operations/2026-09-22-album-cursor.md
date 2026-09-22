# Album replacement retained the previous track number

The server now saves complete session snapshots instead of merging omitted playback fields.
This fixes the captured case where choosing a new album starts on the previous album's track
number. No browser playback logic, wire contract, database schema, or saved queue is migrated.

## Actual phone failure

The user clarified that the problem was a later track, not a nonzero position within a track.
An earlier investigation reproduced separate playhead bugs and did not explain this report.
Those diagnostic tests were saved outside the repository and are not part of this correction.

The connected phone ran `index-C607_03P.js`. Temporary page instrumentation recorded worker
commands and replies, audio events, and the user's album and Next button presses. It passed
messages through unchanged, saved no credentials, and issued no playback commands.

| Time, UTC | Observation |
| --- | --- |
| 22:06:06.432 | The user selected Ruiner while the previous album was on track 7, cursor 6. |
| 22:06:06.543 | Local `queue.clear` returned an empty queue with no cursor. |
| 22:06:06.656 | Local `queue.add` returned Ruiner with cursor 0 and its first track. |
| 22:06:06.771 | Local Play still returned cursor 0. |
| 22:06:08.436 | The server's queue-add event returned the new queue with cursor 6. |
| 22:06:09.173 | The server's Play event also returned cursor 6. |
| 22:06:09.733 | The renderer loaded Ruiner's seventh track. No intervening Next command occurred. |

The earlier switch in the same trace inherited cursor 1 in the same way. This confirms the
user's suspected track-number carryover and locates it after local queue replacement, in the
server's persistent command path.

## Cause and correction

`SessionRecord` omits absent `cursor` and `durationMs` fields during serialization.
`Store::put` and mixed-batch writes passed those records to ProseQL's merge-style update.
Clear returned a correct in-memory session, but its persisted record retained the previous
cursor. The next Add read that old cursor and applied it to the new queue.

Session saves now explicitly select snapshot writes. Inside the existing native transaction,
the store checks account ownership, replaces the session record, and restores its supplied
`updatedAt`. Native create overwrites timestamps, so restoring that timestamp is necessary for
command replies and fresh reads to agree. Receipts and both handoff records remain in the same
durable transaction. Validation failure rolls back the complete operation.

Only sessions use this path. Other collections keep their existing merge behavior. Sessions
have no declared `createdAt` or relationships. Do not extend this replacement mode to other
collections without checking their timestamp, relationship, and hook behavior.

The cost is additional in-memory mutation work and changed session insertion order, but still
one durable commit. `session.list` order is unspecified; clients must retain selection by ID.
No old command, session, or queue is deleted as cleanup. The next explicit album selection
clears stale fields through the corrected write path. Existing playback is not reset on deploy.

## Verification

The service regression failed before the fix with `Some(6)` instead of `Some(0)`. The RPC
regression failed with cursor 2 instead of 0. Both pass after the correction.

```sh
cargo test --test sessions --test session_rpc --test session_snapshots
```

All 18 tests in those three files pass. Coverage includes replacement with and without command
receipts, duplicate receipt replay, agreement between replies and fresh reads, persisted cursor
and duration removal, timestamp preservation, reopen, handoff, invalid replacement rollback,
later-batch receipt rollback, and cross-account collision rollback. Independent review found no
blocker and independently passed 30 session, output, RPC, and store checks.

| Gate | Result |
| --- | --- |
| Full Rust suite, all targets | 206 passed, 1 failed. The failure is reproduced on unchanged main. |
| Existing `listen_rpc` failure | Fixed August 21 fixtures are outside the test's 30-day window on September 22. The hot-album assertion receives no album. This unit does not change that test. |
| Clippy, contract check, shell lint | Passed. |
| Player tests and typecheck | 270 passed; typecheck passed. |
| Reference-client/worker tests | 276 passed. |
| Plugin/SDK tests | Passed with the existing private fixture skips. |
| Player and reference-client builds | Passed. |
| `just verify` | Stops at the inherited Rust formatting difference in `sessions/machine.rs:84`; unchanged main fails identically. |
| Whole-repository typecheck and Biome | Retain the documented JPEG fixture import and unrelated lint failures. |

`just format` was run. Changes outside this unit were restored. The full repository gate is not
reported as passing. Evidence is in `~/.local/state/pyxis/album-cursor-20260922/` on the development
host, including the actual phone trace and the negative-control logs.

## Remaining work and deployment

Deployed and verified: `7b0aaf7b3cea3d156318cfbcacbe924781814224`.

| Item | Verified value |
| --- | --- |
| Package | `/nix/store/zj4ildac5rqbga5l1dv94h25yr6kxsiy-pyxis-2.0.0` |
| Running core | `/nix/store/4sx8g5147kb8pywcj359c1473sx0w3bg-pyxis-core-2.0.0/bin/pyxis` |
| Player bundle | `index-C607_03P.js`, unchanged. |

A real-process smoke used the package's actual core binary, an isolated temporary store, and
zero plugins. The old package returned cursor 6 and `b-7`. The new package returned cursor 0,
`b-1`, zero position, and no inherited duration. No live account or speaker was used.

The running service executable matches that tested core binary. Both Pyxis user services are
active. Local and tailnet health checks return 200; shell, bundle, and service-worker bytes match
the installed artifact at both origins. No reachable playing session was reported before the
restart. Profile priority 5 was preserved.

Physical-phone retest is pending. This is a server correction; a client update is not required.
Choose the album again to replace the queue through the corrected path. Do not clear site data.
The screen-off stream-loading stall remains separate. Diagnostic playhead-reset and late-stream-load defects also remain separate; the user
explicitly clarified that these did not describe the track-number report.

No Sonos playback, queue, grouping, or volume command was issued. Temporary phone worker-message
and audio-event tracing was removed after the capture. Battery and notification settings were
not changed in this investigation.
