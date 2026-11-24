# Run Pyxis

## Production

Production runs on **unzen** through mountainous `serviceApps.pyxis`, following the
`service-apps-unzen` branch. Production deployment is managed in mountainous, not by
this repository's former zao deployment scripts or systemd user units.

The `pyxis` package contains the Rust core, YouTube Music, Pandora, Sonos,
and download-only Soulseek plugins, the `pyxis-ytdlp-update` binary, and the dedicated
tsnet edge. It does not install systemd units.

## Development

Inside the project dev shell, run:

```sh
just dev
```

The core listens at <http://127.0.0.1:4488>. Check `/healthz`; `/` returns 404 without a
web root.

`tools/configure-plugin`, `tools/verify-api-example`, and `tools/backfill-library-artwork`
default to `http://127.0.0.1:4488`. Set `PYXIS_ORIGIN` to use another service origin.

## No bundled web player

**Before upgrading:** deploying this package stops serving the phone's installed Pyxis
player. There is no first-party app shell to load or install. This does not clear browser
storage. The package sets no web root: `/` returns 404. The core still accepts
`--web-root DIR` for operators serving their own client. [RPC, realtime and media
streams](api/README.md) do not require a web root.

## Core defaults

These are program defaults, not production state paths configured by mountainous.

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

```sh
export PYXIS_ALLOWED_ORIGINS=https://vela.example,http://car.local:8080
```

Apply this environment setting where the core starts.

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

Configure the LAN listener in the environment where the core starts:

```sh
export PYXIS_LAN_BASE_URL=http://192.168.1.2:9000
```

Use an address assigned to the Pyxis host, not `0.0.0.0`, because that address is embedded in
speaker URLs as well as used for binding.

## Pandora configuration

Pandora configuration is account-scoped. Clients call `plugin.config.set` with plugin id
`pandora` and `{ username, password }`. The service returns no plaintext configuration and
stores only ciphertext. Do not put the password in shell history.

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

## yt-dlp updates

The package provides `pyxis-ytdlp-update` for the deployment's updater to run. It updates
the mutable binary without restarting Pyxis. The pinned nixpkgs binary remains the fallback
if an update fails.
