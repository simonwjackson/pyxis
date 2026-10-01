# Shared renderer-confirmed commands

`13aa1d9` is deployed. Both clients use one renderer-confirmed playback host. All 335 reference/worker tests, 274 player tests and native Chromium checks pass. Full repository gates retain their inherited failures. Physical phone acceptance remains open.

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

Review also exposed cancellation during a submitted Play write. The write cannot be withdrawn through the current worker API. The shared host waits for its result, then restores prior Stopped or Paused transport before publishing the completed Play result. It uses a separate correction ID. It does not create a receipt for the cancellation-only Pause.

A correction retries revision conflicts against fresh durable state. It does not retry the original receipted Play. If storage rejects the correction, the host keeps audio paused and shows the error. Saved transport can remain Playing. Refresh and receipt replay do not restart audio in that host. A fresh Play explicitly retries playback.

Durable ownership loss stops this renderer before rollback or retry. Initial seeks apply to new sources. A fresh redundant Play preserves the advancing element position. A normal queued Pause retains its receipt when audio fails during the preceding Play write.

Cancellation also survives a rejected original Play write after a concurrent revision change. The host does not retry that cancelled Play. Detached elements pause before their references are removed. A stale ownership directive rejects through its promised outcome instead of throwing from the realtime callback.

## Final verification

The feature rebased onto `5cfab33`, which contains the separate local-sync settlement fix. The plan conflict kept both the placement-evidence follow-up and renderer decisions. No worker implementation was overwritten.

| Gate on integrated `13aa1d9` | Result |
| --- | --- |
| Reference/worker Vitest | 335 passed. This includes 32 shared-host cases. |
| Player Vitest | 274 passed. |
| Native Chromium | Passed after rebase. No forbidden requests or page errors. |
| Unrelated-error negative control | Correctly fails the specific native permission assertion. |
| Player typecheck | Passed. |
| Owned Biome and diff checks | Passed. |
| Player architecture gate and its tests | Passed. All 12 architecture tests pass. |
| Contract check | Passed. |
| Reference PWA and product player builds | Passed. |
| Independent behavior and boundary reviews | Passed after corrections. The last async-wrapper change received static review. |
| `just verify` | Stops at the unchanged Rust formatting difference in `sessions/machine.rs:84`. |
| Root typecheck | Fails at the unchanged `album-fixtures.ts` JPEG declaration. |

These are separate gates, not substitutes for full verification. The baseline archive contains the same two stopping failures. The companion settlement report records additional inherited full-lint and date-dependent Rust test failures. This feature did not change Rust or repair unrelated diagnostics.

Final gate logs are under `~/.local/state/pyxis/renderer-confirmed-commands/final/`. Review records are `/tmp/pyxis-renderer-correctness-review.md` and `/tmp/pyxis-renderer-validation-review.md`. The native test uses real worker logic over memory storage and configured remote behavior. It does not prove a Worker-thread or IndexedDB cold reopen.

## Deployment

The exact reviewed revision is `13aa1d9221f604edeeca75ba6e64ca3c3d5820a9`. The local Nix-shebang helper built that revision, preserved profile priority 5, and restarted both user services. Its rollback guard retained the previous package.

| Item | Verified value |
| --- | --- |
| Installed package | `/nix/store/9y9n24frs95qcz0kmdgg2cdwa1cp7m5k-pyxis-2.0.0` |
| Previous package | `/nix/store/ca520a65cmczm2k8drncdcv2g531rscz-pyxis-2.0.0` |
| Running web root | `/nix/store/qajvhs8pqc9gi57vjdr2n3yzygffyajd-pyxis-player-2.0.0` |
| Player bundle | `/assets/index-CFZGkN7t.js` |
| Worker bundle | `/assets/entry-DxK1Zu54.js` |
| Player SHA-256 | `6b4c6d120cb7356d46f4adeb5e1586c2e08af29ad3746dd5d5da1663f48dc55f` |
| Worker SHA-256 | `f4d4c261cbc3cf790895680a6f4d84e9b75828bb048de63ef0834866cb9f0aa5` |

Both `pyxis.service` and `pyxis-tsnet.service` are active. Local and tailnet health checks return 200. The served shell, player, worker, manifest and service worker match the installed files byte for byte through both origins. The worker bundle remains the companion settlement build.

The helper and deployment receipt are under `~/.local/state/pyxis/renderer-confirmed-commands/`. The fixture server is stopped. Reload an existing player tab to load the new player bundle. Phone audibility, screen-off behavior and stream stalls remain unverified.

## Costs and limits

Renderer confirmation adds worker preview and media waits before a Play write. Browser gesture timing therefore needs native testing, not only simulated-browser tests. Cross-tab writes can invalidate the preview, so bounded revision retries remain necessary.

Logical cancellation cannot abort network work through the existing stream-loader interface. It must fence and release a late result. Cancellation of unconfirmed Play is not a successful durable Pause and does not create a receipt.

A submitted write can commit before its corrective command. Storage failure can prevent durable repair. The existing error surface reports this failure; it does not promise the stored transport matches paused audio. Suppression of automatic restart lasts for the current host instance. Reopening restores saved truth. No new persistent failure state or wire acknowledgement is added.

The existing error surface prioritizes retained playback failure over general sync or realtime failures. Those failures can remain hidden until playback retry succeeds.

This change does not add correlated console errors, continuous radio, automatic failed-source retries, or a host-unlock gesture. It does not diagnose stalled phone stream requests or Chrome suspension. It sends no Sonos commands and does not clear site data or saved commands.
