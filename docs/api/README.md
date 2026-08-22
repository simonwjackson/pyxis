# The Pyxis API

Everything a third-party client needs, without reading Rust.

Pyxis has exactly two public surfaces:

| Surface | Transport | Carries |
|---|---|---|
| `POST /rpc` | HTTP, JSON | Every operation |
| `GET /realtime` | WebSocket, JSON | State fan-out and addressed commands |

Media bytes are deliberately outside both. They travel over plain HTTP at
`GET /stream/:trackId` so ordinary range requests, caching, and speaker hardware work
without protocol translation.

There is no REST resource tree. The only other route is `GET /healthz`, which returns 200
when the process can serve requests. A server built with a web root also serves the
reference client at `/`, and falls back to it for any unmatched path.

## Contract identity

Every server reports a `contractId`. This document describes `pyxis-rpc-v2`.

```sh
curl -fsS -X POST https://your-host/rpc \
  -H 'content-type: application/json' \
  -d '{"_tag":"system.status.get","payload":{}}'
```

```json
{
  "_tag": "system.status.get",
  "outcome": {
    "status": "ready",
    "value": {
      "version": "2.0.0",
      "contractId": "pyxis-rpc-v2",
      "accountCount": 1,
      "pluginCount": 2,
      "capabilities": ["source"]
    }
  }
}
```

A client that speaks a different contract must fail rather than half-work. v2 shares no
lineage with v1.

`system.status.get` is public, so it is also how you discover what is possible before
authenticating. **The core is required to run with zero plugins installed.** A
`pluginCount` of `0` and an empty `capabilities` list is a valid, working server on which
search and playback have no source. Do not treat it as an error.

## Request and response shape

A request is a tagged union:

```json
{ "_tag": "entity.concept.action", "payload": { } }
```

A response repeats the tag and wraps one outcome:

```json
{ "_tag": "entity.concept.action", "outcome": { "status": "...", "value": { } } }
```

Three rules follow from this, and clients can rely on all three:

1. **The response tag always equals the request tag**, except for protocol-level rejection,
   which uses `rpc.failure`. Treat a mismatch as a bug and fail loudly.
2. **Operation failure lives in the outcome, not the HTTP status.** A rejected album add
   and a successful one are both HTTP 200. Status codes are reserved for failures where no
   response can be produced at all.
3. **Unknown fields are rejected.** Sending an extra key is an error, not a silently
   ignored courtesy. This keeps a typo from becoming a silent no-op.

Every operation has an `unavailable` outcome carrying a failure envelope:

```json
{ "code": "source.albumUnavailable", "message": "plugin is not installed", "retryable": false }
```

`retryable` is the field to branch on, not `code`. An offline client uses it to decide
whether to keep a queued write or surface a permanent error. Parse `code` for display and
telemetry, never for control flow you care about.

## Generated types

The Rust contract module is the source of truth. Two artifacts are generated from it and
are safe to consume directly:

| File | Use |
|---|---|
| `contracts/generated/pyxis.ts` | TypeScript types for requests, responses, and realtime frames |
| `contracts/generated/pyxis.schema.json` | JSON Schema covering both directions of the wire |

Never hand-edit them. If you need a change, it belongs in the contract module.

## Where to go next

| Document | Answers |
|---|---|
| [authentication.md](authentication.md) | How a device gets a token, and what scopes mean |
| [operations.md](operations.md) | Every operation, its scope, and its outcome statuses |
| [realtime.md](realtime.md) | Subscribing to state and being driven by a console |
| [plugin-protocol.md](plugin-protocol.md) | Writing a source, output, or provider plugin |

## Worked example: authenticate and play a track

This example uses only documented calls. It claims a device, searches a source plugin,
queues the first result into a session, starts playback, and fetches the audio bytes.

It is executable. `tools/verify-api-example` extracts the block below from this file
verbatim and runs it, so drift is caught by running it. It needs a live server, a source
plugin, and network access, so it is not part of `just verify`.

<!-- verify-api-example -->

