# Design reference

Working reference pages for the Pyxis client. Not shipped, not built, not tested — they exist
so a designer can see the product behave with real data before the real client is written.

Start at `index.html`.

## Run

```sh
nix run nixpkgs#python3 -- prototypes/serve.py 0.0.0.0 4499 prototypes
```

Then open `http://<host>:4499`. The server sends `Cache-Control: no-store`, because browsers
otherwise hold stale CSS between edits, and it is threaded, because the wall requests
hundreds of covers at once.

## Pages

| Page | Surface |
|---|---|
| `index.html` | Directory: surfaces, states, themes |
| `system.html` | Colour, type, availability marks, parts |

Shared code: `system.css` and `common.js` (tokens, components and the data layer), `parts.js`
(the windowed grid), `albums.js` (tile and shelf), `nav.js`, `account.js`, `sources.js`,
`rooms.js`, `nowplaying.js`, `states.js`.

`gate.mjs` is the drift check: run `node prototypes/gate.mjs` or `just test-prototypes`. It
fails on shared code depending on page-local styling, a class owned in two places, two rules
saying the same thing, a function body copied between pages, a comment welded to a selector,
and a class written by code that no stylesheet defines. Classes named `js-` are declared
behaviour-only and exempt from the last one. `reference.css` is chrome for the
two documentation pages and is deliberately not part of the product system.

| Page | Surface |
|---|---|
| `b-shelves.html` | Stacks — the collection, and home |
| `a-inbox.html` | Discovery — triage |
| `d-search.html` | Search — reaches sources, adds to Discovery |
| `e-history.html` | History — the listening journal |
| `c-console.html` | Rooms — a sheet in the product, shown alone here for review |
| `f-sources.html` | Sources — connecting, re-authenticating, first run |
| `g-devices.html` | Devices — what can play, and pairing another |

The now-playing bar is permanent on every surface and expands into the player, which is why
there is no player page.

## States and themes

Any page takes `?state=` — `live`, `silent`, `offline`, `multiroom`, `unreachable`,
`handofffailed`, `writefailed`, `empty`, `nosources`, `firstrun`, `authexpired`, `loading` —
and `?theme=light` or `?theme=dark`. Without a theme parameter the
system preference wins. The index links to every combination worth seeing.

## Data

`data/albums.json` is real: 370 albums and 3,865 tracks exported from a live library, so long
titles, unusual characters and 244-album density behave as they will in the product.

Placements, play counts, dates, listening history and offline availability are **synthetic**,
derived from a hash of each album id so they are stable across reloads and identical on every
page. The real library is 370/370 in Discovery with no listening history, so triage, rotation,
neglect and offline availability would otherwise render empty.

`art/` is not committed. Regenerate it against a running Pyxis:

```sh
nix run nixpkgs#python3 -- prototypes/harvest-art.py
```

Without it the pages fall back to blank sleeves, which is itself a state worth seeing.

## The gate

```sh
just test-prototypes      # or: node prototypes/gate.mjs
```

It fails when a shared module depends on styling a single page owns, when a class has two
owners, or when two rules say substantially the same thing. All three are drift that reading
cannot see: the first shipped a broken Rooms sheet to a designer, and the second let one row
component exist three times with 15/15/14px titles that nobody chose.

Add a surface and it will tell you what you copied.

## Decisions these pages encode

- The album is the subject of every screen. Tracks are demoted or hidden.
- Playback is a layer, not a destination: a permanent bar that expands into the player.
- Stacks is home. Rooms is a sheet, because it is consulted rarely.
- Offline availability is set by placement with a per-album override, and *having* an album is
  shown separately from *wanting* it.
- Covers are the only source of colour; heat means playing, or awaiting a decision.

## Not answered here

Gaps, not decisions:

- Installing a plugin. Soulseek offers the button; nothing is behind it.
- Disconnecting a source, or removing an account. Both can be added, neither undone.
- A stream that dies mid-track, as distinct from a source signed out before you press play.

Decided, not missing: no brand, logo, illustration or colour beyond the covers. No artist page
and no playlist, because the album is the unit. No queue editor — an album ending is an album
ending, so silence is the default and continuing is one tap in the player.

## Live data

Append `?live=1` and albums come from the running core over the public RPC contract, proxied
same-origin by `serve.py`, which holds the bearer token so it never reaches the page. Listening
history, offline availability and an album's source stay synthetic: the real library has no
plays yet. If the core is unreachable the page says so and falls back to `data/albums.json`
rather than looking healthy while showing a recording.
