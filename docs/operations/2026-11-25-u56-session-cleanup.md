# 2026-11-25: retire stale sessions on unzen (U56)

The default account went from 47 sessions to 6. RPC retired 18 offline device
sessions. The first hourly expiry sweep accounted for 23 more. All three Sonos
outputs survived. No manual database edits, service restart or deployment were needed.

## Backup and verification

Before the first retirement, copied `/var/lib/pyxis/data/db` and its matching
`credentials.key` to `/var/lib/pyxis-backup-20261125T054306Z-pre-u56` on unzen
(mode `0700`). `diff -qr` on the directories and `cmp` on the keys both passed.
This backup includes the zao media import; it is not the pre-import backup.

Used `session.list` with `{"includeUnreachable":true}` for every snapshot. Before
each `session.retire`, listed again and required `reachable: false`, no `output`
or `outputRef`, and a non-output host. Raw replies on the operator machine:
`/tmp/u56-20261125-ZzodvFI1/` (`before.json`, `retire-<id>.json`, `post-rpc.json`,
`pre-sweep.json`, `after.json`). All times below are UTC.

| Sessions | Before 05:43:09 | After RPC 05:49:06 | After sweep 06:27:03 |
|---|---:|---:|---:|
| Total | 47 | 29 | 6 |
| Sonos outputs | 3 | 3 | 3 |
| Reachable (including outputs) | 1 | 1 | 1 |
| stopped | 20 | 3 | 3 |
| ended | 1 | 0 | 0 |
| paused | 10 | 10 | 2 |
| playing | 16 | 16 | 1 |
| Updated more than 30 days ago | 36 | 25 | 2 |
| Updated within 30 days | 11 | 4 | 4 |

| Session name (case-sensitive) | Before | After sweep |
|---|---:|---:|
| Chrome on Linux armv81 | 5 | 1 |
| Chrome on Linux x86_64 | 3 | 0 |
| Kids Desk | 1 | 1 |
| Kitchen | 1 | 1 |
| Living Room | 1 | 1 |
| M3 handoff retest A | 1 | 0 |
| M3 handoff target | 1 | 0 |
| myoko | 1 | 0 |
| Reference browser | 15 | 0 |
| reference browser | 5 | 0 |
| Synthetic browser | 1 | 0 |
| tailnet check | 1 | 0 |
| Vela | 9 | 2 |
| worked example | 2 | 0 |

## Retirement results

Of 44 requests, 18 returned `retired` (17 stopped, one ended). The other
26 returned `unreachable`: their playing or paused hosts were offline and
could not confirm a stop. None returned `stopRequested`.

The service started at 05:26:20. At 06:26:00, all 29 post-RPC session IDs were
still present. At 06:27:03, exactly the 23 offline device IDs older than 30 days
were gone. `journalctl -u pyxis.service` had no entries from 06:25:45 through
06:27:00, and the service start time did not change. Sweep attribution is based
on the timing and the exact match of IDs, not on a per-session journal entry.

