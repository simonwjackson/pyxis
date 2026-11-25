# Operations

Every operation in `pyxis-rpc-v4`. Unknown tags are rejected with
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
| `account.settings.get` | `account:read` | `ready`, `unavailable` |
| `account.settings.set` | `account:admin` | `ready`, `conflict`, `invalid`, `unavailable` |
| `plugin.list` | `account:read` | `ready`, `unavailable` |
| `output.targets.list` | `session:read` | `ready`, `unavailable` |
| `output.session.create` | `session:control` | `ready`, `unknownTarget`, `unavailable` |
| `output.group.set` | `session:control` | `ready`, `unavailable` |
| `session.create` | `session:control` | `ready`, `notDevice`, `unavailable` |
| `session.retire` | `session:control` | `retired`, `stopRequested`, `unknownSession`, `unreachable`, `busy`, `unavailable` |
| `session.list` | `session:read` | `ready`, `unavailable` |
| `session.state.get` | `session:read` | `ready`, `unknown`, `unavailable` |
| `session.command.run` | `session:control` | `applied`, `unknownSession`, `notHost`, `notDevice`, `rejected`, `unavailable` |
| `session.command.send` | `session:control` | `dispatched`, `unknownSession`, `unreachable`, `busy`, `hostOnly`, `unavailable` |
| `session.handoff` | `session:control` | `ready`, `unknownSession`, `unknownTarget`, `sourceUnreachable`, `targetUnreachable`, `targetBusy`, `sameSession`, `outputUnsupported`, `unavailable` |
| `source.search.run` | `source:read` | `ready`, `noSources`, `invalid`, `unavailable` |
| `source.search.suggest` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.artist.discography` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.playlist.tracks` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.track.details` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.track.lyrics` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.track.credits` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.track.related` | `source:read` | `ready`, `unsupported`, `invalid`, `unavailable` |
| `source.album.search` | `source:read` | `ready`, `unavailable` |
| `source.album.get` | `source:read` | `ready`, `unavailable` |
| `library.album.add` | `library:write` | `ready`, `invalid`, `unavailable` |
| `library.tracks.get` | `library:read` | `ready`, `invalid`, `unavailable` |
| `library.albums.query` | `library:read` | `ready`, `invalid`, `unavailable` |
| `library.shelf.save` | `library:write` | `ready`, `unknown`, `invalid`, `conflict`, `unavailable` |
| `library.shelf.remove` | `library:write` | `removed`, `unknown`, `conflict`, `unavailable` |
| `library.shelves.list` | `library:read` | `ready`, `unavailable` |
| `library.shelf.albums.list` | `library:read` | `ready`, `unknown`, `invalid`, `unavailable` |
| `library.albums.list` | `library:read` | `ready`, `unavailable` |
| `library.album.command.run` | `library:write` | `applied`, `removed`, `unknown`, `unavailable` |
| `library.bookmarks.list` | `library:read` | `ready`, `unavailable` |
| `library.bookmark.command.run` | `library:write` | `added`, `removed`, `unknown`, `unavailable` |
| `library.playlist.create` | `library:write` | `ready`, `unavailable` |
| `library.playlists.list` | `library:read` | `ready`, `unavailable` |
| `library.playlist.tracks.add` | `library:write` | `applied`, `unknownPlaylist`, `rejected`, `unavailable` |
| `listen.events.append` | `listen:write` | `ready`, `invalid`, `conflict`, `unavailable` |
| `listen.history.list` | `listen:read` | `ready`, `unavailable` |
| `listen.journal.list` | `listen:read` | `ready`, `invalid`, `unavailable` |
| `matching.evaluate` | `library:read` | `ready`, `unavailable` |
| `matching.override.set` | `library:write` | `succeeded`, `unknown`, `unavailable` |
| `matching.override.remove` | `library:write` | `succeeded`, `unknown`, `unavailable` |
| `plugin.config.set` | `account:admin` | `succeeded`, `unknown`, `unavailable` |
| `plugin.config.remove` | `account:admin` | `succeeded`, `unknown`, `unavailable` |

Exact payload and value shapes are in `contracts/generated/pyxis.ts`. This document explains
the parts a type cannot tell you.

