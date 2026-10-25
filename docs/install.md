# Install Pyxis with `nix profile`

Pyxis v2 installs per user. The aggregate package contains the Rust core, built reference
client, YouTube Music, Pandora, Sonos, and download-only Soulseek plugins, the yt-dlp updater,
the dedicated tsnet edge, and four systemd user units.

## Existing NixOS service must leave first

The old system units and the new user units cannot run together. Both use the `pyxis`
tailnet hostname, and both bind their configured localhost port.

The M2 activation stopped these legacy units before enabling v2:

```text
pyxis.service
tsnet-proxy-pyxis.service
```

They remain declared by the current NixOS generation. Deploy the prepared `mountainous`
removal before a reboot or system switch can start them again. Verify both old units are
inactive. Do not delete `/var/lib/pyxis` or `/var/lib/borg/pyxis`. The former is the read-only
legacy source, and the latter remains rollback evidence.

## Install

From a clean committed checkout:

```sh
nix profile add .#pyxis
systemctl --user daemon-reload
systemctl --user enable --now pyxis.service
systemctl --user enable --now pyxis-ytdlp-update.timer
```

Verify localhost before starting the tailnet edge:

```sh
curl -fsS http://127.0.0.1:4488/healthz
systemctl --user status pyxis.service
systemctl --user list-timers pyxis-ytdlp-update.timer
```

Then start the edge:

```sh
systemctl --user enable --now pyxis-tsnet.service
journalctl --user -u pyxis-tsnet.service -f
```

The first start can print an authorization URL. Authorize it once. Replacing an older
`pyxis` tailnet node can briefly report a `pyxis-1` name during authorization. Restart the
edge after authorization and verify that its log reports the final origin:

```text
https://pyxis.hummingbird-lake.ts.net
```

Also verify that plain HTTP redirects to that exact HTTPS origin. Do not rename the origin.
Installed PWA state and offline downloads are origin-scoped.

## Install and verify the PWA

Open the HTTPS origin once while online, then reload so the new service worker controls the
page. Use the browser's install action if a standalone app is wanted. In the reference
client, `Offline downloads available` must be `true` before pinning.

Choose **Pin offline** on an album and wait for its state to become `ready`. The Local store
panel reports the pinned count and byte total. The download is complete only after every
track has a verified candidate manifest and all bounded chunks are in Cache Storage.

For the product gate, close the page, disable networking, and open the installed app again.
The shell, library, session, and pinned album must load. Play and seek within the pinned
album. Re-enable networking afterward and confirm deferred writes reconcile.

Cache Storage, IndexedDB, service workers, and stream credentials are all scoped to the
exact HTTPS origin. Clearing site data removes the device grant and offline media.

## State

| Data | Default path |
|---|---|
| ProseQL, credential key, media, stream cache | `~/.local/share/pyxis/` |
| Mutable yt-dlp nightly | `~/.local/share/pyxis/yt-dlp/yt-dlp` |
| tsnet node state and certificate | `~/.config/pyxis-tsnet/` |

Plugin credentials are encrypted with XChaCha20-Poly1305. The owner-only
`credentials.key` file is required to decrypt them. Back up the whole state directory, not
only the ProseQL source file.

## Browser apps on another origin

By default only pages on Pyxis's own origin can use it from a browser. To let a web app on
another origin, such as a car dashboard PWA, call `/rpc`, read `/stream/:trackId` and open
`/realtime`, list its exact origin in `PYXIS_ALLOWED_ORIGINS` (or `--allowed-origins`):

```ini
[Service]
Environment=PYXIS_ALLOWED_ORIGINS=https://vela.example,http://car.local:8080
```

```sh
systemctl --user daemon-reload
systemctl --user restart pyxis.service
```

| Rule | Detail |
|---|---|
| Format | Comma-separated. Spaces around entries are ignored. Unset or empty allows no other origin |
| Exact origins only | Scheme, host and a non-default port, exactly as the browser sends `Origin`. No path, no trailing `/`, no `:443` on https |
| No wildcard | `*` is refused. So is any malformed entry: the service does not start and names the entry and its correct form |
| Matching | Byte-for-byte. `http://` versus `https://`, another port, or `vela.example.evil.test` never match `https://vela.example` |

What an allowed origin gets:

- `/rpc` and `/stream/:trackId` answer CORS preflight and add
  `Access-Control-Allow-Origin` with that exact origin. Requests may send `Authorization`,
  `Content-Type`, `Range` and `x-pyxis-contract`. Responses expose `Content-Range`,
  `Accept-Ranges`, `Content-Length` and `x-pyxis-candidate-id`.
