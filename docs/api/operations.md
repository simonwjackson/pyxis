# Operations

Every operation in `pyxis-rpc-v2`. Unknown tags are rejected with
`request.unknownOperation`, so this list is exhaustive by construction.

Read [README.md](README.md) first for the envelope rules, and
[authentication.md](authentication.md) for what the scope column means.

## Every operation at a glance

| Operation | Scope | Outcome statuses |
|---|---|---|
| `system.status.get` | public | `ready`, `unavailable` |
| `auth.device.claim` | public | `ready`, `pairingRequired`, `unavailable` |
| `auth.device.pair` | public | `ready`, `invalidCode`, `expired`, `unavailable` |
| `auth.pairing.create` | `account:admin` | `ready`, `unavailable` |
| `auth.token.create` | `account:admin` | `ready`, `invalidScope`, `unavailable` |
| `auth.token.revoke` | `account:admin` | `succeeded`, `unknown`, `unavailable` |
| `account.list` | `account:read` | `ready`, `unavailable` |
| `account.create` | `account:admin` | `ready`, `nameTaken`, `unavailable` |
| `plugin.list` | `account:read` | `ready`, `unavailable` |
| `session.create` | `session:control` | `ready`, `notDevice`, `unavailable` |
| `session.list` | `session:read` | `ready`, `unavailable` |
| `session.state.get` | `session:read` | `ready`, `unknown`, `unavailable` |
| `session.command.run` | `session:control` | `applied`, `unknownSession`, `notHost`, `notDevice`, `rejected`, `unavailable` |
| `session.command.send` | `session:control` | `dispatched`, `unknownSession`, `unreachable`, `busy`, `hostOnly`, `unavailable` |
| `session.handoff` | `session:control` | `ready`, `unknownSession`, `unknownTarget`, `sourceUnreachable`, `targetUnreachable`, `targetBusy`, `sameSession`, `unavailable` |
| `source.search.run` | `source:read` | `ready`, `noSources`, `unavailable` |
| `source.album.search` | `source:read` | `ready`, `unavailable` |
| `source.album.get` | `source:read` | `ready`, `unavailable` |
| `library.album.add` | `library:write` | `ready`, `invalid`, `unavailable` |
| `library.albums.list` | `library:read` | `ready`, `unavailable` |
| `library.album.command.run` | `library:write` | `applied`, `removed`, `unknown`, `unavailable` |
| `library.bookmarks.list` | `library:read` | `ready`, `unavailable` |
| `library.bookmark.command.run` | `library:write` | `added`, `removed`, `unknown`, `unavailable` |
| `library.playlist.create` | `library:write` | `ready`, `unavailable` |
| `library.playlists.list` | `library:read` | `ready`, `unavailable` |
| `library.hotAlbums.list` | `listen:read` | `ready`, `unavailable` |
| `listen.events.append` | `listen:write` | `ready`, `invalid`, `conflict`, `unavailable` |
| `listen.history.list` | `listen:read` | `ready`, `unavailable` |
| `matching.evaluate` | `library:read` | `ready`, `unavailable` |
| `matching.override.set` | `library:write` | `succeeded`, `unknown`, `unavailable` |
| `matching.override.remove` | `library:write` | `succeeded`, `unknown`, `unavailable` |
| `plugin.config.set` | `account:admin` | `succeeded`, `unknown`, `unavailable` |
| `plugin.config.remove` | `account:admin` | `succeeded`, `unknown`, `unavailable` |

Exact payload and value shapes are in `contracts/generated/pyxis.ts`. This document explains
the parts a type cannot tell you.

## Result sizes

There is no pagination anywhere in v2. Two calls need care:

| Call | Behaviour |
|---|---|
| `listen.history.list` | `limit` defaults to 100 and is capped at 1000. Exceeding the cap silently clamps, so a client computing statistics must not assume it received everything |
| `library.albums.list` | Returns every album with every track, unpaginated. A real library of a few hundred albums is a single large response |

