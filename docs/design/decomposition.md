# Client decomposition

The inventory the styled client is built from. It exists because a component that cannot be
found is not reused — it is rebuilt, slightly differently, on the next surface. That is not a
prediction. It already happened here, and the evidence is at the bottom of this page.

Two questions, answered separately for every component:

1. **Which layer is it?** Atom, molecule, organism, template, page.
2. **Where does it live?** System (shared, a reusable decision), shape (feature-local
   arrangement, no data), or binding (the data edge).

The axes are independent. A page can be thin; an atom can be feature-local.

---

## Inventory

Derived from the reference pages in `prototypes/`, which are working HTML. Names in
`monospace` are the reference implementations.

### System — shared, brand-carrying decisions

These know nothing about Pyxis. Strip the domain nouns and they still make sense.

All of these are extracted. None lives in a page.

| Component | Layer | Decision it owns | Lives in |
|---|---|---|---|
| Tokens | — | Colour, scrim, edge, type scale | `system.css` `:root` |
| `Cover` | Atom | A square image with a hairline edge and a fallback sleeve | `common.js` `sleeve()` |
| `AvailabilityMark` | Atom | Filled / hollow / absent, on the art itself | `system.css` |
| `HeatDot` | Atom | One meaning: sounding, or awaiting a decision | `system.css` |
| `Badge` | Atom | A count attached to a label | `system.css` |
| `Action` | Atom | Bordered, sentence case, thumb-sized; one primary per view | `system.css` |
| `Chip` | Molecule | A bordered, selectable option, with a removable variant | `system.css` |
| `Skeleton` | Molecule | Placeholder in the real geometry, never a spinner | `system.css` |
| `Sheet` | Organism | A modal surface that docks to the bottom on narrow screens | `system.css` |
| `SheetHead` | Molecule | Sticky label plus dismiss | `system.css` |
| `Tabs` | Organism | Top-level destinations with optional counts | `nav.js` |
| `Rail` | Organism | Horizontal overflow that does not steal vertical drags | `system.css` |
| `Wall` | Organism | The album grid's column and gap geometry | `system.css` `.grid` |
| `VirtualGrid` | Organism | Windowing; spacers hold scroll height | `parts.js` |
| `MediaBar` | Organism | Permanent bar that keeps its footprint when idle and expands | `nowplaying.js` |

`VirtualGrid` is the clearest case for the rule: 60 lines of index maths that nobody will
write twice correctly, containing no domain nouns at all. It takes a `render` function, so it
never learns what a row is. Its geometry is read back from `.grid` through
`getComputedStyle`, because the same numbers written in both CSS and JavaScript are two
copies of one decision and they drift in silence.

### Shape — feature-local, composition only

Domain words live here. A shape that grows its own bar, grid or card chrome means a system
component underneath it has not been extracted yet.

| Shape | Layer | Composes |
|---|---|---|
| `StacksPage` | Page | Tabs, Rail×3, VirtualGrid, Sheet (filters), Sheet (detail) |
| `DiscoveryPage` | Page | Tabs, Cover, Action×3 |
| `SearchPage` | Page | Tabs, result rows, Action |
| `HistoryPage` | Page | Tabs, day groups, Cover |
| `RoomsSheet` | Organism | Sheet, room rows, Action |
| `AlbumDetail` | Organism | Sheet (wide), Cover, fact pairs, Action |
| `BrowseControls` | Organism | search field, sort, Chip set |
| `AlbumTile` | Molecule | Cover + AvailabilityMark + HeatDot |
| `PlayRow` | Molecule | Cover + title/artist + time + room |

`AlbumTile` is the boundary case worth stating. It is domain-named, so it is a shape — but it
appears on four surfaces, so it is shared *within the feature layer*, not rebuilt per page.

### Binding — one per screen

Reads the RPC client, the session, and offline state. Passes plain values down.

Nothing below the binding may read a store, a query, or a fetch. That is the whole rule.

An earlier version of this document asserted that the reference pages break it on all five
surfaces. That was wrong, and asserted without looking. Each page loads once at module top,
before `render` is defined, and everything below reads the result — which is the composition
root, correctly applied. The claim is corrected here rather than quietly deleted, because a
document that invents violations is as costly as one that misses them: it sends the next
reader to fix something that is not broken.

```
Route
  Binding        reads RPC, session, offline status
    Page shape   props only
      Organism   props only
        System   props only
```

---

## Gates

Write them first, and watch each fail once. A gate that has never failed is a guess.

`prototypes/gate.mjs` runs over the reference set as `just test-prototypes`, and enforces:

1. **No shared module may depend on styling a page owns.** This is the sheet defect, made
   mechanical.
2. **One class, one owner.** Contextual scoping (`.result .act`) is allowed; a second bare
   definition is not.
3. **No two rules may say substantially the same thing.** Four or more shared declarations
   at 70% overlap is one decision written twice.
