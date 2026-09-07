# Raziel's non-album YouTube Music capabilities and a Pyxis conversion

## Conclusion

Raziel contains useful discovery code, but not a complete recommendation or radio engine.
Its strongest reusable pieces are music-specific song search, artist search, and a parser
for the watch-next queue. The queue parser has no requesting client method or continuation loop.

For Pyxis, the first useful conversion is better music discovery with selected results entering
the existing playback pipeline. Continuous radio is a separate feature with substantial session
and queue work. Personalized mixes and arbitrary combinations of seeds require further research.

This is an assessment, not an approved implementation plan. No production configuration, playback,
service, or remote repository was changed. No upstream Music API request was issued. Public
third-party API documentation was read to distinguish broader opportunities from recovered code.

## Evidence and search scope

Both copies on `fuji` were inspected:

- `/home/simonwjackson/code/sandbox/raziel`
- `/home/simonwjackson/code/sandbox/raziel_1`

Both have HEAD `229045b40eccda9b287e2effdb823dd819fac2f7`, dated November 29, 2025.
Their seven YouTube Music source files are byte-identical. Existing local changes were left alone.
Paths prefixed with `R:` below refer to that revision under `packages/sources/src/ytmusic/`.

The historical audit followed the old `packages/metadata` path and daemon POC through renames.
Both repositories expose the same 43 commits when refs and reflogs are included. The original
client from `545967f` and current client have the same Git blob. A bounded scan examined 51 unique
YouTube-related source and Markdown blobs, plus named experiments and research metadata.

No multi-seed, mood-filtered, or multi-input playlist generator was located within that scope.
This does not establish that the user's earlier research never existed elsewhere. Unreachable
objects, expired history, other repositories, raw browser captures, and conversation archives
were not searched. Credentials, cookies, environment files and private session contents were
not read.

Pyxis integration references use commit `8b18328`. Concurrent work in other branches and the
untracked player client is outside this assessment.

## What Raziel actually contains

| Capability | Depth in Raziel | What it gives Pyxis | What is missing |
|---|---|---|---|
| Music-specific song search | Client method, request filter, parser, typed result, CLI demo | Search songs with video IDs, artists, album references, duration and artwork | Current response validation, pagination, bounded results and integration tests |
| Artist search | Client method, request filter, parser, typed result, CLI demo | Artist names, channel references and artwork as discovery entry points | Artist detail, top songs, related artists, artist-radio request and public artist contracts |
| Playlist search | A filter token in configuration only | A research starting point for playlist-specific search | Client method, playlist summary parser, paging and product integration |
| Watch-next queue | Implemented `parsePlaylistTracks`, without a caller | Extract ordered tracks from a known next-response layout | Request construction, seed arguments, continuation, failures and radio lifecycle |
| Song/artist/multi-seed radio | No generator found | The queue parser is relevant groundwork | The generator itself and its supported inputs |
| Mood/genre/charts/home discovery | No implementation found | Existing request wrapper offers a starting pattern | Endpoints, navigation references, section parsers and validation |
| Personalized mixes | No authenticated Music client found | No ready-to-port personalized feature | Authentication, private account caches, refresh and mix retrieval |

### Song search is the strongest immediate opportunity

`R:client.ts:79–84,165–176` defines and calls `searchSongs`. It submits a Music-specific filter
to `/youtubei/v1/search`. `R:parsers.ts:127–195` extracts the recording's video ID, artist and album
links, duration, and artwork. The parser selects `MUSIC_VIDEO_TYPE_ATV` entries. It does not provide
a complete music-video search implementation.

Pyxis currently uses yt-dlp's `ytsearchN:` for track search. That is general YouTube search,
with artist information falling back to uploader/channel fields. Adapting Raziel's Music search
would improve the type of results Pyxis requests. It does not guarantee perfect recording matches.
Keep general video search as an explicit capability if wanted, rather than silently mixing its
results with songs.

