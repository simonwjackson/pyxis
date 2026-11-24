# Pyxis Vision

> A personal music system that solves the paradox of growing collections: the more music you have, the harder it becomes to engage with it.

## Core Problem

Music platforms solve discovery but not ownership. Personal libraries solve ownership but become graveyards. As a collection grows, choice paralysis sets in, gems get buried, and most of what you once loved quietly disappears into an ever-growing, undifferentiated list.

Pyxis bridges this gap. It aggregates music from multiple streaming backends into a single catalog, tracks your actual listening behavior, and exposes tags and raw listen history for external tools to organize it.

## Design Principles

1. **Listening history is truth** -- No star ratings. What you actually play, how often, and when is more honest than any explicit preference. External tools derive insight from behavior.

2. **Progressive disclosure** -- Never dump everything at once. The UI reveals what's relevant in context. The inbox stays small. The library stays navigable. Information is earned through interaction, not presented as a wall.

3. **Albums are the unit of art** -- Tracks are entry points and discovery hooks, but the destination is always the album. When you capture a track from a station, what you're really saying is "I need to investigate this album." The system stores, displays, and thinks in albums.

4. **Stations are discovery engines** -- Stations (Pandora, YouTube Music radio) exist purely for finding new music. They are never mixed with library playback in the UI. Discovery and collection are separate mental modes with separate interfaces.

5. **The system owns the library; devices own their playback** -- Pyxis is the single source of truth for your library, listening history, tags, and identity. Playback is different. A session is hosted by the device that actually renders audio, so a device keeps playing when the network drops. Speakers are just another session host, run by the server on their behalf.

6. **Any device can drive any other** -- A device can act as a console: it shows you what another device is playing and controls it. Controlling and rendering are separate jobs, and a device can do either or both.

7. **Sources are replaceable parts** -- Pandora, YouTube Music, and everything after them are plugins, not core features. Pyxis with nothing installed is still Pyxis: your library, your history, your tags, your journal. A source adds reach, not identity. Anyone can write one.

8. **Offline is not a degraded mode** -- Your library, your queue, your history, and anything you have pinned all work with no network. Reconnecting merges what happened while you were gone. It never overwrites it.

9. **Fidelity improves quietly** -- When a better copy of something you already own can be found, the system fetches it and starts using it. This never appears as a task, a queue, a notification, or a screen. You simply end up with better audio than you started with.

## Accounts

Pyxis hosts multiple accounts. Each account has its own library, history, tags, sessions, settings, and source credentials. Nothing is shared between them.

An account named `default` exists from first boot with no setup. On a single-account install, Pyxis behaves exactly like a personal system with no login. Accounts only become visible once a second one exists.

## Library Organization

Albums enter Pyxis only through explicit add. New albums have no default placement or tags.
Album tags are the organization primitive. An external tool owns Discovery, triage,
grouping, suppression and all other processing policy. Pyxis stores no placements or fixed
buckets. The one stored view is a **shelf**: a named, account-owned album query over tags
(AND, OR, NOT) with a sort order. A shelf filters on primitives; it carries no policy.

### Discovery and Hot

Discovery workflows and hot-album signals happen outside Pyxis over tags and raw listen
history. They do not control core fidelity upgrades, offline pinning or cache retention.
Existing placements are preserved once as `placement:<name>` tags; these are ordinary tags,
not hidden policy.

## Listening History

Pyxis maintains a complete listening journal -- every track, album, station session, and discovery capture, with timestamps and context.

### What Gets Logged

- Every track play (source, timestamp, duration listened, context: station vs. album vs. queue)
- Every station session (which station, how long, what was captured)
- Device and location metadata (when available, configurable)

### External History Uses

- **Time travel**: "What was I listening to two years ago in mid-June?" Always answerable.
- **Neglect detection**: Surface tagged albums that haven't been played in a configurable window.
- **Completeness tracking**: Know whether you've listened to a full album or just the singles.
- **Pattern awareness**: Understand your own listening habits over time.
- **Hot detection**: Identify albums entering heavy rotation before you consciously notice.

### External History UX

Visual timeline. Scrollable, browsable, searchable. Not a spreadsheet of plays -- a journal you'd want to revisit.

Stats exist but serve insight, not vanity. The goal is to learn something about your listening, not to gamify it.

## Weekly Mix

Recommendation mixes and their scheduling, selection and familiarity rules belong to an
external tool. Pyxis supplies source stations, tags, listen history and simple playlists.

## Browse

> **Status:** Not in the first release. Charts, moods, genres and source playlists become discovery tools beside stations, under the same declared-support rules. The space stays unnamed in the contract until it is built.

## Cross-Source Identity

Albums and artists are resolved across sources. A Radiohead album found on Pandora, YouTube Music, and Bandcamp is one album in Pyxis, with multiple source references.

- **Auto-merge**: The system automatically matches albums by title/artist similarity and merges them.
- **Undo**: Mismatches can be manually split. This is critical because automated matching will get it wrong sometimes.
- **Playback choice**: A merged album has several playable copies. The system ranks them by audio quality first -- lossless above lossy, then bitrate, then sample rate -- and uses source priority only to break ties between copies of equal quality. A local copy wins over a remote one of the same quality. This is what lets a background fidelity upgrade take effect without touching the album itself.

## Enrichment

> **Status:** Not in the first release. Enrichment becomes a plugin class of its own, and no enricher ships initially. Discovery works without it; albums simply carry less context until an enricher is installed.

