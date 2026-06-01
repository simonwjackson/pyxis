---
id: task-019
title: Finish React Root and self-selecting state posture
status: To Do
priority: medium
labels:
  - lattice
  - react
  - storybook
created: 2026-06-01
source: user
---

# Finish React Root and self-selecting state posture

## Why it matters

Several pages convert Effect atom results into ADTs but still branch directly inside page components, and Storybook coverage is limited to shared primitives. Full Lattice React alignment needs fixture-backed Roots and self-selecting state components across behavior-bearing surfaces.

## Acceptance Criteria

- [ ] Remaining behavior-bearing feature pages use Root/provider/state-specific components where that adds depth rather than shallow indirection.
- [ ] Feature state components self-select from ADTs/context/atoms and return null when inactive.
- [ ] Search, Station Detail, Track Info Modal traits, and Home shelves no longer branch on feature ADT cases in presenter JSX where a Root/context plus self-selecting compounds would be deeper.
- [ ] Mutation contracts exposed to compounds are simple domain commands; transport/pending mechanics stay inside Roots.
- [ ] Fixture-backed Storybook stories cover meaningful Loading, Ready, Empty, LoadError, and Defect states for major feature surfaces without network calls.
- [ ] Existing ADT conversion and selector helpers remain pure and unit-tested.
- [ ] No boolean prop forests are introduced.

## Related

- `src/web/features/search/SearchPage.tsx`
- `src/web/features/search/SearchState.ts`
- `src/web/features/StationDetail/StationDetailPage.tsx`
- `src/web/features/StationDetail/StationDetailSeedsSection.tsx`
- `src/web/features/home/HomePage.tsx`
- `src/web/features/bookmarks/**`
- `src/web/features/settings/**`
- `src/web/features/stations/**`
- `src/web/features/genres/**`
- `src/web/features/history/**`
- `src/web/features/PlaylistDetail/**`
- `src/web/shared/TrackInfoModal/**`
- `src/web/**/*.stories.tsx`

## Notes

- 2026-06-01: Architecture scan found this is still the active React follow-up: several surfaces have good `_tag` ADTs, but TSX still switches or inline-checks cases and passes state/booleans into children. Preserve this item rather than creating a duplicate backlog entry.