References: `plugins/ytmusic/src/index.ts:23–29`, `plugins/ytmusic/src/ytdlp.ts:87–118`.

### Artist search supplies a starting point, not an artist experience

`R:client.ts:191–202` and `R:parsers.ts:256–293` return artist name, `UC` reference and thumbnail.
They do not fetch artist pages or extract artist radio/shuffle endpoints. Those need a second
piece of work before an artist result can lead to top tracks or related music.

Raziel's ordinary source adapter calls only `searchAlbums`. The richer client is available through
`createYTMusicSourceWithClient`, but the adapter does not turn it into a user-facing discovery flow.
References: `R:source.ts:43–72,77–108`.

### The playlist parser is real, but it does not generate a playlist

`R:parsers.ts:295–413` traverses the watch-next music queue and reads video IDs, titles, durations,
artists, album links and thumbnails. It preserves repeated entries in the supplied queue.
No caller or `/next` request method was found in the client or available history.

It returns only tracks. It discards continuation information and does not distinguish a changed
response layout from an empty queue. It has no seed model, mood controls, discovery slider,
account personalization, or automatic refill behavior.

Do not confuse the unused MPREb-to-OLAK helper with radio generation. That helper converts an
album reference to its backing audio-playlist reference. Likewise, `SEARCH_PARAMS.playlist`
is a search filter, not a playlist creation operation.

## Broader opportunities, supported by external documentation

The following are documented by the independent `ytmusicapi` project, version 1.12.2.
They are not implemented Raziel features, Google-supported public API guarantees, or live
compatibility results from this audit.

| Starting input | Documented opportunity | Product value and boundary |
|---|---|---|
| Text query plus result type | Songs, artists, videos, playlists, community playlists and featured playlists | Different search modes instead of forcing everything into album results |
| Song/video ID | Watch queue and radio mode | A finite related-music batch, then continuous radio only after Pyxis adds refill |
| Playlist ID | Ordered playlist, optional suggestions and related playlists | Curated discovery and expansion around an existing collection of tracks |
| Playlist ID plus watch options | Watch queue, radio mode or playlist shuffle | Upstream-defined variants, not arbitrary combinations of controls |
| Artist/channel reference | Top songs, related artists, and returned radio/shuffle references | Artist-led discovery without choosing an album first |
| Mood or genre reference | Categories and category playlists | Browse Chill, Commute, a genre or a decade without typing a song |
| Country code | Charts and chart playlists | Regional discovery, with authentication-dependent detail |
| Account context | Home recommendations and personal content | Personalized discovery, subject to explicit authentication and privacy work |

The documented watch inputs are `videoId`, `playlistId`, `limit`, `radio`, and `shuffle`.
Shuffle requires a playlist and does not combine with radio mode. A returned artist radio
reference can be followed, but an artist ID is not automatically interchangeable with it.
Mood browsing supplies category references for another request. A mood label is not documented
as a free-form argument to the watch endpoint.

**Arbitrary multi-input generation remains unproven.** Nothing found establishes that we can send
several artists, a mood, a genre, exclusions and a familiarity setting in one supported request.
Three distinct products must not be conflated:

1. Follow an upstream song, artist or playlist radio reference.
2. Browse upstream mood/genre playlists.
3. Build a Pyxis-specific mix by combining and ranking several sources of recommendations.

The third requires Pyxis policy for weighting, repetition, exclusions and exhaustion. It is not
an honest substitute for claiming that the missing original multi-input API has been recovered.
Changing an upstream account's taste profile is also an account mutation, not a temporary radio seed.

Secondary opportunities include related-song sections, search suggestions, lyrics and credits.
They add discovery context, but do not solve playlist generation or continuous playback.

External references:

