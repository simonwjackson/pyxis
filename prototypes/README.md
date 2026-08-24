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
| `b-shelves.html` | Stacks — the collection, and home |
| `a-inbox.html` | Discovery — triage |
| `d-search.html` | Search — reaches sources, adds to Discovery |
| `e-history.html` | History — the listening journal |
| `c-console.html` | Rooms — a sheet in the product, shown alone here for review |

The now-playing bar is permanent on every surface and expands into the player, which is why
there is no player page.

## States and themes

Any page takes `?state=` — `live`, `silent`, `offline`, `multiroom`, `unreachable`, `empty`,
`nosources`, `loading` — and `?theme=light` or `?theme=dark`. Without a theme parameter the
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

## Decisions these pages encode

- The album is the subject of every screen. Tracks are demoted or hidden.
- Playback is a layer, not a destination: a permanent bar that expands into the player.
- Stacks is home. Rooms is a sheet, because it is consulted rarely.
- Offline availability is set by placement with a per-album override, and *having* an album is
  shown separately from *wanting* it.
- Covers are the only source of colour; heat means playing, or awaiting a decision.

## Not answered here

Device pairing, the account switcher once a second account exists, and a failed write. Nothing
is styled for a brand.
