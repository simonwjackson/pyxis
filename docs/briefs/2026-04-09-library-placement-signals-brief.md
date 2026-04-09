---
date: 2026-04-09
topic: library-placement-signals-first-slice
status: shaped
---

# Library Placement & Signals Brief

## Chosen Thing
Add a first shippable slice of the new album-focused library model: manual album placement (`Discovery`, `Collection`, `Archive`, `Dismissed`) plus a basic computed `Hot` signal with a visible home shelf and badges.

## Users and Context
Pyxis is album-first. The current product already supports saving albums into a local library, but the saved library is still a single undifferentiated bucket:
- `library.saveAlbum` persists albums directly into the library
- the album schema currently stores metadata only, not placement
- home currently renders all saved albums together as `my albums`
- search success messaging still implies `save to collection`
- listen history already exists, so `Hot` can be derived from album-level history

The need is to make the library reflect relationship, not just possession.

## Goals
- Make album placement a first-class user concept in the product.
- Ensure explicit add sends albums into `Discovery`, not directly into a generic collection.
- Let users manually move an album between `Discovery`, `Collection`, `Archive`, and `Dismissed`.
- Keep `Archive` as part of the library, but hidden from default library views.
- Treat `Dismissed` as out of the library, suppressed from passive discovery, but still remembered and searchable.
- Introduce a basic computed `Hot` signal that is visible in the product now.
- Make the default library experience reflect the new model instead of a flat saved-albums list.

## Non-Goals
- Automatic placement changes or user-confirmed placement suggestions.
- A final or sophisticated `Hot` algorithm.
- Full-product integration across every surface in the app.
- Weekly mix behavior changes beyond staying compatible with the model.
- Full discovery suppression behavior across every future upstream source or station flow.
- Reworking the overall visual design language.

## Constraints
- This is a thin vertical slice, not a full-system migration.
- The app is album-focused; placement is album-level only.
- The current repo structure suggests the first slice should build on the existing local library flow (`saveAlbum`, `library.albums`, album detail, home, search) rather than invent a new acquisition flow.
- `Hot` must be fully computed from listening history, not manually assigned.
- `Hot` is a signal, not a placement, and must not collapse back into a manual bucket.
- `Dismissed + Hot` is a meaningful contradiction: it should be visible, but should not auto-move the album.

## Success Criteria
- When a user explicitly adds an album, it enters `Discovery`.
- A user can manually place an album into `Collection`, `Archive`, or `Dismissed` from the first-slice UI.
- Default library/home views exclude `Archive` unless intentionally included.
- Default library/home views exclude `Dismissed` except where `Hot` explicitly surfaces it.
- Explicit search can show dismissed albums with a visible dismissed state and a clear way to re-add them.
- The product has a visible `Hot` shelf in the main library experience.
- Albums that qualify as `Hot` show a visible badge where they already appear.
- The first slice leaves room for later heuristics, prompts, and broader product integration without changing the core semantics.

## Candidate Shapes
1. **Placement-only foundation**  
   Add placement semantics and storage first; no `Hot` surface yet.

2. **Thin placement slice**  
   Add `Discovery`/`Collection`/`Archive`/`Dismissed` to current library flows and default surfaces; reserve `Hot` for later.

3. **Thin placement + basic Hot slice**  
   Update current library flows around placement, reshape default library surfaces, and expose `Hot` now through a home shelf and album badges.

## Chosen Shape
**Thin placement + basic Hot slice**.

Shape the first release around the existing add/search/album/home loop:
- explicit add creates a library album in `Discovery`
- album detail provides the first clear place to move albums between placements
- default home/library views show living-library placements, not one flat bucket
- `Archive` is hidden by default but intentionally includable
- `Dismissed` leaves the library, stays searchable, and re-add returns it to `Discovery`
- `Hot` is computed from listening history and appears both as a dedicated home shelf and as badges on qualifying albums

## Key Decisions
- `Discovery`, `Collection`, and `Archive` are library placements.
- `Dismissed` is remembered system state but not part of the library.
- `Hot` is computed and user-visible in the first slice.
- `Hot` can surface albums regardless of placement, including dismissed albums.
- If a dismissed album is surfaced as hot, the system does not auto-move it; the recommended human move is back to `Discovery`.
- The first slice should prioritize consistency across the current album add → inspect → browse loop.
- The first slice may use a simple deterministic recent-history heuristic for `Hot`; heuristic sophistication is not part of the requirement.

## Open Questions
None.

## Next Step
Turn this brief into an implementation plan for the thin vertical slice: define the product-facing behaviors per surface, the persistence/API changes needed to support placement and computed hot state, and the minimal migration path from the current flat saved-albums model.