- [Search](https://ytmusicapi.readthedocs.io/en/stable/reference/search.html)
- [Watch queues and radio](https://ytmusicapi.readthedocs.io/en/stable/reference/watch.html)
- [Playlists, suggestions and related playlists](https://ytmusicapi.readthedocs.io/en/stable/reference/playlists.html)
- [Artists, home and related-song browsing](https://ytmusicapi.readthedocs.io/en/stable/reference/browsing.html)
- [Moods, genres and charts](https://ytmusicapi.readthedocs.io/en/stable/reference/explore.html)

## Conversion implications for Pyxis

### Reuse the existing playback and media path

Put the adapted Music API requests and parsers inside `plugins/ytmusic`. Keep yt-dlp for the
existing stream-resolution/fetch path. Do not replace working media delivery with Raziel's source
adapter: Raziel explicitly exposes neither metadata nor transfer through that adapter.

Pyxis already converts provider video IDs into account-scoped core track IDs and media candidates.
Its stream path supplies account configuration and requested formats back to the plugin. Those
pieces support songs and playlist entries without creating artificial albums.

References: `services/pyxis/src/source_catalog.rs:151–240,298–320,419–425`;
`services/pyxis/src/stream/mod.rs:357–382`.

### Add typed discovery operations, not an unrestricted plugin tunnel

The public source API currently exposes track search, album search and album detail. It has no
artist, provider-playlist, discovery-section or radio operation. Local playlist create/list records
are not a provider-playlist browser and do not carry provider continuations.

Define the first feature's public requests and outcomes in Rust, regenerate contracts, and connect
the catalog, plugin and client. Expose supported features so `source` does not falsely imply radio.
Pandora's plugin-only station methods reinforce this need: plugin code alone does not create an
app feature.

Keep provider references and continuation data opaque outside the plugin. Bind continuations to
account, source, request and generation. Bound their size and lifetime. Preserve playlist-entry
order and repeated tracks separately from the identity of each recording.

References: `services/pyxis/src/rpc/contract.rs:315–424,942–970,1470–1504`;
`packages/plugin-sdk/src/capabilities.ts:8–24,64–82`.

### Keep discovery separate from the saved library

Browsing a page, queueing a song, and saving an album are different actions. Discovery must not
silently fill the library or include every browsed page in full-library sync.

Existing search registers candidates for all returned results. Extending that behavior to endless
pages needs bounded registration and a retention policy. Playlist snapshots and linked remote
playlists also need an explicit choice about updates, removed tracks and offline availability.
Current album pinning does not automatically provide offline playlists or offline radio.

Soulseek remains library-only. Listening to radio must not silently enable speculative peer
downloads. The deferred Pyxis Weekly Mix also remains a separate product feature.

### Treat continuous radio as a session feature

Fetching a useful batch is the smaller part. The current browser end handler records a listen
and reports `transport.trackEnded`. The core state machine changes the transport to Ended without
advancing the queue. The inspected output reconciliation path likewise records physical state.
Do not assume that ordinary queue auto-advance or endless refill already exists.

A continuous implementation needs one refill owner per hosted session, bounded prefetch, batch
idempotency, next-track advancement, and explicit failure/exhaustion states. A late result must
not append to the wrong account or seed, replace a user's queue, or restart playback after Stop.
Clear, handoff, disconnect and account switches all need defined cancellation behavior.

The source plugin chooses recommendations. The browser host, or core for an output session,
keeps playback authority. Fetching recommendations must never itself issue Play.

A separate session-command acknowledgement race remains relevant: a later queue.add can become
invisible while its outbox entry survives. The album-placement fix `cac84b0` does not fix that path.
Resolve or contain this race before adding automatic queue mutations. The current plan records
it as `01M1Y7QS1QWPHXN5JY8P14RXRT`.

References: `clients/app/src/reference/App.tsx:1132–1162`;
`services/pyxis/src/sessions/mod.rs:825–869`;
`services/pyxis/src/rpc/dispatch.rs:1581–1602`;
`work/items/active/20260821123211-pyxis-v2-rewrite/plan.md:96–103`.

### Personalization adds an authentication product

Raziel sends a fixed anonymous WEB_REMIX context. Its config claims a logged-out client and has
no account authentication lifecycle. Current Pyxis Music handlers also do not consume account
credentials. A hardcoded `X-Goog-AuthUser` header is not a login implementation.

Personalized mixes need an explicitly supported upstream authentication method, encrypted
per-account configuration, refresh/revocation handling, and private cache separation. Do not assume
ordinary Google username/password fields are sufficient. Provider cookies or tokens must never
enter public results, shared caches, logs or other accounts' continuation state.

Reading recommendations and sending listening history, likes or taste changes upstream are
separate permissions. Keep account mutations out of the first read-only discovery release.

### Harden the recovered code instead of copying it unchanged

Raziel uses a 2024 WEB_REMIX client version, assumes particular renderer paths and returns empty
arrays for several unknown layouts. Its Zod declarations do not establish runtime validation in
these parser functions. Durations are seconds, while Pyxis expects bounded milliseconds.

Port the protocol knowledge and field mapping. Add current sanitized fixtures, malformed-layout
failures, missing/unavailable-track handling, cancellation and end-to-end request budgets.
Reconcile Raziel's rate limiting and exponential retries with the core's 30-second call deadline.
An unbounded fetch plus repeated backoff does not fit that deadline safely.

Do not transplant `@lull/types`, Raziel's source registry or Pyxis v1 IDs and RPC shapes. Keep the
Rust core source-agnostic, runnable without plugins, and keep media bytes off plugin stdio.

## Recommended sequence

| Slice | User-visible result | Relative scope and acceptance |
|---|---|---|
| 1. Music-specific song search | Search songs and queue them through existing Pyxis playback | Smallest adaptation. Validate Music results, format compatibility and invalid metadata without changing library ownership |
| 2. Public playlist discovery | Search/open public playlists and explicitly queue selections | Medium. Add typed summaries, pagination, item order, unavailable entries and repeated entries |
| 3. Finite song/artist radio batch | Request related tracks, inspect them and explicitly queue a bounded batch | Medium with upstream research. Validate actual request inputs and fresh responses before claiming radio |
| 4. Continuous radio | Advance tracks and refill while preserving user control | Largest correctness slice. Test Stop, clear, account change, handoff, disconnect, duplicates and failed refill for each host type |
| 5. Artist, mood and charts browsing | Explore beyond text search using reusable playlist/section contracts | Medium extension once references and pagination exist. Rank by product preference rather than treating this order as fixed |
| 6. Personalized mixes or custom multi-seed builder | Account-based discovery or a distinct Pyxis mix product | Separate research and design. Authentication and arbitrary input combinations are not recovered functionality |

These are relative scope judgments, not time estimates. Start with a small fixture/live-metadata
validation of the recovered song parser and watch response before committing to wider endpoints.
Physical speaker testing requires separate permission and was not performed for this assessment.

## Verification and retained artifacts

An offline probe imported the unchanged copied Raziel parsers. It verified song and artist
metadata, watch-queue metadata, preservation of repeated tracks, ignored continuation data,
and empty results for missing or unknown layouts. An initial fixture used the wrong property
name for the artist page configuration; correcting the fixture produced the recorded pass.
No Raziel source was changed. These synthetic cases do not validate today's upstream responses.

Local evidence is under `~/.local/state/pyxis-diagnostics/ytmusic-raziel-audit/`:
source copies and hashes for both repositories, historical and Pyxis integration reports,
`parser-probe.ts`, and `parser-probe-result.json`. Independent assessment review found no blockers.
`public-reference-excerpts.json` preserves brief excerpts and the observed documentation version.
The linked `/stable/` documentation pages can change after this September 7 inspection.

**Recommendation:** use Raziel to accelerate Music-specific search and queue parsing. Build a
small public discovery contract around those pieces. Treat continuous radio and personalized
multi-input mixing as explicit new product work, not a drop-in conversion.
