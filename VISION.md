# Pyxis Vision

> A personal music system that solves the paradox of growing collections: the more music you have, the harder it becomes to engage with it.

## Core Problem

Music platforms solve discovery but not ownership. Personal libraries solve ownership but become graveyards. As a collection grows, choice paralysis sets in, gems get buried, and most of what you once loved quietly disappears into an ever-growing, undifferentiated list.

Pyxis bridges this gap. It aggregates music from multiple streaming backends into a single catalog, tracks your actual listening behavior, and uses that signal to keep your relationship with your collection alive.

## Design Principles

1. **Listening history is truth** -- No star ratings. What you actually play, how often, and when is more honest than any explicit preference. The system derives insight from behavior, not declarations.

2. **Progressive disclosure** -- Never dump everything at once. The UI reveals what's relevant in context. The inbox stays small. The library stays navigable. Information is earned through interaction, not presented as a wall.

3. **Albums are the unit of art** -- Tracks are entry points and discovery hooks, but the destination is always the album. When you capture a track from a station, what you're really saying is "I need to investigate this album." The system stores, displays, and thinks in albums.

4. **Stations are discovery engines** -- Stations (Pandora, YouTube Music radio) exist purely for finding new music. They are never mixed with library playback in the UI. Discovery and collection are separate mental modes with separate interfaces.

5. **The system is the brain** -- Pyxis is an always-on daemon that proxies all audio, manages all state, and controls all playback targets. Whether you're listening in a browser or casting to a speaker, Pyxis is the single source of truth.

## Relationship Tiers

Every album in the system exists in one of four tiers that reflect your actual relationship with the music:

### New (Inbox)

Albums captured from discovery sessions. When you thumbs-up a track on a Pandora station or a YouTube Music radio, the track is captured here and the album is queued for exploration.

- **Entry**: Automatic via thumbs-up/bookmark during station listening. Explicit search-and-add does NOT trigger inbox.
- **Display**: Shows the captured track, not the full album. The track is the hook; tapping it leads to the album page.
- **Enrichment**: Background enrichment starts immediately -- editorial context, artist narrative, musical connections, reviews.
- **Exit**: Listening to the album (behavioral signal), explicit triage action, or time decay. Decay never fully hides an item -- decayed entries move to a "stale inbox" accessible in an active triage mode.
- **Caching**: Same TTL as the configured archive window.
- **Cross-source**: Capturing on Pandora also thumbs-up/bookmarks on YouTube Music (and vice versa) when cross-source identity can be resolved.

### Hot

Albums in heavy current rotation. The stuff you can't stop listening to.

- **Entry**: System detects repeat listens and suggests promotion from New or Collection. User confirms.
- **Behavior**: Separate bucket -- Hot items don't compete with or dilute Collection browsing.
- **Exit**: Natural decay as listening frequency drops; system suggests demotion to Collection.
- **Caching**: Permanently cached audio files.

### Collection (Library)

The core library. Albums you like and want to return to, some more than others. This is the largest tier and the one that benefits most from progressive disclosure and resurfacing.

- **Entry**: Explicit promotion from New or Hot; direct add from search.
- **Display**: Contextual shelves and filtered grid, not a flat list. Sorting by artist, newest, recently played, neglected.
- **Resurfacing**: The system tracks which albums haven't been played in a long time and surfaces them. Neglect detection is a core feature.
- **Caching**: Permanently cached audio files.

### Archive (Vault)

Albums that are part of your history. You rarely want to listen to them, but you never want to lose them. The Spice Girls tier.

- **Entry**: Explicit demotion from Collection.
- **Display**: Separate section, never surfaced alongside Collection. Accessible but out of the way.
- **Listening**: Fully playable. You can always go back.
- **Caching**: No cached audio files. Streamed on demand.

### Tier Configuration

All tier behaviors (decay timelines, cache TTLs, promotion thresholds) are configurable in YAML and editable from the UI settings page.

## Discovery & Capture Flow

```
Station Playback (Pandora / YTMusic radio)
            |
      thumbs-up / bookmark
            |
            v
    +-------+--------+
    | Capture trigger |
    +-------+--------+
            |
    +-------v--------+         +------------------+
    | Inbox (New)    |-------->| Background       |
    | Track displayed |         | Enrichment:      |
    +-------+--------+         | - Album metadata  |
            |                   | - Artist context  |
            |                   | - Musical graph   |
            |                   | - Reviews         |
            |                   +------------------+
            |
    user listens / triages / decay
            |
     +------+------+------+
     v      v      v      v
    Hot  Collection  Stale   Dismiss
              |       inbox
              v
           Archive
```

## Listening History

Pyxis maintains a complete listening journal -- every track, album, station session, and discovery capture, with timestamps and context.

### What Gets Logged

