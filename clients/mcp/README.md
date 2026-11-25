# Pyxis MCP server

Point a native MCP agent at `http://127.0.0.1:4489/mcp`. Set its `Authorization` header
on **every request** to `Bearer <Pyxis API token>` from `auth.token.create`. `system.status`
reads the core's version, contract and installed capabilities, even with no plugins installed.

## Run

```sh
nix run .#pyxis-mcp
# Or, from the repo root inside nix develop:
bun install --frozen-lockfile
bun run --cwd clients/mcp start
```

| Setting | Default | Purpose |
|---|---|---|
| `PYXIS_MCP_HOST` | `127.0.0.1` | MCP listener address |
| `PYXIS_MCP_PORT` | `4489` | MCP listener port |
| `PYXIS_BASE_URL` | `http://127.0.0.1:4488` | Trusted Pyxis origin, without path or credentials |

The `--host` and `--port` flags override the two listener settings, as service managers pass
them. `packages.<system>.pyxis-mcp-app` bundles the server with its tailnet sidecar,
`pyxis-mcp-tsnet`, for a mountainous service app.

`GET /healthz` returns `200` while the MCP listener is running. It does not check upstream
health. Keep the listener on loopback behind a trusted TLS edge when serving remote agents;
protect the MCP-to-core hop too. Requests with a browser `Origin` are not supported.

## Wire contract

