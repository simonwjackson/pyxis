# 2026-11-25: M16 "YouTube Music reaches further" on unzen

M16 landed on `main` at `d825e3f` and runs on unzen. All live smoke checks passed,
including a saved station cursor that kept paging across a core restart. The
user-present Kids Desk speaker check for U64 is still open.

## What landed

Commits on `main`, `93b3594..d825e3f`, in unit order. The eight unit commits come first.
The review fixes follow them as separate commits. They were not squashed, because
autosquash conflicted at almost every step (decision logged in the workflow run).

| Unit | Commit | Subject |
|---|---|---|
| U63 | `19d2d16` | `feat(core): sealed stateless paging cursors (U63)` |
| U57 | `44e8db4` | `feat(ytmusic): canonical OLAK album ids (U57)` |
| U58 | `93e0af8` | `feat(ytmusic): share rate limits and retry with visitor context (U58)` |
| U59 | `4d8f8c6` | `feat(source): search playlists and suggest exact queries (U59)` |
| U60 | `ec03cce` | `feat(ytmusic): start seeded radio and resume automix on demand (U60)` |
| U61 | `ef261f3` | `feat(source): expose read-only discography and track metadata (U61)` |
| U62 | `6374ab3` | `feat(source): read plain or timed lyrics and full-size artwork (U62)` |
| U64 | `962fb4d` | `feat(core): seal output stream tokens across restarts (U64)` |

`git log --oneline 93b3594..d825e3f` lists all 22 commits with their current hashes.

Before M16, on the same day:
- `500d809` and `93b3594` moved ProseQL from the local `git+file` pin `0f9c9cc` to
  `github:simonwjackson/proseql/4a7893f` and dropped the YAML patch, which is now upstream.
- `7f1d439` and `7e36feb` added ProseQL's new `regress` dependency to `Cargo.lock`, and made
  `just proseql-pin` check the lock. `93b3594` had passed `just verify`, because the dev shell
  quietly added the missing crates to the lock, but `nix build .#pyxis` failed with that lock.

## Review

| Round | Must-fix found | Result |
|---|---|---|
| 1 | 10 | Fixed by the workers: 12 fix commits |
| 2 | 2 | Partly fixed album radio (#2), new regression on unknown page fields (#3) |
| After round 2 | 2 | Fixed by the coordinating session: `8733e16`, `d825e3f` (closes #3, #2) |

The coordinating session fixed #2 and #3 after the last review round, so no reviewer has
checked those two fixes.

Notes left open:
- The MCP search tool returns `pages`, but its input cannot accept a page back.
- Search continuation is tested against a real upstream page only for songs.
- `cross_origin.rs:368` has a `result_large_err` Clippy finding that existed before M16.

## Checks before deploy

- `just verify` on aka, on the final tree: 34 Rust test binaries, 154 plugin and SDK tests,
  240 client tests, contracts in sync.
- `nix build .#pyxis` on `d825e3f`: `/nix/store/cjbzahn0whvmhrmspqp88vla3jszhjzz-pyxis-2.0.0`.
- `nix build .#pyxis` on the deploy branch (`e0b7d34`), which also runs the core tests in the
  Nix sandbox: passed.

## Deploy

- `service-apps-unzen` went from `d7a0cec` to merge commit `e0b7d34`. The merge took `main`'s
  `flake.nix` and `flake.lock`, so ProseQL now comes from GitHub `4a7893f`, not over SSH from zao.
  ProseQL is public, and unzen reached the archive.
- `app-update-pyxis.service` was started by hand at 13:58:19 UTC. It deployed at 14:04:30
  (receipt `/var/lib/app-updater/receipts/1795615099379426066.json`, activation
  `/nix/store/blv6iw08hmzhf46l6sr3qhs8dkpsr0kv-activatable-pyxis-2.0.0`).

## Smoke checks on unzen

Raw replies are in `/tmp/m16-smoke/out/` on the operator machine. The script is
`/tmp/m16-smoke/smoke.sh`.

| Check | Result |
|---|---|
| `/healthz` | 200 |
| `system.status.get` | `ready` |
| Live search "Radiohead OK Computer" | `ready`; all five YouTube Music albums came back as OLAK ids |
| `source.album.get` on `OLAK5uy_nc6afxSnmK8OFML8dF9q_0D1MBMXsGnL4` | `ready`; same id back, "OK Computer", 12 tracks |
| Album radio, `source.station.create` | `ready`; seed is the issued `RDAMPLOLAK5uy_nc6a…` with `wAEB` |
| Batch 1 (`limit` 3) | Videotape, I Thought I Saw Your Face Today, Faust Arp; cursor 19,447 bytes |
| Batch 2 from batch 1's cursor | End of Beginning, Heart-Shaped Box, Creep; cursor 18,267 bytes |
| `source.track.lyrics` for "Airbag" (`jNY_wLukVW0`) | `found`, 21 timed lines with attribution |
| `systemctl restart pyxis.service` | Up again at 14:06:05; `/healthz` 200 |
| Batch 3 from batch 2's cursor, after the restart | 4th Of July, Red Light Indicates Doors Are Secured, Motion Picture Soundtrack; cursor present |

`journalctl -u pyxis.service -p warning` had no entries since 14:04.

Open: the U64 check on real hardware, playing a track on the Kids Desk Sonos speaker
through a sealed stream token. It needs a person at the speaker.

## Roll back

On zao, reset `service-apps-unzen` to `d7a0cec` and start `app-update-pyxis.service` on
unzen as root. Do not go below `d7a0cec`: older builds cannot read the records from the
2026-11-24 media import (see `2026-11-24-zao-media-import.md`).

Sealed cursors and stream tokens issued by this build do not work on `d7a0cec`. Clients
then start their stations and streams again. No data is lost.