## Session modes

`repeat.set {mode:"off"|"all"|"one"}` and `shuffle.set {enabled:boolean}` are session
commands. Every session publishes `repeat` and `shuffle`; `queueOrder` carries original
ordinals in effective queue order. Omitted order means sequential ordinals for an
unshuffled snapshot. Clients must preserve these fields when storing or handing off state.
A shuffled snapshot must carry its occurrence order. Do not identify queue occurrences by
track ID: intentionally duplicated tracks are distinct entries.

Shuffle affects the future suffix and preserves current occurrence, position and duration.
Disable it to restore ascending original ordinals, including queue additions/removals.
Core and worker share the same session-seeded permutation so offline replay agrees.
Repeat-one restarts at natural end, all advances/wraps, off ends. Explicit cursor jumps
ignore repeat-one. Clear retains modes. Handoff moves modes and occurrence order.
The removed one-shot shuffle operation is not accepted by wire v4. Pending current-v2
intent is retained with an explicit update blocker, never translated or silently dropped.
See [update handling](../operations/2026-10-24-pyxamp-support-update.md).

## Absolute seek

`transport.seek {positionMs}` is a session command, not a position report. Position is an
integer within 0..known duration (and the wire's u32 bound). Missing track, missing/zero
duration, wrong host and renderer refusal do not produce an applied state. The core checks
that the current track exists in the account. The shared browser host waits for native
`seeked`, confirms position, then stores the command/receipt; failure restores prior truth.
Seek directives carry `expectedRevision` so a delayed command cannot scrub a newer session.
Replay receipts skip renderer effects. Worker optimistic application validates the same bounds.

The core-hosted output adapter seeks the owned stream, reads renderer position, and publishes
that confirmed position only after it matches within 1000 ms (Sonos whole-second resolution).
A failed confirmation attempts an ownership-checked rollback. Rollback failure is explicit
`output.rollbackFailed`. No physical Sonos operation was used to test this behavior.

## Source paging

`source.search.run {query, limit?}` searches all live sources. A source that has more
results for a kind contributes a `{pluginId, kind, cursor}` descriptor to `pages`.
Send one descriptor as `page` with the same query to read just that source and kind.
No descriptor means the source offered no continuation for that kind.

Search and station cursors last 30 minutes and survive a core restart with the same
`credentials.key`. A changed account, source, query or key invalidates the cursor.
On `invalid` (search) or `unknownStation` (station batch), start again without it.
Treat cursors as opaque strings; they can be several kilobytes long. If a sealed
cursor and its query exceed the resume request budget, the core returns `unavailable`
for the page rather than publishing an unusable cursor or reporting exhaustion.

## Album queries

`library.albums.query` accepts optional `text` (substring of title or artist), `artist`
(exact name), `tagExpression`, `sort`, `limit` (1–100, default 50) and `cursor`. Filters
combine with AND. Text and artist comparisons ignore case and outer whitespace. `added`
(default) and `lastPlayed` are newest first, unplayed last. `lastPlayed` uses track listens
with the album ID, or the track's current album membership if the listen omitted the ID.
`artist` and `title` sort case-insensitively A–Z; album ID breaks ties.

For example, to find live jazz but not compilations:

```json
{"tagExpression":{"op":"and","value":[{"op":"tag","value":"live"},{"op":"tag","value":"jazz"},{"op":"not","value":{"op":"tag","value":"compilation"}}]},"sort":"artist"}
```

`and` and `or` require a nonempty array. `not` has one operand. `tag` uses the same
normalization and limits as `tags.set`. The whole expression must be valid (at most
16 levels and 256 nodes). Each page contains `albums` and an optional continuation
`cursor`. Continue with just `{cursor,limit?}`: the snapshot, including metadata, does
not change between pages. Filters/sort cannot be changed with a cursor. Cursors belong
to one account. They carry the compressed remaining albums and expire 30 minutes after
page one. They survive a restart with the same `credentials.key`. On an invalid or expired
cursor, start a new query. If the remaining albums exceed 32 MiB before compression or the
cursor cannot fit in a 1 MiB RPC request, the query returns `invalid`. Narrow the filters
or increase the page size.

## Shelves

A shelf saves one tag expression and sort for one account. To create one, send
`library.shelf.save {name,tagExpression,sort}`. Its `ready` value includes the new `id`
and revision 1. Names need 1–128 characters after trimming, with no control characters.
To replace it, send all three fields plus `shelfId` and `expectedRevision`. Each successful
replacement increments the revision. Remove with `library.shelf.remove {shelfId,expectedRevision}`.
For both writes, `conflict` carries the current revision and changes nothing. Missing and
foreign IDs both return `unknown`.

`library.shelves.list {}` returns the account's definitions sorted by name, then ID.
`library.shelf.albums.list {shelfId,limit?,cursor?}` uses the same page shape, limits and
ordering as `library.albums.query`. Each first page evaluates the current shelf on current
albums; continuations retain their snapshot and belong only to that shelf. Deleting the
shelf ends access to its continuations. Shelves are online only, not an offline sync domain.

## Album tags and external organization

`tags.set {tags:string[]}` uses `library.album.command.run`. At most 64 labels, each
1–64 characters after trim/lowercase; control characters are refused. Tags are sorted and
deduplicated. An identical set is a no-op. Tags persist, revise and fan out with album state.
Organization and processing policy belong to external tools over tags and raw listen history.
Pyxis exposes no placements, groups, hot-album projection or organization settings.

On the first v4 store open, existing album placements become `placement:discovery`,
`placement:collection`, `placement:archive` or `placement:dismissed` tags. Existing tags stay.
Each converted album advances one revision. Conversion removes the old keys atomically;
reopening cannot restore a converted tag that someone later removes. Preservation can produce
65 tags on an album that already had 64; `tags.set` retains its existing 64-label input limit.
New albums start with no tags and have no default organization.

## Playlist append

`library.playlist.tracks.add` takes `{playlistId, trackIds, commandId}`. It accepts
1–1000 account-owned tracks and a nonempty command ID of at most 128 characters.
Ordered duplicates are preserved. The account-scoped command ID binds both playlist
and track IDs. An identical retry returns the original playlist outcome. Different
content returns `library.commandIdConflict`. The receipt and revision commit together.
A new command ID deliberately appends again. Create/list keep their existing contracts.

## Result sizes

Use these bounds when reading large collections:

| Call | Behaviour |
|---|---|
| `listen.journal.list` | `limit` defaults to 100 and is capped at 1000. Follow the page’s `nextCursor` until absent to read the full range |
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

`library.tracks.get {trackIds}` accepts 0–200 IDs, counting duplicates. `tracks` and
`misses` each preserve request order and duplicates. Foreign IDs look unknown. Station
and search metadata is retained at candidate registration, not fetched on read. An older
candidate without metadata is a miss until rediscovered. `albumId` is a core library ID,
never a provider ID; it is absent without a library relationship. `albumTitle` and
`durationMs` are omitted when unknown. If several albums contain a track, the lowest
album ID wins.

A library album is curation, not a copy of a source. `library.album.add` takes the album's
identity, optional `artworkUrl`, tracks, and a `sourceReference`. Library track responses
use the album artwork as their media cover. Adding the same source reference twice returns
the same album and fills missing artwork instead of creating a duplicate. That makes the call safe to retry,
which is what an offline queue needs.

`library.album.command.run` carries a command union. `tags.set` replaces album tags and
bumps its revision when changed. `artwork.refresh` reloads album metadata through the stored
source reference and fills the album and track artwork. `remove` deletes the library rows.
**Removing an album never deletes listen events.** History is a record of what happened,
not a view of what you currently own.

Run `tools/backfill-library-artwork --url <origin>` to apply `artwork.refresh` to every
album that lacks artwork. The tool keeps one token file per server under
`$XDG_STATE_HOME/pyxis`; set `PYXIS_BEARER_TOKEN` to supply another. Use `--dry-run` to
list the matching album ids without writing.

Every album carries a monotonic `revision`. Use it to reject stale writes and stale
realtime frames rather than trusting arrival order.

## Outputs

`output.targets.list` invokes one installed output plugin's discovery operation and returns
its current groups and rooms. Discovery also refreshes output-session reachability; a room
is controllable only while the plugin can currently find it.

`output.group.set` applies a complete desired group and returns converged topology.
An operator-supplied shell served via `--web-root` can call it like any other client.
A successful regroup stops and detaches your sessions whose room moves under another
coordinator. Each detached session keeps its queue, becomes unreachable and publishes one
session state without `output`. A room becoming standalone keeps its own session. A group
that holds another account's session still refuses with `output.groupBusy`. A plugin failure
does not stop or detach a session. An unconfirmed topology returns `output.groupNotConverged` without releasing any session.

`output.session.create` creates a core-hosted session bound to one discovered target. Its
`hostDeviceId` is an opaque output host identity and `output` identifies the plugin/target.
Existing `session.command.send` operations then control it. The core serializes commands per
output session, previews and reserves each command, performs the speaker effect, and only then
persists and publishes session truth. If persistence fails after a physical effect, it restores
the previous speaker state before reporting failure.

When another app has loaded the speaker, the output session reads as stopped, and Pause, Seek,
Stop and Volume refuse with `output.rendererOwnershipLost`. Play is the explicit takeover: it
replaces the other stream with the session's current track. The core never takes a speaker
over on its own, for example when a track ends. Each background refresh also copies the
renderer's volume into the session, so a change made on the speaker shows up in Pyxis.

Output Play mints a sealed, track-bound, six-hour stream token and supplies an
absolute URL rooted at `PYXIS_LAN_BASE_URL`. This lets a speaker fetch `/stream/:trackId`
without receiving an account bearer. The token authorizes only the selected track, candidate and format.
It survives a core restart with the same `credentials.key`. Rotating that key invalidates it.

## Sessions

A session is device-hosted or core-hosted through an output plugin. A rendering device owns
its transport truth; the core owns output-session truth only after the plugin confirms the
speaker effect. Device handoff refuses output sessions with `outputUnsupported`; moving between
browser and speaker hosts requires explicit output-session queue commands rather than silently
skipping physical effects.

`session.list` answers the console question by default: sessions you can send a command to
right now. Pass `includeUnreachable: true` for the durable question of which sessions
exist. `reachable` means one specific thing. The host is holding a live realtime socket.
It is never persisted, so a crashed or sleeping host cannot leave a session looking
controllable. List order is unspecified and can change after a session update. Keep selection
by session ID and sort a copy when the display needs a stable order.

`session.retire {sessionId}` removes a session on the caller's account. The host or a console
with `session:control` on the owning account can retire it. Another account gets `unknownSession`.
A `retired` session is absent even with `includeUnreachable:true`. If a device is playing
or paused, `stopRequested` means the core delivered `transport.stop`; the session stays live
until the host confirms Stop through `session.command.run` with the directive id as `commandId`.
`unreachable` and `busy` are not success: retry retirement when the host can accept Stop.
For a playing or paused output the core stops the renderer first. A failed Stop retains the session.

The first sweep runs one hour after startup so hosts have time to reconnect. Sweeps then run
hourly. A device session expires if its host is unreachable and its `updatedAt` is strictly
older than 30 days, regardless of transport or queue contents. Output sessions and sessions
with a pending volume restore do not expire. Both kinds of retirement publish `session.retired` on the `sessions` topic to sockets
that opted in with `sessionRetirements:true` at hello. Other sessions subscribers must
refetch their session list (see [realtime](realtime.md)).

Two operations look similar and are not:

| Operation | Who calls it | Meaning |
|---|---|---|
| `session.command.run` | The host, about itself | Apply this to my playback |
| `session.command.send` | A console, about another device | Ask that device to do this |

`session.command.run` from a non-host answers `notHost`. `session.command.send` answers
`dispatched`, never `applied`, because the core only routed it. The resulting state arrives
as a realtime event once the host has applied it.

A host can include a 1-to-128-character `commandId` in `session.command.run`. The core stores
a separate durable receipt with the command content. Repeating the same pair returns the
current session without applying the command again. Reusing the ID for different content
returns `rejected`. Offline clients must use their outbox command ID here, especially for
`queue.add`.

A console can include `commandId` in `session.command.send`. The core copies it to the
resulting directive as `directiveId`. A retry therefore reaches the host with the same ID,
which lets both the host and `session.command.run` deduplicate it.

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
1000. Its request and track-only array response are unchanged.

`listen.journal.list` returns `{events, nextCursor?}`. Each event is `{kind,event}`.
The optional `kinds` array selects kinds, and an empty array matches none.
`limit` defaults to 100 and is clamped to 1–1000. Optional RFC3339 `from` (inclusive) and `to` (exclusive) restrict the time range.
Events sort by instant then event id, both descending. If more events match, the page has `nextCursor`. Pass it as `cursor` with the same bounds. Treat it as opaque.
New appends ahead of the cursor do not shift subsequent pages. Unknown cursors and
malformed times answer `invalid`.

External tools can derive listening signals from this raw history. Pyxis computes no hot-album projection.

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

### Session sleep timer

Use `session.command.send` with `sleep.set` and exactly one of `at` (an RFC 3339 time
with offset) or `minutes` (a positive integer). Optional `fadeSeconds` is an unsigned
integer, default zero. A past deadline is rejected. Example:

```json
{"_tag":"session.command.send","payload":{"sessionId":"…","command":{"_tag":"sleep.set","payload":{"minutes":30,"fadeSeconds":15}}}}
```

Read `sleepTimer: {id, deadline, fadeSeconds}` on session snapshots and realtime updates.
A new set replaces the timer; `sleep.cancel {}` removes it. Neither command stops playback.
The core persists the absolute deadline. On an output it steps the renderer volume down,
stops, then restores the pre-fade volume. Device hosts observe the same deadline locally.
At expiry the core also sends `transport.stop {sleepTimerId: id}` to the host until it
reports Stop. Both paths use command ID `sleep:<id>` and must not act on a different
timer. Ordinary `transport.stop {}` also disarms the timer.

A device host can use the DOM-independent `sleepSchedule(session, nowMs)` exported by
`clients/app/src/worker/sleep-schedule.ts`. Call it on each cached session update and on
wake. Replace the previous fade/cutoff with the new schedule; `disarmed` cancels both
and restores normal gain. `armed` gives the gain, fade-start delay and time left in ms.
At `stop`, verify that the latest timer ID still matches, stop playback, restore volume,
and report the returned command with its `sleep:<id>` receipt. The offline report and
the backstop use the same receipt. See the worker README for the host integration steps.

### Journal event shapes

`listen.events.append.events` accepts the original track-play input or a tagged journal row (the same union that `listen.journal.list` returns):

```json
{"kind":"stationSession","event":{"id":"01M0K000000000000000000001","deviceId":"phone","sourcePluginId":"radio","stationId":"jazz","sessionId":"desk","startedAt":"2026-02-02T12:00:00Z","endedAt":"2026-02-02T12:30:00Z"}}
{"kind":"capture","event":{"id":"01M0K000000000000000000002","deviceId":"phone","albumId":"album","capturedAt":"2026-02-02T12:05:00Z","entryContext":{"origin":"stationTrack","trackId":"track"}}}
```

Omit `endedAt` if the end is unknown. An open event is not later overwritten. Journal rows sort by `listenedAt`, `startedAt`, or `capturedAt` respectively.
Track-only `listen.history.list` never includes these new rows. `library.album.add` accepts optional `entryContext` with
`origin` (`stationTrack`, `search`, or `other`) and optional `trackId`. With context it commits a
capture alongside the add, including re-adds. Without context it emits no event. A token-authenticated album add records the token as
the audit actor and omits `deviceId` from its capture.

### Account settings

`account.settings.get {}` returns `{revision, sourcePriority}` for the authenticated account.
The default is `{revision:0, sourcePriority:[]}`. `account.settings.set {expectedRevision,
sourcePriority}` replaces the order and returns the next revision. `conflict` carries the
current settings. List up to 256 distinct nonempty plugin ids (at most 256 bytes each), best
first. Unknown ids persist. Priority applies immediately to existing candidates, after audio
quality and locality; unlisted sources rank last.
