# Plugin protocol

Plugins are ordinary programs. The core starts one as a subprocess and speaks
line-delimited JSON over its stdin and stdout. Nothing about a plugin is privileged: the
bundled YouTube Music, Pandora, Sonos, and Soulseek plugins use exactly the protocol described
here, which is what keeps "third-party plugins" true rather than a slogan.

The easiest path is [`@pyxis/plugin-sdk`](../../packages/plugin-sdk/README.md), which
handles framing, handshake, and error mapping. This document describes the wire beneath it,
for anyone writing a plugin in another language.

## Framing

One JSON object per line on stdout. One per line on stdin.

**stdout is reserved for protocol frames.** Write logs to stderr. A stray `console.log` is
a protocol violation and will be reported as one.

Oversized lines are rejected rather than buffered, so a plugin cannot exhaust core memory.

## Envelopes

Every line in both directions is an envelope carrying a correlation id and one tagged
union. Unknown fields are rejected, so the shape has to be exact.

```text
to plugin:    { "id": "...", "request":  { "_tag": "...", "payload": { ... } } }
from plugin:  { "id": "...", "response": { "_tag": "...", "outcome": { ... } } }
```

The response `_tag` must match the request `_tag`, and the `id` must be echoed exactly.

## Handshake

The core opens with a handshake:

```json
{ "id": "01J...", "request": { "_tag": "plugin.handshake", "payload": { "protocolVersion": 1 } } }
```

The plugin answers with its manifest:

```json
{
  "id": "01J...",
  "response": {
    "_tag": "plugin.handshake",
    "outcome": {
      "status": "ready",
      "value": {
        "id": "ytmusic",
        "name": "YouTube Music",
        "version": "1.0.0",
        "protocolVersion": 1,
        "capabilities": ["source"],
        "configSchema": {}
      }
    }
  }
}
```

To refuse, answer `{ "status": "rejected", "value": { "code": ..., "message": ..., "retryable": ... } }`.

A protocol version mismatch is **refused loudly** rather than degraded. Half-working is
worse than absent.

A plugin that cannot work at all, such as one wrapping a binary that is not installed,
should refuse the handshake with a typed failure instead of starting and failing every
call.

## Capability classes

| Class | For | Shipped example |
|---|---|---|
| `source` | Search, browse, playlists, radio, stream resolution | ytmusic, pandora |
| `output` | Playback targets, transport, volume, grouping | sonos |
| `provider` | Background media acquisition, no client surface | none yet |
| `enricher` | Metadata augmentation | none yet |

A plugin declares the classes it serves. The core calls only classes a plugin declared, and
treats a call to an undeclared class as unavailable without ever reaching the plugin. It
does not verify that a declared class has operations behind it: that check lives in the
SDK, which refuses to build such a plugin. A non-SDK plugin that declares `source` and
implements nothing starts normally, and each call fails with whatever that plugin chooses
to return.

Several plugins may serve the same class. Each is called independently, and one failing
degrades only that plugin's contribution.

## Source operations

These are the operations the core actually calls on a `source`. A plugin that implements
only `search` is useful. One that implements all five is a full source.

| Operation | Input |
|---|---|
| `search` | `{ query, limit }` |
| `album.search` | `{ query }` |
| `album.get` | `{ externalId }` |
| `stream.resolve` | `{ trackId, preferredFormats? }` |
| `stream.fetch` | `{ trackId, targetPath, preferredFormats? }` |

Output shapes are decoded strictly. **An unknown field is rejected, and so is a missing
required one.** Getting a field name wrong fails the whole call, so copy these exactly.

```jsonc
// search
{ "tracks": [{
  "source": "ytmusic",        // required, your plugin id
  "externalId": "...",        // required, opaque to the core
  "title": "...",             // required
  "artist": "...",            // required
  "album": "...",             // optional
  "durationMs": 372000,       // optional
  "artworkUrl": "https://..." // optional
}] }

// album.search
{ "albums": [{
  "externalId": "...",        // required
  "title": "...",             // required
  "artist": "...",            // required
  "year": 1977,               // optional
  "artworkUrl": "https://..." // optional
}] }

// album.get
{
  "externalId": "...",          // required
  "title": "...",               // required
  "artist": "...",              // required
  "year": 1977,                 // optional
  "artworkUrl": "https://...",  // optional
  "tracks": [{
    "externalId": "...",        // required
    "title": "...",             // required
    "artist": "...",            // required
    "durationMs": 372000,       // optional
    "trackNumber": 3            // required on every track
  }]
}

// stream.resolve
{
  "kind": "remote",             // required
  "url": "https://...",         // required
  "headers": { "cookie": "…" }, // optional, sent verbatim when the core fetches
  "format": "opus",             // optional, the container or codec name
  "bitrateKbps": 160.0,         // optional
  "sampleRateHz": 48000,        // optional
  "lossless": false             // required
}

// stream.fetch
{ "kind": "local", "targetPath": "/exact/path/the/core/gave/you" }
```

There is no `sourcePluginId` on a search track. The core knows which plugin answered and
fills that in itself.

`preferredFormats`, when present, is an ordered list supplied by an output plugin. Resolve or
fetch the first available compatible encoding without weakening the normal quality ranking for
clients that omit it.

`stream.fetch` exists for sources whose bytes the core cannot fetch directly. Write to the
absolute `targetPath` the core supplied, echo it back unchanged, and write nowhere else.
The core rejects any other path and rejects a call that wrote no bytes.

`lossless` drives quality-first resolution, which prefers a lossless candidate over any
lossy bitrate. State it truthfully or your source will be ranked wrongly.

## Output operations

The Sonos plugin establishes the initial `output` operation set. Inputs are validated before
any network or speaker effect.