4. **No page may hold a function whose body already exists in another page.** Compared by
   body, never by name, since every page legitimately owns a `render()`.

For the client, add:

```ts
// shapes never read the data edge
expect(filesBelowBindingsThatImportRpc).toEqual([])

// no colour outside tokens
expect(filesWithRawHexOutsideTokens).toEqual([])

// shared components carry no domain nouns
expect(sharedComponentsNamedAfterDomain).toEqual([])
```

The token gate already passes in the reference set: zero raw hex outside `system.css`.

### What the gate found that reading did not

It was written after this document claimed the set was decomposed, and it failed on its first
run with twenty findings — having already discarded eighteen false ones, because the first
draft treated `.result .act` as a rival definition and `map(` as a component. A gate that
cries wolf gets muted, and then it protects nothing.

The largest finding was a component this document had explicitly excused as "deliberately
unextracted": the row. Rooms, search results and listening history were three copies of one
molecule — cover, title, subtitle, trailing slot — with 15/15/14px titles, 13/13/12.5px
subtitles and 3/3/2px offsets. Nobody chose those differences; they are what copying looks
like six weeks in.

Behind it: an action variant that existed three times because it had never been named (now
`.act.inline`), a small uppercase meta label restated six times (now `.meta`), and two
layout idioms restated four times (now `.split` and `.aside`).

The gate is also honest about its limits. Consolidating the heat-dot rule, a regex ate the
wrong block and deleted the dot from the now-playing bar. The gate stayed green, because a
deleted rule is not duplication. **A screenshot caught it.** Gates check what they check; they
do not replace looking at the thing.

---

## What this exercise found

The value was not the taxonomy. It was two defects the taxonomy made visible, and one
admission.

**The admission first.** The initial pass of this document classified fourteen components and
extracted none of them, which is precisely the failure the method warns about: getting the
taxonomy right while every component stays local. Four were still trapped in pages — the
chip, the rail, the wall, and the windowing — and were only extracted on a second pass.

The proof that locality causes divergence is in this repository's own history. The chip had
drifted into three near-identical implementations: `.opts button` at 13px, `.chips button` at
12px, and `.chips-row a` at 13px with different padding. The third was written *by this
session*, days after the first two, because the existing chip was buried in a page where
nothing could find it. An agent cannot reuse what it cannot find, and it does not pause to
look.

**The Rooms sheet was broken on four of five surfaces.** `rooms.js` is shared and reachable
from the now-playing bar everywhere, but it emitted `class="sheet"` while the rules for
`dialog.sheet` lived in one page's local `<style>` block. On Stacks it was a bottom sheet with
a scrim. On Discovery, Search, History and Rooms it was a centred box with a default white
border, no backdrop, and a collapsed header where the title and the dismiss overlapped.

Nobody would have found this by reading either file. It only appears when you ask *where does
this decision live* and notice the answer is "in a page that the shared module has never heard
of".

The fix was to move one decision into the shared layer, which also collapsed the album detail
dialog into the same component as a `wide` modifier. Two implementations became one, and
`b-shelves.html` lost 45 lines of local CSS.

The second defect was quieter and had not yet bitten. The rail's `overflow-y: hidden` is the
fix for Android capturing vertical drags — a fix that is invisible, unmemorable, and was
sitting in one page's local styles. Any new surface with a horizontal row would have
reproduced the bug, and the person rebuilding it would have had no reason to suspect the line
existed. It is now shared, with the reason attached to it.

The general lesson, for whoever builds the styled client: **shared behaviour depending on
feature-local styling is invisible until someone opens it somewhere new.** Keep the decision
and its appearance in the same place, and put the reason next to the rule.

## Where it stands

| | Before | After |
|---|---|---|
| Stacks local CSS | 434 lines | 323 lines |
| Shared modules | 5 | 6 (`parts.js` added) |
| Chip implementations | 3 | 1 |
| Modal surface implementations | 2 | 1 (plus a `wide` variant) |

What remains local to Stacks is genuinely its own: the browse controls, the album detail
body, and the shelf composition. That is a shape doing shape work.

`AlbumTile` and `AlbumShelf` now live in `albums.js`, a shared *feature* layer: domain-named,
so not system components, but shared all the same. An earlier version of this document
excused leaving them local because only one surface used them. The gate had already disproved
that reasoning for the row, which was three copies by the time anyone looked; "only one page
uses it" is a statement about today.

Extracting `AlbumShelf` immediately tripped the first check: `albums.js` emitted `.shelf`
while `.shelf` was styled inside `b-shelves.html`. That is the same defect as the rooms
sheet, caught this time within seconds of being created rather than after it reached a
designer.

### What flat HTML cannot show

There are no page or template components here, and there cannot be: the file *is* the page.
Layer coverage of the kind a component catalog checks only becomes meaningful in the client.
The reference set proves the atoms, molecules and organisms; it cannot prove the layers above
them.
