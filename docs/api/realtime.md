# Realtime

```text
GET /realtime            (WebSocket, JSON text frames)
```

The socket does two jobs:

1. It **delivers state** for the topics you subscribe to.
2. It **makes your device reachable**, so a console can drive it.

The second job is easy to miss. A device with no realtime socket is not reachable, and the
core will correctly refuse console commands aimed at it. If your client hosts playback, it
must hold this socket.

Frames use the same tagged-union convention as RPC. Types are in
`contracts/generated/pyxis.ts` as `RealtimeClientMessage` and `RealtimeServerMessage`.

## Say hello first

The first frame must be `realtime.hello`:

```json
{
  "_tag": "realtime.hello",
  "payload": {
    "bearerToken": "...",
    "topics": ["sessions", "library"],
    "resumeToken": "01J...:42"
  }
}
```

The token travels in the body rather than a header because browsers cannot set headers on a
WebSocket handshake, and a query string would copy the token into proxy and server logs.

A socket that stays silent is closed with `realtime.helloTimeout`. Any other first frame is
closed with `realtime.helloRequired`.

## Topics

| Topic | Requires | Carries |
|---|---|---|
| `sessions` | `session:read` | `session.state` |
| `library` | `library:read` | `library.album.state`, `library.album.removed` |

Each topic requires the same scope its RPC read operations require, so a token cannot watch
what it may not read. Asking for a topic you lack is refused with `auth.insufficientScope`
and the socket closes. The subscription is never silently narrowed, because a client that
believes it is watching a topic which will never deliver is worse than an error.

Subscriptions are always scoped to your account. Each account has its own channel, so
cross-account delivery is impossible by construction rather than by a filter that could be
forgotten.

## Welcome

```json
{
  "_tag": "realtime.welcome",
  "payload": {
    "accountId": "default",
    "contractId": "pyxis-rpc-v2",
    "topics": ["sessions", "library"],
    "resumeToken": "01J...:42",
    "resumed": false,
    "missedEventsDropped": false
  }
}
```

`missedEventsDropped: true` means the server could not replay what you missed. **Refetch
through RPC instead of patching local state.** This is the ordinary path after a server
restart, not a rare edge case, because a restart changes the resume epoch.

## Events

```json
{
  "_tag": "realtime.event",
  "payload": {
    "topic": "library",
    "resumeToken": "01J...:43",
    "state": { "_tag": "library.album.state", "payload": { } }
  }
}
```

Every event carries the **whole record**, never a delta. A client that misses an event and
refetches converges on the same value, which is what makes reconnection simple.

Two ordering rules matter:

- Advance your stored resume token only as you apply each event. The token in `welcome`
  points at where you were, not where the backlog ends.
- RPC responses and realtime frames have **no ordering relative to each other**. Compare
  `revision` and keep the higher one. An in-flight local write is newer intent than any
  frame that arrives during it.

## Reconnecting

Send your last `resumeToken` in the next hello. The token is opaque: it encodes a
per-process epoch, so one minted before a restart is refused rather than silently replaying
the wrong events. Do not parse it.

The server retains a bounded backlog per account. Past that, you get
`missedEventsDropped: true` and refetch.

A subscriber that falls too far behind is closed with `realtime.lagged`, which is retryable.
Reconnect and resume.

## Changing subscriptions

```json
{ "_tag": "realtime.subscribe", "payload": { "topics": ["sessions"] } }
{ "_tag": "realtime.unsubscribe", "payload": { "topics": ["library"] } }
```

Both are acknowledged with the resulting set, so you can wait for the change to take effect
rather than guessing:

```json
{ "_tag": "realtime.subscribed", "payload": { "topics": ["sessions"] } }
```

## Being driven by a console

If your client hosts playback, it must handle directed commands:

```json
{
  "_tag": "realtime.command",
  "payload": {
    "sessionId": "01J...",
    "command": { "_tag": "transport.pause", "payload": {} },
    "issuedBy": "01J...",
    "directiveId": "01J..."
  }
}
```

Rules for a conforming host:

1. **Directives bypass topic filtering.** They are addressed to your device, not published
   to a topic you chose. You receive them even with no subscriptions.
2. **Apply, then report.** Do what the command says to your audio, then call
   `session.command.run` with it. Send the directive's `directiveId` as `commandId`. That
   call makes the change durable and fans the new state out to every console.
3. **Deduplicate on `directiveId`.** A reconnect can redeliver one, and applying
   `queue.add` twice adds the same track twice. Keep a local applied-ID set because the
   audio action happens before the report. The core also deduplicates the report.
4. Exactly one socket per device receives a given directive, so a second open tab does not
   double-apply. Do not rely on receiving it on every socket.

## Failures

```json
{ "_tag": "realtime.failure", "payload": { "code": "auth.invalidToken", "message": "...", "retryable": false } }
```

`realtime.failure` is terminal: the socket closes immediately after it. Branch on
`retryable` to decide whether to reconnect.

| Code | Meaning |
|---|---|
| `realtime.helloTimeout` | No hello in time |
| `realtime.helloRequired` | First frame was not a hello |
| `realtime.alreadyAuthenticated` | A second hello on a live socket |
| `auth.invalidToken` | Token invalid or revoked |
| `auth.insufficientScope` | A requested topic needs a scope you lack |
| `realtime.lagged` | Too far behind. Reconnect and resume |
| `auth.unavailable` | Authentication backend was unreachable. Retryable |
| `realtime.unavailable` | Handshake could not complete. Retryable |
| `request.invalidPayload` | Frame was not a valid client message |
| `request.malformed` | Frame was not UTF-8 JSON text |

The server sends pings. Most WebSocket clients answer automatically. A socket that goes
silent past the idle deadline is closed, which is how a host that lost power stops looking
reachable.
