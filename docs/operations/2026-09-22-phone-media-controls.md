# Media controls disappear while audio continues

The player now keeps its media controls on the same retained session as its audio renderer.
This corrects a reproduced sync-failure bug. It does not fix the separate phone stream stall or
prove why every Android media control disappeared.

## Cause and correction

`usePlayback` retains local playback when session sync reports offline, authentication failure,
or another failure. The audio renderer reads that retained value through `shownValue`.
`App.binding.tsx` read only the `ready` case. A failed sync therefore cleared the album, track,
and transport passed to `useMediaSession`, which set native playback state to `none`.

The app now uses `shownValue` too. No new state, request, retry, or background timer was added.
The cost is that controls describe retained local playback during a failed server sync. The
binding still records the sync failure. Loading and failures without retained data still clear
controls. Account fences and session selection are unchanged.

## Verification

Three app-binding regressions failed before the correction with `none` instead of `playing`.
They now pass for offline, authentication, and generic sync failures.

The browser regression mounts the real app and worker with fixture data. It decodes PCM silence
and uses Chromium's native Media Session API. After a configured sync failure, it waits for the
reconciled React commit and its effects. Audio continues, the source stays unchanged, and the
native track metadata and playing state remain present. The old production line fails this same
check. No live API, provider, or speaker is used.

Run with a player Vite server on port 5181:

```sh
node clients/player/node_modules/vite/bin/vite.js --config clients/player/vite.config.ts --port 5181
node tools/verify-player-media-session.mjs
```

The script accepts another origin as its first argument. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`
can select other installed browser tools. Browser fixtures now belong to the player TypeScript
check. This caught and corrected an overly broad fixture claim-result type. The older playback
smoke also exposed an asynchronous wait that treated a pending Promise as a satisfied condition.
Its worker-state checks now await their results in Node. The corrected smoke passes with an empty
outbox; the audio fixture extraction preserves its decoded playback check.

| Gate | Result |
| --- | --- |
| Player Vitest | 270 passed. |
| Reference client and worker | 276 passed. |
| Plugin and SDK tests | Passed, with the existing private Pandora fixture skips. |
| Player typecheck, including browser fixtures | Passed. |
| Changed-file Biome and player architecture checks | Passed. |
| Player and reference-client builds | Passed. |
| Independent review | No production blocker found. The browser test now waits for the React commit, addressing its timing concern. |
| `just verify` | Stops at the existing Rust formatting difference in `sessions/machine.rs:84`. Current main fails the same check. |
| Whole-repository typecheck | Retains the existing player JPEG fixture import error. |
| Whole-repository Biome | Retains 30 errors and 18 warnings outside this change. |

`just format` was run. Formatter-only changes outside this unit were restored rather than added
to the fix. These scoped passes do not make the full-repository gate pass.

## Phone observations and limits

The connected phone ran Android 17 and Chrome 153.0.8010.52, with the existing deployed bundle
`index-C_dEkOCQ.js`.

At 20:09:02 UTC, a 465.341-second track ended normally while the page was hidden. The next source
started loading at 20:09:03 and stalled at 20:09:07. It delivered no audio bytes to the element.
Android later showed Chrome frozen, with no new Pyxis or Chrome process exit. On reopening at
20:16:51, the same page reported a media format error while its Media Session still said playing.
This error does not prove an unsupported codec. The loading request failed before decoding.
A later request to the same track through the local server returned valid WebM response headers
and a byte range in 6.477 seconds. The cause of the earlier loading stall remains unknown.

With permission, Chrome received a temporary Android power exemption at 20:26:53. A screen-off
track transition succeeded. The original setting was restored and verified at 20:30:26. Another
screen-off transition succeeded at 20:32:16 without the exemption. The comparison does not
establish battery settings as the cause or a fix. Tracks, screen-off duration, and cache state
differed between attempts.

The user also reported controls that sometimes disappear despite audible playback. A device
snapshot showed an active native Android Chrome media session with `PLAYING` state. Notification
permissions were blocked, but the user clarified that controls do appear at other times. No
notification setting was changed. The reproduced app-state bug above is a real defect, not a
claim that the phone snapshot proves its cause.

The original report of albums starting in the middle remains open. Ten isolated desktop Chromium
switches from track 2 at 15 seconds started the replacement album at track 1 near zero. That is
not a capture of the phone failure. The player also ignores stream and play errors and does not
reload an already selected failed source on ordinary Play. Those recovery defects remain outside
this small media-controls correction.

Diagnostic evidence is under `~/.local/state/pyxis/phone-background-20260922/` on the development
host. No Sonos playback, queue, grouping, or volume command was issued.

## Deployment

Deployed and verified: `80ebbf4ffb8026d8d4a8069fbdce86edeae7e1d6`.

| Item | Verified value |
| --- | --- |
| Package | `/nix/store/00fclidljix5bq11nlxj4ianahlxfbll-pyxis-2.0.0` |
| Running web root | `/nix/store/73a4437s9zxfff0q0vzlmhgm0lpq3kbw-pyxis-player-2.0.0` |
| Bundle | `index-C607_03P.js` |
| Bundle SHA-256 | `a6ee37bdce19784fd49f9bd9f813a161b1e481c4444fb20d29a99592c740cc74` |

The exact commit built successfully. A read-only session check found no reachable playing
session before deployment. Both Pyxis user services are active. Local and tailnet health checks
return 200. The served shell, bundle, and service worker match the installed artifact byte for
byte through both origins. The running process's web root matches the installed wrapper.

The first install attempt used an unsupported `nix profile add --name` option after removing
the old profile entry. It stopped before restarting services. The previous entry was restored
with the exact old flake reference, and its running artifact was verified unchanged. The retry
omitted the unsupported option and completed. Profile priority 5 was preserved. No deployment
helper change is included in this code fix.

Physical acceptance of this correction is still pending. The phone must use **Reload now** to
load the new bundle. Do not clear its site data or command outbox. Temporary page event listeners
were stored only in memory and disappear on reload; Chrome was frozen when explicit removal was
attempted. The timed Android captures finished; the remote helpers and local browser-debugging
forward were removed. Android battery settings were restored and verified. Notification settings
were not changed.