| Session ID | `session.retire` | After sweep |
|---|---|---|
| `01M0KTRSBRPK1DPMFX12AK9X0N` | `retired` | Removed by RPC |
| `01M0KW9JTYR0B0JTREBXBD92GH` | `unreachable` | Expired |
| `01M0KXGAABG197TD0MW6YX4CFJ` | `unreachable` | Expired |
| `01M0T8MVXMTGEDAV125E92ZA8X` | `unreachable` | Expired |
| `01M0TDH90CDWASY812HZBYMB38` | `unreachable` | Expired |
| `01M0TEGDK922E1PGF4TG0V9E5Q` | `retired` | Removed by RPC |
| `01M0TYJGTFS18FFP635WVB0QKQ` | `unreachable` | Expired |
| `01M0VC4TY9E014FDHJY27AJ0T4` | `unreachable` | Expired |
| `01M0VG8S5K9S0QZ4PPJXF1JNPN` | `retired` | Removed by RPC |
| `01M12NSA955C2CJG9MKCWJRPNF` | `retired` | Removed by RPC |
| `01M12NXPBZQZ7KPX3KTVJHE1KZ` | `retired` | Removed by RPC |
| `01M12Q96B93ZH4K8FCJ468XAVD` | `retired` | Removed by RPC |
| `01M12QN1YJDHK5KGXNR2SVT4SA` | `retired` | Removed by RPC |
| `01M1VZ1EJDRKSSXPS839H5GH38` | `retired` | Removed by RPC |
| `01M1W59YH76407X22XSRB4A3W6` | `unreachable` | Expired |
| `01M1WBF931NWE131HBVZZN6QAR` | `retired` | Removed by RPC |
| `01M1WN15VV4CT6QNF32YEJHWKY` | `retired` | Removed by RPC |
| `01M1YNHFFW2SX05VP5N2SX4B07` | `unreachable` | Expired |
| `01M20XPA6JWC0TGGRGAHE6DMB3` | `unreachable` | Expired |
| `01M20Y6BBN5P8JHPTB2885GZDF` | `unreachable` | Expired |
| `01M20YA42RT9H8WNJN7Q7X4Z14` | `unreachable` | Expired |
| `01M20ZN0HSY5NNPRHSBQHC3AXK` | `unreachable` | Expired |
| `01M211F9SBY3HYPE0FD2BTYGCH` | `unreachable` | Expired |
| `01M21BEG9C9YGBGFJYTS3TEBRA` | `unreachable` | Expired |
| `01M21FB1QJTP3VHXBBM22XZFPA` | `unreachable` | Expired |
| `01M21FV0QM5GC5JQKZA7DVTDSC` | `unreachable` | Expired |
| `01M3T67V51X257CQX72Q8H52E5` | `unreachable` | Expired |
| `01M3ZH9KM2CXMN4WZK043APCSN` | `unreachable` | Expired |
| `01M5RP9V03BWXSSBQ09KJV9G9H` | `unreachable` | Expired |
| `01M5RPBYQ5KG0GD4AR6QN9T1QN` | `unreachable` | Expired |
| `01M5RPFKN8F3MZ9TS7CEYEYSZK` | `unreachable` | Expired |
| `01M5RPGSTBDSVC9GJ7EFP47BNM` | `unreachable` | Expired |
| `01M5RPJ77GQ2JAFXP1VN953XFP` | `unreachable` | Expired |
| `01M5RYSJVTG4AARAX6A9ZFYYX0` | `retired` | Removed by RPC |
| `01M5SRK0SP3WYHV2PHWQKJPS0C` | `retired` | Removed by RPC |
| `01M5W8M7AXSC5BJ9957X6PBY4B` | `retired` | Removed by RPC |
| `01M5WHQ0CMXF91XG0GCGVB3MSA` | `retired` | Removed by RPC |
| `01M5WM8TWV8H8P3FMWAY32CSJ7` | `retired` | Removed by RPC |
| `01M5WMENRWTHTM60BJZVWF94QK` | `unreachable` | Still listed |
| `01M5YRPT6K9P239Y42PVQP1BMV` | `retired` | Removed by RPC |
| `01M5Z3QGWDZCGYZYPZAM2E6RW5` | `retired` | Removed by RPC |
| `01M5Z3RY8HZ13JW0P0ZNVQBP3F` | `unreachable` | Still listed |
| `01M5Z3YZ0D3653GPRX8XTH4GMK` | `retired` | Removed by RPC |
| `01M84SJKPBEWDGQF3TQGBPAD0W` | `unreachable` | Still listed |

## Sessions kept

Outputs never expire. Kids Desk was the only reachable session in both snapshots.
Kitchen and Living Room stayed protected even though both were offline.

| Session ID | Name | Host | Transport | Last update (UTC) |
|---|---|---|---|---|
| `01M0TZJY5GHPSCXD6DMFWJZMM2` | Kitchen | Sonos, offline | stopped | 2026-09-07 14:46:28 |
| `01M0V028JY3N4A5VW3PHJG6SGM` | Living Room | Sonos, offline | stopped | 2026-09-06 18:19:21 |
| `01M5WMENRWTHTM60BJZVWF94QK` | Vela | Device, offline | paused | 2026-10-31 02:59:31 |
| `01M5Z3RY8HZ13JW0P0ZNVQBP3F` | Vela | Device, offline | playing | 2026-10-27 16:57:03 |
| `01M84SJKPBEWDGQF3TQGBPAD0W` | Chrome on Linux armv81 | Device, offline | paused | 2026-11-25 01:22:59 |
| `01M87KME3H1ZP7N39X45YSH8MZ` | Kids Desk | Sonos, reachable | stopped | 2026-11-25 05:03:35 |

The three offline device sessions were too recent for expiry. If they stay
offline with no new update or pending volume restore, the next hourly sweep
after each session passes 30 days will retire it. Transport and queue contents
do not affect expiry.

## Roll back the cleanup (not run)

This restores the **whole database**, not just the 41 sessions. It discards
later database changes from live use. Keep the displaced state for recovery.

1. On unzen as root, stop `app-update-pyxis.timer` first. Check that
   `app-update-pyxis.service` has no running or queued update. Wait for any
   active deploy to finish. Then stop `pyxis.service` and verify it is inactive.
2. With both the updater and Pyxis quiescent, move the current
   `/var/lib/pyxis/data/db` and `/var/lib/pyxis/data/credentials.key` into a
   new root-only recovery directory. Use `cp -a` to copy `db` and
   `credentials.key` together from `/var/lib/pyxis-backup-20261125T054306Z-pre-u56`
   into `/var/lib/pyxis/data/`. Do not overlay the old directory, change the
   media store, or roll back the service profile.
3. Compare the restored files with the backup before starting Pyxis. Start
   `pyxis.service` on the import-compatible build (`d7a0cec` for this run).
   Check the journal and `session.list` with `includeUnreachable: true` (47 at
   backup time, including the three outputs). Restart `app-update-pyxis.timer`
   only after verification. Restoring does not disable expiry: the first sweep
   an hour after restart can remove the restored stale device sessions again.
