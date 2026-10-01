# Shared renderer-confirmed commands

Implementation and final verification are in progress. Nothing from this change is deployed yet.

## Behavior agreed with the user

| Situation | Required result |
| --- | --- |
| Play succeeds. | Confirm native audio before saving and publishing Playing. |
| Play fails after album queue replacement. | Keep the new album selected. Preserve successful Clear/Add writes. Show the error on the host and allow retry. |
| A remote command fails. | Show its error on the playback host only. The console receives session state, not a correlated failure. |
| Pause arrives during unconfirmed Play from Stopped or Paused. | Cancel the pending Play locally. Keep prior saved transport. Do not invent Playing or a successful Pause receipt. Later redelivery remains retryable. |
| Pause arrives when saved transport is Playing. | Confirm Pause and persist it through the existing worker receipt/revision contract. |
| A successful directive repeats. | Check its durable receipt before renderer effects. Do not restart audio after a newer Pause. |
| Audio fails after Playing was saved. | Pause audio and persist a corrective Pause for the still-selected hosted session. |

These decisions leave the RPC contract, worker schema, core transport rules, account fences, and offline outbox unchanged.

## Reproduction before the change

The product client publishes queued commands before its React audio effects. It swallows native Play refusal and remembers a directive ID before successful execution. The reference client already confirms effects before persistence and restores the renderer on failure.

The new player regression uses the real worker/database fixture. It fails because a refused directive leaves playback `ready` instead of surfacing failure. Its command has no confirmed native audio.

The native Chromium regression reproduces the stronger failure. Before any user activation, a remote Play leaves both local and remote transport Playing while the element remains paused at zero. Element volume is 1 and `muted` is false. The host shows no failure. The command outbox drains, so a later read is not a correction.

The browser test does not replace `HTMLMediaElement.play()`. It forces Chromium's document-user-activation policy. CDP reads and command delivery use `userGesture: false`. Ordinary Playwright evaluation can grant activation, so using it would invalidate this refusal test. The fixture starts with volume 100 because silent volume can bypass autoplay restrictions. The browser process mutes physical output, not the element's playback policy.

This proves a native refusal path and false transport reporting. It does not prove physical phone audibility or explain the earlier stream stall.

Red logs are under `~/.local/state/pyxis/renderer-confirmed-commands/red/`.

## Baseline verification

| Gate on unchanged `be27649` code | Result |
| --- | --- |
| Player Vitest | 270 passed. |
| Reference client and worker Vitest | 276 passed. |
| Player typecheck | Passed. |
| `just verify` | Stops at the inherited Rust formatting difference in `sessions/machine.rs:84`. |
| Whole-repository typecheck | Retains the inherited JPEG fixture import error. |

The worktree uses its own installed dependencies and the flake's ProseQL closure. Node 22 is supplied explicitly because the flake shell does not include Node. Logs are under `~/.local/state/pyxis/renderer-confirmed-commands/baseline/`.

## Native verification command

Run the fixture with a local player Vite server on port 5182:

```sh
node clients/player/node_modules/vite/bin/vite.js --config clients/player/vite.config.ts --port 5182
node tools/verify-player-confirmed-commands.mjs http://127.0.0.1:5182
```

The script uses configurable Playwright and Chromium paths through `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. It uses fixture data and the real worker, not a live account, provider, or speaker. A request guard rejects live API, media, and external requests before delivery.

The script requires Chromium's native `NotAllowedError`, a present unmuted element at volume 1, no activation, and no receipt. It also checks error retention after volume and refresh, a real local click starting decoded audio, retry under the same ID, receipt replay after Pause, storage rollback, retained album selection, and unresolved-load cancellation.

## Review corrections

Independent review reproduced four implementation regressions. A non-Pause directive interrupted album replacement. A stale selected snapshot permitted playback after durable host reassignment. An unrelated operation erased the host error. A redundant Play rewound an advancing element to the saved position.

Review also exposed cancellation during a submitted Play write. The write cannot be withdrawn through the current worker API. The shared host waits for its result, then restores prior Stopped or Paused transport before publishing the completed command result. It uses a separate correction ID. It does not create a receipt for the cancellation-only Pause.

A correction retries revision conflicts against fresh durable state. It does not retry the original receipted Play. If storage rejects the correction, the host keeps audio paused and shows the error. Saved transport can remain Playing. Refresh and receipt replay do not restart audio in that host. A fresh Play explicitly retries playback.

Durable ownership loss stops this renderer before rollback or retry. Initial seeks apply to new sources. A fresh redundant Play preserves the advancing element position. A normal queued Pause retains its receipt when audio fails during the preceding Play write.

Final implementation gates, independent follow-up review, exact build, deployment, and physical acceptance remain pending.

## Costs and limits

Renderer confirmation adds worker preview and media waits before a Play write. Browser gesture timing therefore needs native testing, not only simulated-browser tests. Cross-tab writes can invalidate the preview, so bounded revision retries remain necessary.

Logical cancellation cannot abort network work through the existing stream-loader interface. It must fence and release a late result. Cancellation of unconfirmed Play is not a successful durable Pause and does not create a receipt.

A submitted write can commit before its corrective command. Storage failure can prevent durable repair. The existing error surface reports this failure; it does not promise the stored transport matches paused audio. Suppression of automatic restart lasts for the current host instance. Reopening restores saved truth. No new persistent failure state or wire acknowledgement is added.

This change does not add correlated console errors, continuous radio, automatic failed-source retries, or a host-unlock gesture. It does not diagnose stalled phone stream requests or Chrome suspension. It sends no Sonos commands and does not clear site data or saved commands.