The [v2 SDK](https://ts.sdk.modelcontextprotocol.io/v2/serving/http) handles
[2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
Each POST stands alone. Send the per-request `_meta` envelope and its mirrored headers,
including `Mcp-Method` and (for `tools/call`) `Mcp-Name`. `server/discover` is available
but not required. There is no legacy `initialize`, session ID or stored client identity.

This private adapter uses Pyxis API keys per D29, **not the optional MCP OAuth flow**.
Neither the server nor its deployment needs a Pyxis service credential. Only the configured
origin receives the agent's bearer; redirects are disabled. Use one narrowly scoped token
per agent, not a device token. See [Pyxis authentication](../../docs/api/authentication.md).

`system.status.get` on the core is public. To check revocation even on public reads and
MCP metadata calls, the adapter probes the protected `account.list` once per request. It
discards the result. `auth.insufficientScope` from that probe proves authentication; the
agent need not have `account:read`. Missing or revoked credentials get HTTP 401 before MCP
dispatch. Each tool operation still runs under the same caller's real Pyxis scopes. During
a tool call, `RpcFailure` becomes `isError: true` with `code`, `message` and `retryable` in
`structuredContent` and text.

## Add a tool

1. Put the tool in its area under `src/tools/` (`playback/` or `library/`). Follow
   `src/tools/system.ts`: register with the SDK, declare an input schema, wrap execution
   in `runTool`, and use the request's `PyxisClient.call` with a generated `_tag` and payload.
   Handle typed domain outcomes such as `unknown` and `noSources`; do not turn them into
   successful empty results. Never retain the client between requests.
2. Import and invoke the area's registration function in `src/tools/registry.ts` once.
   Additional tools in that area change only its own module. U49 can register resources
   and prompts in the per-request server factory without changing tool registration.
3. Before a destructive action, takeover or ambiguous target, call `confirmAction(ctx,
   message)` and **return its result if present**, before any write. Name the proposed
   action and resolved target (including ID) in the message. The helper requests form input
   via [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr);
   an explicit no/cancel makes no change. If the client lacks form support, proceed (D27).
   This is a user prompt, not authorization. Core account/scopes always govern the write.
4. Run `bun run --cwd clients/mcp test` inside `nix develop`. `test/harness.ts` starts the
   repo's Rust core on a fresh store, empty plugin path and OS-assigned port, then makes a
   new account, device grant and scoped API token via RPC. Use `startHarness({ scopes })`,
   seed data with `owner.call`, send wire requests with `post`, and `await close()` in
   teardown. A suite needing real plugin fixtures can install them under `plugins/` with
   `prepareState` before boot; the default is zero plugins.

## Playback tools

Pass `target` as an exact session ID, a session name, or a Sonos room name/ID, in that
order. Room tools look up rooms directly. Name matching ignores case and skips unreachable
sessions. If several sessions match, the server proposes the most recently updated one;
pass an ID to select another. Room playback uses the room's group. A room can have a
core-hosted output session created on demand; the agent never hosts a session.

| Tools | Use |
|---|---|
| `session.list`, `session.state` | Find reachable sessions and inspect one session. |
| `playback.play`, `playback.resume`, `playback.pause`, `playback.stop`, `playback.seek` | Control the current queue; seek uses absolute `positionMs`. |
| `playback.next`, `playback.previous` | Move one queue occurrence; continue playing only if already playing. |
| `playback.album`, `playback.find_and_play` | Replace the queue with a library album by `albumId` or the best matching source song by `query`. |
| `station.play`, `station.from_track` | Play one batch; supply `pluginId` and the source's `stationId` or track `externalId`. No continuous refill. |
| `queue.get`, `queue.add`, `queue.play_next` | Read the named queue (unknown IDs remain explicit misses), append `trackIds`, or insert them after the current occurrence without starting playback. |
| `playback.volume`, `playback.mute` | Use the full core volume range (0–100); mute sets zero. Set a new volume to unmute. |
| `sleep.set`, `sleep.cancel`, `sleep.get` | Set exactly one of `minutes` or `at` (RFC 3339 with offset), optionally `fadeSeconds`. Read the persisted deadline or `null`. |
| `room.list`, `room.play`, `room.volume`, `playback.takeover` | Discover Sonos topology, play a queue or `trackIds`, set group volume, or take the renderer back with Play. |
| `room.group`, `room.ungroup` | Set the complete group (`coordinator` and `members`) or make `room` standalone. A session released by regroup keeps its queue but loses its output. |
| `playback.stop_all`, `session.handoff` | Stop all reachable sessions (one outcome per session), or move playback `from` one device session `to` an idle one. Output handoff is not supported by Pyxis. |

Stop-all, ambiguous targets, queue replacement, handoff of a queue, and regroup with
session release use MRTR. Pyxis exposes no foreign-stream flag: even a stopped output may
be playing another app's stream. The server therefore asks before output Play, including
album, search and station playback. Without form support it proceeds. None of these
confirmations bypass token scopes. Use `session:read` and `session:control` for playback,
`library:read` for album or named queue reads, and `source:read` for search and stations.

`dispatched` means the command was sent, not that a device host has confirmed the audio.
Track selection sends clear, add and play in order; it is not a transaction. If Play fails,
the selected queue remains. Sonos currently requires library tracks with playable candidates;
playing a non-library search/station result returns the core error, never an implicit add.

## Library tools

Use `tools/list` for the argument schemas. None of these tools changes playback.

| Area | Tools |
|---|---|
| Library reads | `library.search`, `library.album`, `library.tags`, `library.byTag`, `library.recentlyAdded`, `library.albums`, `library.artist`, `library.artwork` |
| Library writes | `library.tags.set`, `library.tags.bulk`, `library.album.add`, `bookmarks.add`, `bookmarks.remove`, `playlists.create`, `playlists.append` |
| Collection reads | `bookmarks.list`, `playlists.list` |
| Discovery | `search.sources`, `search.albums`, `stations.list`, `stations.capture` |
| History | `history.recent`, `history.range`, `history.top`, `history.neglected` |
| Organization | `organizer.snapshot`, `organizer.tags.preview`, `organizer.tags.apply`, `shelves.save`, `shelves.remove`, `shelves.list`, `shelves.albums` |
| Matching | `matching.wrongSong` |

**Browse.** `library.search`, `library.byTag`, `library.recentlyAdded` and `library.artist`
return a first page. Send just `cursor` and optional `limit` to `library.albums` for the
next page. For a shelf, send its `shelfId` and `cursor` to `shelves.albums`. Shelf replacement
and removal require the revision you observed.

**Discover and capture.** Catalog search needs `source:read` and `library:read` to report
`inLibrary`. Tracks match by core ID, albums by normalized title, artist and year, artists by
normalized album-artist name. The public library read does not expose provider references.
`library.album.add` reads the source album before saving its tracks, so it also needs
`source:read`. `stations.capture` takes the station result's `pluginId` (its `sourcePluginId`),
`trackId` (its core `id`) and `albumExternalId`. It verifies that track belongs to the source
album. Without an album reference it uses `library:read` to report existing membership or
metadata for a subsequent search. It never guesses an album or modifies a station.

**Tag plans.** Send the same `changes` (e.g. `[{"albumId":"…","tags":["ambient","live"]}]`)
to preview and apply. Both use the same planner. Labels replace the entire set, not just the
labels mentioned. Apply checks every target first. Form-capable clients confirm the actual
before/after pairs; a changed plan requires a new answer. An explicit refusal writes nothing.
The core has no multi-album transaction or tag compare-and-swap: another writer can edit
between calls. On a mid-plan failure, `applied` lists acknowledged writes and `albumId`
identifies the failed or unacknowledged write. Read current state before retrying.

**History.** A play counts once per raw listen event, including incomplete plays. Range
bounds are RFC3339 instants (`from` inclusive, `to` exclusive). Top albums and tracks rank
by count; neglected albums sort by oldest observed play, unobserved first. The core on this
base exposes the latest 1000 plays without a cursor. `eventsScanned` and
`historyMayBeTruncated` describe that input window on range, top and neglected results;
a null `lastPlayedAt` means no observed play **in that window**, not necessarily never played.
Top and neglected also need `library:read` for album membership.

**Artwork.** Set `PYXIS_MCP_ARTWORK_ORIGINS` to a comma-separated list of trusted exact
image origins (e.g. `https://images.example.org`). The default permits none. An account can
write an artwork URL, so a library read must not become an arbitrary network fetch. The
server fetches only the stored URL, sends no Pyxis bearer, refuses redirects, and accepts PNG,
JPEG, WebP and GIF responses up to 4 MiB within eight seconds. Image data returns in MCP
`content`, never on plugin stdio.

## Resources, subscriptions and prompts

Use `resources/list` for fixed URIs and `resources/templates/list` for album IDs. Each
`resources/read` result is private to the requesting token. JSON text has the same shape
as the matching tool's `structuredContent`. Cover images are base64 resource blobs with
an image MIME type; the same trusted-origin and size limits apply as for the artwork tool.

| URI | Matching tool (default arguments unless noted) | `ttlMs` |
|---|---|---:|
| `pyxis://now-playing` | `session.list`: reachable sessions by ID, with transport and current track ID | 0 |
| `pyxis://albums` | `library.albums`: first page; continue with the tool and its cursor | 30000 |
| `pyxis://albums/{albumId}` | `library.album`: album detail and tracks in album order | 30000 |
| `pyxis://artwork/{albumId}` | `library.artwork`: cover image, or JSON `noArtwork` | 30000 |
| `pyxis://tags` | `library.tags`: tags by name with counts | 30000 |
| `pyxis://history/recent` | `history.recent`: latest 50 plays, newest first | 5000 |
| `pyxis://library` | `organizer.snapshot`: full library by album ID | 30000 |
| `pyxis://sonos/rooms` | `room.list`: groups by ID, then rooms by ID | 0 |

For [subscriptions/listen](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions),
include `"notifications":{"resourceSubscriptions":["pyxis://now-playing"]}` in the request
params. Wait for the SSE acknowledgment, then read the resource. The adapter opens one
Pyxis `/realtime` connection for this stream, using the caller's own token in the hello
frame (`sessions` topic, `session:read` required). Pyxis checks the token at handshake, not
on each event. Revoking a token blocks new requests but does not terminate an already
accepted Pyxis socket. The adapter honors only the now-playing URI.
Each new session revision invalidates that URI once; `notifications/resources/updated`
includes `pyxis.dev/sessionId` and `pyxis.dev/revision` in `_meta`. Retirement also
invalidates the URI, with the session ID but no revision. Read again for current state. Closing the SSE stream closes its upstream socket. After a disconnect, listen and
read again: there is no saved cursor or replay across MCP requests.

Use `prompts/list` to discover **DJ** (`mood` required) and **Rediscover** (no arguments).
`prompts/get` renders instructions; it never starts playback. DJ guides selection and
playback for a mood or moment. Rediscover uses history and library tags to suggest albums,
then waits for the user's choice before playing one.