- Every track play (source, timestamp, duration listened, context: station vs. album vs. queue)
- Every station session (which station, how long, what was captured)
- Every tier movement (when an album moved between tiers and why)
- Device and location metadata (when available, configurable)

### History Uses

- **Time travel**: "What was I listening to two years ago in mid-June?" Always answerable.
- **Neglect detection**: Surface albums from Collection that haven't been played in a configurable window.
- **Completeness tracking**: Know whether you've listened to a full album or just the singles.
- **Pattern awareness**: Understand your own listening habits over time.
- **Hot detection**: Identify albums entering heavy rotation before you consciously notice.

### History UX

Visual timeline. Scrollable, browsable, searchable. Not a spreadsheet of plays -- a journal you'd want to revisit.

Stats exist but serve insight, not vanity. The goal is to learn something about your listening, not to gamify it.

## Weekly Mix

A curated playlist generated automatically every Monday from upstream recommendation algorithms (Pandora/YouTube Music), seeded by albums in Inbox, Hot, and Collection (not Archive).

### Key Rules

- **Frozen once generated**: The mix for a given week cannot be regenerated. This prevents shopping behavior and encourages actually engaging with unfamiliar music.
- **Familiarity dial**: A persistent, configurable setting that controls how adventurous the mix is. Low = more music in familiar territory. High = broader horizons, new genres.
- **Cross-source blend**: The mix pulls recommendations from all connected sources and merges them.

## Cross-Source Identity

Albums and artists are resolved across sources. A Radiohead album found on Pandora, YouTube Music, and Bandcamp is one album in Pyxis, with multiple source references.

- **Auto-merge**: The system automatically matches albums by title/artist similarity and merges them.
- **Undo**: Mismatches can be manually split. This is critical because automated matching will get it wrong sometimes.
- **Streaming priority**: When playing a merged album, the system picks the best available source (configurable priority order, currently: YTMusic > SoundCloud > Bandcamp > Pandora).

## Enrichment

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

### Always Proxy

All audio streams through Pyxis, even when casting. Pyxis is the brain; playback targets are speakers.

- Browser playback: Direct through Pyxis stream proxy
- Casting (Sonos, Home Assistant): Pyxis proxies audio to the target

### Caching Strategy

- **New (Inbox)**: TTL-based cache matching the configurable archive window
- **Hot**: Permanently cached
- **Collection**: Permanently cached
- **Archive**: No cache; streamed on demand
- All cache behaviors configurable in settings

### Lean-Back Mode

When you just want music without decisions:
- Continue from where the last session left off

## Technical Architecture

### Daemon Model

Always-on NixOS service on a home server. Single process with:
- tRPC API for all client interactions
- Audio stream proxy for all playback
- Background enrichment worker
- Listening history logger
- Weekly mix generator (cron-style, Monday schedule)

### State Model

Single source of truth per user. State follows the user across devices.
- Current playback state, queue, and progress
- Tier assignments and history
- Listening journal
- Weekly mix archive
- Multi-user support planned for the future (per-user state isolation)

### Configuration

YAML config file (`~/.config/pyxis/config.yaml`) with UI settings page. All behavioral parameters are configurable:
- Tier decay timelines and promotion thresholds
- Cache TTLs per tier
- Weekly mix familiarity dial default
- Enrichment source priorities
- Streaming source priority order
- Logging level

### Source Adapters

Current sources and their roles:

| Source | Streaming | Search | Discovery | Enrichment |
|--------|-----------|--------|-----------|------------|
| Pandora | Yes | Yes | Yes (stations) | No |
| YouTube Music | Yes | Yes | Yes (radio) | No |
| Bandcamp | Yes (beta) | Yes (beta) | Future | No |
| SoundCloud | Yes (beta) | Yes (beta) | Future | No |
| MusicBrainz | No | No | No | Yes |
| Discogs | No | No | No | Yes |
| Deezer | No | No | No | Yes |

Future sources are aspirational stubs -- the architecture supports them, but they ship when they ship.

### UI Stack

- React + TanStack Router + tRPC client
- Shadcn/Radix components with Tailwind tokens (migration from current ad-hoc components)
- Responsive design: mobile-first, works on all screen sizes
- Progressive disclosure throughout -- no data dumps

## What Pyxis Is Not

- **Not a social platform**: No sharing, no friends, no public profiles. This is a personal system.
- **Not a playlist manager**: No user-created playlists. Tiers are the organizational primitive. Stations are discovery tools, not curated lists.
- **Not a recommendation engine**: Pyxis uses upstream algorithms (Pandora, YouTube Music) for discovery. It doesn't build its own recommendation model (though the architecture leaves room for a hybrid approach in the future).
- **Not a music player**: Pyxis is a music *system*. The player is one interface into it. The API is the primary contract; the web UI is one client.
