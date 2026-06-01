---
id: task-022
title: Deepen SourceCatalog as the source contract seam
status: To Do
priority: medium
labels:
  - architecture
  - effect-services
  - sources
  - rpc
created: 2026-06-01
source: se-architecture-improvement
---

# Deepen SourceCatalog as the source contract seam

## Why it matters

`SourceCatalog` mostly mirrors `SourceManager` today, so handlers still resolve managers, parse source-prefixed IDs, perform capability assumptions, and encode source results themselves.

## Acceptance Criteria

- [ ] RPC handlers call SourceCatalog with Pyxis/domain IDs and no longer pass resolved SourceManager instances through most handler signatures.
- [ ] SourceCatalog owns source manager resolution, source capability checks, source-prefixed ID validation, and source error mapping for search, album, playlist, and stream URL operations.
- [ ] Public-contract tests cover cross-source search, album-with-tracks, playlist tracks, missing capability/not-found failures, and stream URL resolution through the SourceCatalog service seam.
- [ ] `ARCHITECTURE.md` clarifies what SourceCatalog owns versus raw source adapters.

## Related

- `src/sources/index.ts`
- `src/sources/types.ts`
- `server/rpc/services/sourceCatalog.ts`
- `server/rpc/handlers/album.ts`
- `server/rpc/handlers/search.ts`
- `server/rpc/handlers/playlist.ts`
- `server/lib/ids.ts`
- `backlog/task-017 - deepen-effect-service-layers-beyond-singleton-wrappers.md`
- `docs/solutions/feature-patterns/2026-02-10-album-browsing-without-save.md`

## Notes

Specific follow-up under the broader Effect service deepening track. Candidate: make SourceCatalog a real source seam rather than a thin wrapper.
