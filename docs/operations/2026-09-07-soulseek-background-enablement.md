# Soulseek background configuration

## Scope

The user supplied a temporary Soulseek account and explicitly asked to configure Pyxis.
The user plans to rotate the credentials later. Leave this configuration installed until
that rotation or a removal request. Do not repeat the earlier test cleanup automatically.

The earlier M6 acceptance proved one real upgrade, not ongoing unattended operation. A read-only
check on September 7 found the provider process running but no Soulseek configuration for
`default`. The scheduler skips accounts without configuration. Its last recorded attempt was
August 25 UTC. The accepted 32,853,203-byte FLAC file still existed.

## Configuration

At **2026-09-07 15:04:55 UTC**, the public `plugin.config.set` operation returned `succeeded`
for plugin `soulseek`. A prior `account.list` read verified the caller's account was `default`.
Only username and password were supplied, retaining the existing provider defaults.

Credentials entered the configuration helper through stdin. They were not embedded in scripts,
command arguments, reports, or repository files. The service stores configuration encrypted.
A read-only check confirmed neither supplied plaintext value appeared in the stored database.
No credential key was opened and no configuration was decrypted. This report contains no
credential values.

No code deployment, service restart, forced retry, library edit, or Sonos command was performed.
The existing no-upload policy and automatic matching/download checks remain unchanged.

## Initial verification

The scheduler resumed without a restart. It rechecked the existing satisfied job at 15:05:40 UTC,
then began a fresh upgrade attempt at **15:06:40 UTC**. These are separate observations: checking
an existing local file does not establish successful network authentication or a new download.

The first fresh attempt then completed. By **15:09:54 UTC**, two new local candidates were
recorded as lossless FLAC. Their files existed with sizes matching the stored records:

| Track ID | File bytes | Bitrate | Sample rate | Candidate recorded, UTC |
|---|---:|---:|---:|---|
| `b35dd8b2db84da92f8c7eb0288` | 9,772,421 | 1193 kbps | 44.1 kHz | 15:07:30 |
| `772e0295544de55b5f7ed70449` | 39,784,191 | 1083 kbps | 44.1 kHz | 15:09:25 |

Both media records were `ready`, and both corresponding jobs were `satisfied`. The core journal
also recorded completed background upgrades. These observations establish that network login,
automatic search/download, format verification, and local import resumed with the supplied account.
Another attempt produced `match.ambiguous` and entered retry instead of importing uncertain media.
No jobs were manually cleared or reset to force a result.

Metadata inspection also confirmed one encrypted configuration record with ciphertext and nonce,
and no username/password fields in that record. The supplied configuration remains installed.
The earlier accepted FLAC remains present. No audio was played to verify these new files.
Long-running throughput and peer queue reliability still need observation; two successful imports
do not promise an upgrade for every library track.

Evidence is stored under `~/.local/state/pyxis-diagnostics/soulseek-status/`:

- `2026-09-07-status.json` records the prior idle state.
- `2026-09-07-configuration.json` records the successful configuration and plaintext absence check.
- `2026-09-07-after-configuration.jsonl` records bounded read-only scheduler observations.
- `2026-09-07-post-upgrade-status.json` records encrypted configuration and newly ready local files.
- `2026-09-07-completed-upgrades.log` contains only matching completion entries from the core journal.
- The adjacent helpers contain no supplied credentials. The configuration helper only accepts
  the two supplied fields through stdin and only permits a Soulseek configuration write.
