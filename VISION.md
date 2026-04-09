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

## Library Placement & Signals

Pyxis separates three ideas that are easy to conflate: where an album lives in the library, whether it has been explicitly rejected, and what your listening behavior says is currently salient.

### Library Entry

Albums enter the library only through explicit add. That action can happen from station capture, search, or any future add surface. On entry, an album starts in Discovery.

### Discovery

The inbox. Albums that caught your attention and need a destination.

- **Entry**: Explicit add.
- **Display**: Shows the captured track or entry context as the hook, but always leads back to the album.
- **Enrichment**: Background enrichment starts immediately -- editorial context, artist narrative, musical connections, reviews.
- **Exit**: Explicit triage into Collection, Archive, or Dismissed.
- **Expectation**: Albums should not live here forever. Discovery is for unresolved interest.
- **Caching**: TTL-based cache matching the configured archive window.
- **Cross-source**: Capturing on Pandora also thumbs-up/bookmarks on YouTube Music (and vice versa) when cross-source identity can be resolved.

### Collection

The core library. Durable keepers -- albums that feel meaningfully part of your life and listening identity.

- **Entry**: Explicit move from Discovery or Archive. Direct add still lands in Discovery first.
- **Display**: Contextual shelves and filtered grid, not a flat list. Sorting by artist, newest, recently played, neglected.
- **Resurfacing**: The system tracks which albums haven't been played in a long time and surfaces them. Neglect detection is a core feature.
- **Caching**: Permanently cached audio files.

### Archive

Still part of the library, but not part of the default surface. Albums tied to your history that you want to keep without keeping them in active rotation.

- **Entry**: Explicit demotion from Discovery or Collection. In practice, any album can be moved here manually.
- **Display**: Excluded from default library views unless intentionally included.
- **Listening**: Fully playable. You can always go back.
- **Caching**: No cached audio files. Streamed on demand.

### Dismissed

Albums you decided not to keep in the library.

- **Meaning**: Out of the library, but remembered by the system.
- **Display**: Suppressed from passive discovery and from the main library experience.
- **Recovery**: Explicit search can still show dismissed albums, clearly marked. Re-adding them sends them back to Discovery.
- **Caching**: No cached audio files; eligible for eviction.

### Hot

A computed signal, not a placement.

- **Meaning**: Albums currently in heavy rotation.
- **Source of truth**: Derived entirely from album-level listening history.
- **Behavior**: Can surface albums regardless of placement, including contradictions like Dismissed + Hot.
- **Interpretation**: Dismissed + Hot is a sign the album likely deserves another pass through Discovery.
- **Control**: Fully algorithmic, not manually assigned.
- **Caching**: Can influence prefetching and cache retention, but does not replace placement.

### Placement & Signal Configuration

All placement behaviors and listening-signal heuristics (cache TTLs, archive visibility defaults, hot detection thresholds, suppression rules) are configurable in YAML and editable from the UI settings page.

## Discovery & Capture Flow

```
Station Playback / Search / Any Add Surface
                  |
             explicit add
                  |
                  v
         +--------+---------+         +------------------+
         | Discovery        |-------->| Background       |
         | unresolved album |         | Enrichment:      |
         +--------+---------+         | - Album metadata |
                  |                   | - Artist context |
             explicit triage          | - Musical graph  |
                  |                   | - Reviews        |
        +---------+---------+         +------------------+
        v                   v
   Collection            Dismissed
        |
        v
     Archive
```

Hot is not a destination in this flow. It is a computed signal derived from listening history that can surface albums from any placement.

## Listening History

Pyxis maintains a complete listening journal -- every track, album, station session, and discovery capture, with timestamps and context.

### What Gets Logged

- Every track play (source, timestamp, duration listened, context: station vs. album vs. queue)
- Every station session (which station, how long, what was captured)
- Every placement change (when an album moved between Discovery, Collection, Archive, or Dismissed and why)
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

A curated playlist generated automatically every Monday from upstream recommendation algorithms (Pandora/YouTube Music), seeded by albums in Discovery and Collection, weighted by what the system currently sees as Hot, and excluding Dismissed by default.

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

- **Discovery**: TTL-based cache matching the configurable archive window
- **Collection**: Permanently cached
- **Archive**: No cache; streamed on demand
- **Dismissed**: No cache; eligible for eviction
- **Hot**: A computed signal that can influence prefetching and retention across placements
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
- Placement assignments, dismissed memory, and history
- Listening journal
- Weekly mix archive
- Multi-user support planned for the future (per-user state isolation)

### Configuration

YAML config file (`~/.config/pyxis/config.yaml`) with UI settings page. All behavioral parameters are configurable:
- Placement behaviors, suppression rules, and hot detection thresholds
- Cache TTLs per placement
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