Every album in the system gets background enrichment from metadata sources (MusicBrainz, Discogs, Deezer, and future sources). Enrichment is full and upfront -- the data is always complete. The UI decides what to surface and when (progressive disclosure).

### Enrichment Data

- **Editorial context**: Genre, style, mood, themes
- **Artist narrative**: Biography, discography context, where this album fits in the artist's arc
- **Musical connections**: Related artists, similar albums, influences
- **Reviews & reception**: Critical reception, cultural context

### Enrichment Strategy

Layered approach:
1. Core metadata (title, artist, year, artwork) -- immediate
2. Genre and style tags -- from MusicBrainz/Discogs
3. Extended context (reviews, narrative) -- background enrichment jobs

## Audio & Playback

### Proxy When Connected, Local When Not

When a device is online, audio streams through Pyxis. The server resolves the best available copy, fetches it, and caches it, so a source change or a quality upgrade never becomes the client's problem.

- Browser playback: through the Pyxis stream proxy
- Speakers and external targets: Pyxis proxies audio to the target
- Pinned content, offline: played from the device's own local copy, with no server involved

The offline case is the one exception to "always proxy", and it is deliberate. A device that cannot reach the server still plays everything you pinned.

### Caching Strategy

Devices explicitly pin albums for offline use. Storage pressure and active playback govern
retention. Organization tags and external listening signals impose no core cache policy.

### Lean-Back Mode

When you just want music without decisions:
- Continue from where the last session left off, on this device
- If another device is mid-session, offer to take it over rather than starting a second one

### Fidelity Upgrades

A track can have several playable copies: one from each source that has it, plus any local file the system has acquired. Pyxis always plays the best one it has.

Background acquisition looks for better copies of tracks already in your library and adds them as new options. Nothing about this is user-facing. There is no download screen, no progress bar, and no setting to tend. An album you added a year ago at 128kbps may simply be lossless the next time you play it.

This is strictly an upgrade path for music you already chose. It is not a way to acquire music, and it never appears as a source you can search.

## Technical Architecture

Implementation detail belongs in the plan, not here. This section states what the shape must guarantee. How it is built lives in `work/items/active/20260821123211-pyxis-v2-rewrite/plan.md`, and the previous version of this section went stale precisely because it duplicated implementation choices.

### Shape

An always-on service owns accounts, library, listening history, cross-source identity, media candidates, sessions, and sync. Every music provider is a separate plugin that the service talks to over a documented protocol. Clients keep a local copy of the library and sync against the service.

### What the shape must guarantee

- The service runs and serves with zero plugins installed.
- A plugin can be written, installed, and removed without changing the service.
- A device can play, queue, and log listens with no network, then reconcile.
- Any device can control another device's session.
- The API is the product. The first-party client gets no privileged access that a third-party client cannot have.
- Multiple accounts, with `default` working out of the box.

### State Model

One source of truth per account. Library state follows you across devices:
- Album tags and bookmarks
- Listening journal, recorded as an append-only history that merges cleanly from any device
- Media copies known for each track, and which is currently best

Playback state is deliberately not in that list. A session belongs to the device hosting it, and moving music between devices is something you ask for, not something that happens to you.

### Configuration

YAML config file for service-level settings, with per-account behavioral settings stored per account and editable from the settings page. All behavioral parameters are configurable:
- Enrichment source priorities
- Source priority order, used to break ties between copies of equal audio quality
- Fidelity target, and how hard to work to reach it
- Logging level

### Plugins

Plugins come in classes. A plugin declares which classes it implements when it connects.

| Class | What it contributes | Visible to you |
|---|---|---|
| Source | Search, albums, playlists, stations, streaming | Yes |
| Output | Playback targets such as speakers | Yes |
| Provider | Background media acquisition | No, by design |
| Enricher | Metadata, context, reviews | Indirectly |

Planned plugins:

| Plugin | Class | First release |
|---|---|---|
| Pandora | Source | Yes |
| YouTube Music | Source | Yes |
| Sonos | Output | Yes |
| Soulseek | Provider | Yes, invisible |
| Bandcamp, SoundCloud | Source | Later |
| MusicBrainz, Discogs, Deezer | Enricher | Later |

Anything listed as later is aspirational. The plugin protocol supports it; those plugins ship when they ship, and the service does not wait for them.

### Clients

The web client is an installable app that holds its own copy of the library and works offline. Its data layer is separate from its appearance: local storage, sync, conflict handling, and downloads sit behind one internal API, and the interface is built on top of that.

That separation is the point. The interface can be redesigned, or replaced entirely, without touching correctness. Design requirements that hold regardless:

- Responsive, mobile-first, usable on any screen size
- Progressive disclosure throughout -- no data dumps
- Every state the data layer can be in has a designed appearance, including offline, syncing, conflicted, and "no sources installed"

## What Pyxis Is Not

- **Not a social platform**: No sharing, no friends, no public profiles. This is a personal system.
- Not a playlist manager: playlists exist as a simple primitive, a named list of tracks, but albums are the unit and external tools organize the library over tags. No surface promotes playlists or makes them the hub. Stations and source playlists are discovery tools.
- **Not a music acquisition tool**: Background fidelity upgrades improve copies of music you already chose. There is no search, browse, or download surface for acquiring new music that way, and there never will be.
- **Not a recommendation engine**: Pyxis uses upstream algorithms (Pandora, YouTube Music) for discovery. It doesn't build its own recommendation model (though the architecture leaves room for a hybrid approach in the future).
- **Not a music player**: Pyxis is a music *system*. The player is one interface into it. The API is the primary contract; the web UI is one client.