- `Access-Control-Allow-Credentials` is never sent. Pyxis authenticates with a bearer
  header, not cookies, so the app must set the header itself and must not use
  `credentials: "include"`.
- `/realtime` accepts the upgrade. Browsers do not preflight WebSockets, so the core checks
  `Origin` instead: no `Origin` (non-browser clients), the same origin as the `Host` the
  request reached, or an allowed origin is accepted. Any other origin is refused with HTTP
  403 and a `realtime.failure` body with code `realtime.originRefused`. This check applies
  even when the allowlist is empty.

The allowlist does not authenticate anything. Every call still needs a valid token. It only
decides which other sites' pages the browser lets read Pyxis responses.

## Sonos discovery

The Sonos plugin uses SSDP multicast plus an Avahi mDNS fallback and does not require credentials.
Where discovery is unavailable, set account-scoped plugin config for id `sonos` with private
IPv4 `seedHosts`, for example `{ "seedHosts": ["192.168.1.20"] }`.

Optional deadlines, in milliseconds:

| Setting | Default | Scope |
|---|---|---|
| `discoveryTimeoutMs` | 2500 | SSDP/mDNS discovery window; range 100–10000 |
| `requestTimeoutMs` | 3000 | Descriptions, topology and ordinary SOAP requests; range 100–30000 |
| `positionTimeoutMs` | Greater of 8000 and `requestTimeoutMs` | Only `GetPositionInfo`; range 100–30000 |

Some valid position replies take about five seconds. The separate position deadline allows
those replies to complete without substituting cached or partial state on timeout. It does
not make the speaker faster: a stalled position read can hold serialized output work up to
five seconds longer at defaults. The core's overall plugin-call deadline remains 30 seconds;
large individual deadlines do not extend that total budget.

Set `PYXIS_LAN_BASE_URL` to the LAN-reachable HTTP origin speakers use to fetch Pyxis media,
for example `http://192.168.1.2:9000`. The selected TCP port must be allowed by the host firewall;
a listener that is reachable only from the host lets SOAP commands succeed but leaves speakers
unable to fetch audio. When set, the core binds a second listener at that origin
which serves only `/stream/:trackId`; RPC, realtime, health, and web routes remain on loopback
and the tailnet edge. Output Play creates a short-lived track-bound URL under the LAN origin;
account bearer tokens are never sent to speakers. Fixture tests prove discovery,
SOAP faults, core-hosted sessions, transport, volume, grouping, and stream-ticket binding. A
real speaker is still required for M4 product acceptance.

Configure the LAN listener with a user-service override, then restart:

```ini
[Service]
Environment=PYXIS_LAN_BASE_URL=http://192.168.1.2:9000
```

```sh
systemctl --user daemon-reload
systemctl --user restart pyxis.service
```

Use an address assigned to the Pyxis host, not `0.0.0.0`, because that address is embedded in
speaker URLs as well as used for binding.

## Pandora configuration

Pandora configuration is account-scoped. Clients call `plugin.config.set` with plugin id
`pandora` and `{ username, password }`. The service returns no plaintext configuration and
stores only ciphertext. Do not put the password in shell history. The reference client gets
a temporary configuration form during M2 validation; the later designed client owns the
final interaction.

## Soulseek fidelity upgrades

Soulseek is a provider-only background plugin and is deliberately omitted from `plugin.list` and
all clients. Configure plugin id `soulseek` with `{ username, password }`; optional bounded fields
are `listenPort`, `searchTimeoutMs`, `downloadTimeoutMs`, `maxFileBytes`, and `maxResults`.
Credentials are account-scoped and encrypted like Pandora credentials.

The bundled client has no sharing operation or shared-folder setting and is patched to advertise
zero folders and zero files. The core processes at most one due library track per minute, accepts
only automatic matches, probes every complete download with `ffprobe`, requires a strict fidelity
improvement, and retries peer/network failures later. Partial or ambiguous downloads never become
media candidates.

## Upgrade

```sh
nix profile upgrade --refresh pyxis
systemctl --user daemon-reload
systemctl --user restart pyxis.service pyxis-tsnet.service
```

The yt-dlp timer updates its mutable binary without restarting Pyxis. The pinned nixpkgs
binary remains the fallback if a nightly update fails.

## Remove

```sh
systemctl --user disable --now \
  pyxis.service pyxis-tsnet.service pyxis-ytdlp-update.timer
nix profile remove pyxis
```

Profile removal does not delete user data.