| Operation | Input |
|---|---|
| `discover` | `{}` |
| `stream.profile` | `{ targetId }` |
| `transport.play` | `{ targetId, streamUrl, metadata, positionMs? }` |
| `transport.pause` | `{ targetId }` |
| `transport.stop` | `{ targetId }` |
| `transport.state` | `{ targetId }` |
| `volume.set` | `{ targetId, volume }` |
| `group.set` | `{ coordinatorId, memberIds }` |

`discover` returns `{ groups, refreshedAt }`. Each group has `id`, `coordinatorId`,
`coordinatorName`, and `rooms`; each room has `id`, `name`, optional `model`, `address`,
`locationUrl`, and `coordinator`.

`stream.profile` returns `{ preferredFormats }` in output preference order. The core carries
that profile through source resolution, candidate-bound stream tickets, cache identity, and any
plugin-directed fetch so the DIDL MIME type and served bytes stay compatible.

`transport.play` takes an absolute LAN HTTP URL. `metadata.title` is required; `artist`,
`album`, `artworkUrl`, and `mimeType` are optional. The plugin sends the URL and DIDL-Lite
metadata to the group coordinator, optionally seeks to `positionMs`, then plays. Audio bytes
never enter plugin stdio.

`group.set` describes the complete desired group, including its coordinator in `memberIds`.
Rooms leaving the group are made standalone before new members join. UPnP faults preserve
their numeric identity in codes such as `sonos.upnp.701`.

## Provider operations

Provider-only plugins are internal background capabilities and are omitted from public
`plugin.list`; they create no client surface. Soulseek establishes two operations:

| Operation | Input |
|---|---|
| `upgrade.search` | `{ track, currentFidelity, maxResults }` |
| `upgrade.download` | `{ candidateRef, destinationPath, expectedBytes, maxBytes }` |

Search returns bounded metadata plus an opaque, expiring `candidateRef`; peer identity and remote
filenames never enter persistent core state. Download writes only to the exact core-created
`.partial` path and echoes it with the byte count. The core probes the complete file, reruns
matching with verified duration, requires a strict fidelity improvement, and imports it through
the local media store. Failed or ambiguous attempts register no candidate.

The bundled Soulseek provider exposes no upload or sharing operation, accepts no shared-folder
configuration, and pins a download-only client whose login advertises zero folders and zero files.
The `enricher` operation set is not fixed because no enricher ships yet.

## Capability calls

```json
{
  "id": "01J...",
  "request": {
    "_tag": "capability.call",
    "payload": {
      "capability": "source",
      "operation": "search",
      "accountId": "default",
      "config": { "username": "..." },
      "input": { "query": "Bowie", "limit": 10 }
    }
  }
}
```

`accountId` is always present on a source call. `config` is absent when no credentials are
stored for that account, which is the normal state before someone enters a password.

A successful answer:

```json
{
  "id": "01J...",
  "response": {
    "_tag": "capability.call",
    "outcome": { "status": "ready", "value": { "tracks": [] } }
  }
}
```

A failure:

```json
{
  "id": "01J...",
  "response": {
    "_tag": "capability.call",
    "outcome": {
      "status": "unavailable",
      "value": { "code": "source.rateLimited", "message": "try again later", "retryable": true }
    }
  }
}
```

`retryable` is the field that matters. Set it truthfully:

- **Retryable:** network failures, timeouts, HTTP 429 and 5xx, expired sessions.
- **Permanent:** invalid input, unknown ids, bad credentials, HTTP 4xx other than 429.

The core propagates this to clients, which use it to decide whether a queued write survives.
Marking a permanent failure retryable causes clients to retry forever.

## Media bytes never cross this boundary

This is the rule that keeps the protocol small.

A `source` returns **metadata**: a URL plus any headers required to fetch it, along with
fidelity facts such as codec, bitrate, and sample rate. The core does the fetching, caching,
range handling, and serving.

When bytes cannot be fetched by the core, a plugin returns a **local file path** it has
already written, into a path the core supplied. That is what `stream.fetch` does on a
`source`, and it is how the `provider` class is expected to hand over completed downloads.

If your plugin wants to hand back audio bytes on stdout, the design is wrong.

## Failure isolation

The core assumes plugins fail, and the failure must never take the core with it:

| Situation | Core behaviour |
|---|---|
| Process exits mid-call | That call fails once, then the plugin restarts |
| Call hangs | Times out; the core stays responsive |
| Repeated crashes | Quarantined instead of restart-looping forever |
| Malformed output | Rejected as a permanent, typed failure |

A plugin failing degrades one capability. It never degrades the core, and it never degrades
another plugin.

## Configuration and credentials

Credentials are account-scoped and set through `plugin.config.set`. They are encrypted at
rest with XChaCha20-Poly1305 and **plaintext never enters the database or any API response**.
There is no operation that reads configuration back.

Decrypted configuration is passed to your plugin only inside an operation request, only for
the account making that request. Do not log it, and do not write it anywhere yourself.

A plugin should stay available before it is configured. Report a typed permanent failure
from operations that need credentials rather than refusing the handshake, so a client can
show that the plugin exists and needs a password.

## Conformance without a core

The SDK ships a harness that exercises a plugin's declared operations with no Pyxis running,
so a plugin can be tested in isolation:

```ts
import { verifyPlugin } from "@pyxis/plugin-sdk/testing"

const report = await verifyPlugin(plugin, [
  { capability: PluginCapability.Source, operation: "search", input: { query: "Bowie" } },
])
```

## Installation

The core discovers plugins on `PATH` and in its plugin directory, deduplicating the same
executable found through both. Installing a plugin package makes it appear in `plugin.list`
after a restart. Removing one leaves the core healthy with one fewer capability.
