# UI prototypes

Throwaway design prototypes for the Pyxis client. Not shipped, not built, not tested. They
exist to answer product questions before the real client is designed, and they should be
deleted once that work lands.

## Run

```sh
nix run nixpkgs#python3 -- prototypes/serve.py 0.0.0.0 4499 prototypes
```

Then open `http://<host>:4499`. The server sends `Cache-Control: no-store`, because
browsers otherwise hold stale CSS between edits, and it is threaded, because the wall
requests hundreds of covers at once.

## Surfaces

| Page | Question it answers |
|---|---|
| `a-inbox.html` | Discovery — what should I do with this album? |
| `b-shelves.html` | Stacks — what do I own? |
| `c-console.html` | Rooms — where is it playing? |

The now-playing bar is permanent across all three and expands into the player, which is why
there is no separate player page.

## Data

`data/albums.json` is real: 370 albums and 3,865 tracks exported from a live library.
Placements, play counts, dates and pinned state are **synthetic**, derived from a hash of
each album id so they are stable across reloads and identical on every page. The real
library is 370/370 in Discovery with no listening history, so triage, rotation, neglect and
offline availability would otherwise render empty.

`art/` is not committed. Regenerate it against a running Pyxis:

```sh
nix run nixpkgs#python3 -- prototypes/harvest-art.py
```

Without it the prototypes fall back to blank sleeves, which is itself a state worth seeing.

## States

Every page takes `?state=` and carries a picker in the top bar:

`live` · `silent` · `offline` · `empty` · `nosources` · `loading`

`?theme=dark` and `?theme=light` force a theme; otherwise the toggle remembers a choice and
the system preference is the default.

## Open questions these have not answered

- Which surface is home.
- Whether Rooms deserves a top-level slot or should be a sheet from the player.
- How an album becomes pinned for offline.
- What the bar shows when several rooms are playing at once.
