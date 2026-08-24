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

| Component | Layer | Decision it owns | Reference |
|---|---|---|---|
| Tokens | — | Colour, scrim, edge, type scale | `system.css` `:root` |
| `Cover` | Atom | A square image with a hairline edge and a fallback sleeve | `sleeve()` |
| `AvailabilityMark` | Atom | Filled / hollow / absent, on the art itself | `.frame.available` |
| `HeatDot` | Atom | One meaning: sounding, or awaiting a decision | `.dot` |
| `Badge` | Atom | A count attached to a label | `.badge` |
| `Action` | Atom | Bordered, sentence case, thumb-sized; one primary per view | `.act` |
| `Chip` | Molecule | A removable, toggleable option | `.opts button`, `.chips` |
| `Skeleton` | Molecule | Placeholder in the real geometry, never a spinner | `.skeleton` |
| `Sheet` | Organism | A modal surface that docks to the bottom on narrow screens | `dialog.sheet` |
| `SheetHead` | Molecule | Sticky label plus dismiss | `.sheet-head` |
| `Tabs` | Organism | Top-level destinations with optional counts | `nav.tabs` |
| `Rail` | Organism | Horizontal overflow that does not steal vertical drags | `.rail` |
| `VirtualGrid` | Organism | Windowed grid; spacers hold scroll height | `mountWindow()` |
| `MediaBar` | Organism | Permanent bar that keeps its footprint when idle and expands | `.nowbar` |

`VirtualGrid` is the clearest case for the rule. It is 60 lines of index maths that nobody
will write twice correctly, and it contains no domain nouns at all.

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

Nothing below the binding may read a store, a query, or a fetch. That is the whole rule, and
it is the one the reference pages break most (`loadLibrary()` is called inside render on all
five). Acceptable in throwaway HTML with no state library; not acceptable in the client.

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

```ts
// 1. shapes never read the data edge
expect(filesBelowBindingsThatImportRpc).toEqual([])

// 2. shapes stay thin: no raw layout primitives or magic dimensions
expect(shapeFilesWithRawSpacingValues).toEqual([])

// 3. no colour outside tokens
expect(filesWithRawHexOutsideTokens).toEqual([])

// 4. shared components carry no domain nouns
expect(sharedComponentsNamedAfterDomain).toEqual([])
```

Gate 3 already passes in the reference set: zero raw hex outside `system.css`.

---

## What this exercise found

The value was not the taxonomy. It was one defect the taxonomy made visible.

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

The general lesson, for whoever builds the styled client: **shared behaviour depending on
feature-local styling is invisible until someone opens it somewhere new.** Keep the decision
and its appearance in the same place.