```ts
const origin = process.env.PYXIS_ORIGIN ?? "http://127.0.0.1:4488"

/** Every operation goes through this one function. */
async function rpc(request: unknown, bearer?: string): Promise<any> {
  const response = await fetch(`${origin}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(request),
  })
  const body = await response.json()
  if (body._tag === "rpc.failure") {
    throw new Error(`rejected: ${body.outcome.value.code} ${body.outcome.value.message}`)
  }
  return body
}

// 1. Claim a device. On a fresh server the first caller adopts the default account.
const claim = await rpc({ _tag: "auth.device.claim", payload: { name: "worked example" } })
if (claim.outcome.status !== "ready") {
  throw new Error(`this server requires pairing: ${claim.outcome.status}`)
}
const token: string = claim.outcome.value.bearerToken

// 2. Discover what the server can actually do before assuming a source exists.
const status = await rpc({ _tag: "system.status.get", payload: {} })
if (status.outcome.value.pluginCount === 0) {
  throw new Error("no plugins installed, so there is nothing to play")
}

// 3. Search. `noSources` is a distinct, valid answer from an empty result list.
const search = await rpc(
  { _tag: "source.search.run", payload: { query: "David Bowie Heroes", limit: 5 } },
  token,
)
if (search.outcome.status === "noSources") throw new Error("no source plugin is installed")
if (search.outcome.status !== "ready") {
  throw new Error(`search unavailable: ${search.outcome.value.message}`)
}
const track = search.outcome.value.tracks[0]
if (track === undefined) throw new Error("no track matched the query")

// 4. Create a session. A session is hosted by the device that renders audio.
const session = await rpc({ _tag: "session.create", payload: { name: "worked example" } }, token)
if (session.outcome.status !== "ready") {
  throw new Error(`session refused: ${session.outcome.status}`)
}
const sessionId: string = session.outcome.value.id

// 5. Queue the track, then play. Both are commands on the same union.
const queued = await rpc(
  {
    _tag: "session.command.run",
    payload: {
      sessionId,
      command: { _tag: "queue.add", payload: { trackIds: [track.id] } },
    },
  },
  token,
)
if (queued.outcome.status !== "applied") {
  throw new Error(`queue.add was not applied: ${queued.outcome.status}`)
}

const playing = await rpc(
  {
    _tag: "session.command.run",
    payload: { sessionId, command: { _tag: "transport.play", payload: {} } },
  },
  token,
)
if (playing.outcome.status !== "applied") {
  throw new Error(`transport.play was not applied: ${playing.outcome.status}`)
}

// 6. Fetch the audio. Media never travels over RPC. This is plain HTTP with a range
//    request, which is what makes ordinary players and speakers work unmodified.
const audio = await fetch(`${origin}/stream/${encodeURIComponent(track.id)}`, {
  headers: { authorization: `Bearer ${token}`, range: "bytes=0-65535" },
})
if (audio.status !== 206) throw new Error(`expected a partial response, got ${audio.status}`)
const bytes = (await audio.arrayBuffer()).byteLength

console.log(
  JSON.stringify(
    {
      track: `${track.artist} — ${track.title}`,
      transport: playing.outcome.value.transport,
      currentTrackId: playing.outcome.value.currentTrackId,
      contentType: audio.headers.get("content-type"),
      bytes,
    },
    null,
    2,
  ),
)
```

You need Bun, a running Pyxis, and a source plugin that is installed and configured. Some
sources play nothing until credentials are set.

**Each run creates a device and a session, both durable, and neither can be deleted.** Use
a throwaway server rather than a real account:

```sh
pyxis --state-dir /tmp/pyxis-example --port 4493 &
PYXIS_ORIGIN=http://127.0.0.1:4493 tools/verify-api-example
```

Real output from a server with the YouTube Music plugin installed:

```json
{
  "track": "David Bowie — David Bowie - \"Heroes\" (Official Video) [HD]",
  "transport": "playing",
  "currentTrackId": "0a7089de6ecbb719581add0dfa",
  "contentType": "audio/webm",
  "bytes": 65536
}
```

Two details in that output matter, because guessing either one wrongly is a common way to
build a broken client:

- **A track id is opaque.** It is not prefixed with the plugin that produced it and it
  carries no parseable structure. Treat it as a key, never as something to decompose.
- **The content type comes from the source**, not from a fixed assumption. Here it is
  `audio/webm`. Pass it to the player rather than hardcoding one.
