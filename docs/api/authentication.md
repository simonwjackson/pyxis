# Authentication

Pyxis has two kinds of caller, and the difference matters for more than permissions.

| Principal | Obtained by | Represents |
|---|---|---|
| Device | `auth.device.claim` or `auth.device.pair` | Something a person uses, which can host playback |
| API token | `auth.token.create` | Automation, which can never host playback |

Only a device can create or host a session. An API token can watch and read, and can drive
another device's session through `session.command.send` if it holds `session:control`, but
it can never be the thing playing audio. So `session.create` and `session.command.run`
refuse a token with `notDevice`, which is a category difference rather than a privilege
one. `session.command.send` and `session.handoff` accept a token, because asking another
device to do something does not require being a device.

## First boot has no configuration step

A fresh server has exactly one account, `default`, and no devices. The first caller to ask
adopts it:

```json
{ "_tag": "auth.device.claim", "payload": { "name": "living room" } }
```

```json
{
  "_tag": "auth.device.claim",
  "outcome": {
    "status": "ready",
    "value": {
      "account": { "id": "default", "name": "default", "isDefault": true, "createdAt": "..." },
      "device": { "id": "01J...", "name": "living room" },
      "bearerToken": "..."
    }
  }
}
```

**The bearer token is returned exactly once.** Persist it. There is no endpoint that will
tell you it again.

The cost of this design is explicit: on a shared network, the first caller wins. That is
acceptable because it removes the setup step entirely for the common single-user case, and
because the moment a second account exists, automatic adoption stops.

## Once a second account exists, claiming requires pairing

`auth.device.claim` then answers `pairingRequired`, and a new device needs a code from an
already-trusted device:

```json
{ "_tag": "auth.pairing.create", "payload": {} }
```

The response carries a six-digit numeric `code` with an expiry. The new device redeems it
without any token of its own:

```json
{ "_tag": "auth.device.pair", "payload": { "name": "kitchen", "code": "482913" } }
```

A code is single-use and expires. Redeeming a spent or expired code answers `invalidCode`
or `expired`, never `ready`.

## Using a token

Every non-public operation takes a bearer token:

```http
POST /rpc
authorization: Bearer <token>
content-type: application/json
```

Three operations are public and need no token: `system.status.get`, `auth.device.claim`,
and `auth.device.pair`. Everything else answers `auth.required` without one, and
`auth.invalidToken` with a bad or revoked one. Both arrive as `rpc.failure`.

Media bytes use the same header:

```http
GET /stream/<trackId>
authorization: Bearer <token>
```

The realtime socket cannot use a header, because browsers do not allow one on a WebSocket
handshake. It authenticates with a hello frame instead. See [realtime.md](realtime.md).

## Scopes

Scopes constrain API tokens only. A device principal is always allowed, because a device
is a person's own client rather than delegated automation.

| Scope | Grants |
|---|---|
| `account:read` | List accounts, list plugins |
| `account:admin` | Create accounts, create pairing codes, issue and revoke tokens, set plugin config |
| `session:read` | List sessions, read session state |
| `session:control` | Create sessions, run and send session commands, hand off |
| `source:read` | Search sources, browse source albums |
| `library:read` | Read albums, bookmarks, playlists, matching evaluation |
| `library:write` | Add and change albums, bookmarks, playlists, matching overrides |
| `listen:read` | Read listening history and hot albums |
| `listen:write` | Append listen events |

Create a token with the narrowest set that works:

```json
{
  "_tag": "auth.token.create",
  "payload": { "name": "scrobbler", "scopes": ["listen:write"] }
}
```

An unknown scope is rejected as `invalidScope` rather than being silently dropped, so a
typo cannot quietly produce a token that is weaker than intended.

Insufficient scope answers `auth.insufficientScope` as an `rpc.failure`, and names both the
operation and the scope it needed.

Revocation takes effect immediately:

```json
{ "_tag": "auth.token.revoke", "payload": { "tokenId": "01J..." } }
```

## Accounts are a hard boundary

Every record is account-scoped, and the scoping is enforced at the storage layer rather
than in each query. One account cannot read, write, or address another account's data by
guessing an id, and realtime fan-out is per-account by construction rather than by filter.

Multi-account support exists so several people can share one server without sharing a
library. `default` works out of the box, so a single user never has to think about it.