Fetch the library once and keep it, rather than polling it. Realtime carries the changes.

## System and plugins

`system.status.get` is the discovery call. `pluginCount` and `capabilities` exist because
the core runs with zero plugins installed, so a client must ask rather than assume.

`plugin.list` reports each plugin's `status`, which is operational rather than cosmetic:

| Status | Meaning |
|---|---|
| `starting` | Handshake in progress |
| `live` | Serving calls |
| `restarting` | Crashed once, coming back |
| `refused` | Handshake rejected, usually a protocol mismatch |
| `quarantined` | Crashed repeatedly and will not be restarted again |
| `stopped` | Shut down |

`configured` says whether the plugin has account-scoped credentials. A source plugin can be
`live` and unconfigured, which is exactly the state before someone enters a password.

## Library

A library album is curation, not a copy of a source. `library.album.add` takes the album's
identity plus a `sourceReference`, and adding the same source reference twice returns the
same album rather than creating a duplicate. That makes the call safe to retry, which is
what an offline queue needs.

Albums carry a `placement`, which is the core organising idea:

| Placement | Means |
|---|---|
| `discovery` | New, unfiled |
| `collection` | Kept |
| `archive` | Kept but out of the way |
| `dismissed` | Explicitly not wanted |

`library.album.command.run` carries a command union: `placement.set` moves an album and
bumps its `revision`. The `remove` command deletes the library rows. **Removing an album never deletes
listen events.** History is a record of what happened, not a view of what you currently own.

Every album carries a monotonic `revision`. Use it to reject stale writes and stale
realtime frames rather than trusting arrival order.

## Sessions

A session is device-hosted. The device that renders audio owns transport truth, and the
server never guesses on its behalf.

`session.list` answers the console question by default: sessions you can send a command to
right now. Pass `includeUnreachable: true` for the durable question of which sessions
exist. `reachable` means one specific thing. The host is holding a live realtime socket.
It is never persisted, so a crashed or sleeping host cannot leave a session looking
controllable.

Two operations look similar and are not:

| Operation | Who calls it | Meaning |
|---|---|---|
| `session.command.run` | The host, about itself | Apply this to my playback |
| `session.command.send` | A console, about another device | Ask that device to do this |

`session.command.run` from a non-host answers `notHost`. `session.command.send` answers
`dispatched`, never `applied`, because the core only routed it. The resulting state arrives
as a realtime event once the host has applied it.

`session.command.send` refuses `position.report` and `transport.trackEnded` with `hostOnly`.
Those are reports about what audio actually did, and only the host can make them truthfully.

An absent host is `unreachable` and the command is dropped, not queued. A command applied
minutes later is not what the person pressing the button meant.

`session.handoff` moves queue, cursor, position, and transport intent to another session in
one commit and leaves the source idle. Volume does not move, because volume belongs to the
speaker rather than the music. Both hosts must be connected, and a target that already
holds a queue is refused with `targetBusy` rather than being overwritten.

## Listening history

`listen.events.append` is append-only and idempotent by event `id`. Replaying a batch after
a reconnect is safe and is the intended offline path. Reusing an id for *different* content
answers `conflict`, which catches a client generating colliding ids rather than silently
accepting a lie.

`listen.history.list` returns 100 events unless `limit` says otherwise, and never more than
1000.

`library.hotAlbums.list` is a projection over history, rebuildable at any time. Treat it as
derived, never as a source of truth.

## Matching

`matching.evaluate` scores whether two tracks are the same recording and returns a decision
plus a component breakdown. It never merges anything by itself.

`matching.override.set` records a human decision, `merge` or `split`, that outranks the
score permanently, including after the underlying metadata changes. This exists because an
automatic scorer will be wrong occasionally and a person must be able to end the argument.

## Plugin configuration

`plugin.config.set` stores account-scoped credentials encrypted with XChaCha20-Poly1305.
**No operation ever returns plugin configuration.** There is no read call, by design. A
client can know that a plugin is `configured`, and nothing more.
