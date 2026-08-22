---
id: 01M0KC96E20DNMBD1R5N5EB9HB
slug: batch-album-ingestion-into-one-durable-store-commit
title: Batch album ingestion into one durable store commit
origin: parked
status: To Do
priority: medium
labels:
  - performance
  - persistence
  - library
created: 2026-08-22
source: se-work
context:
  cwd: /home/simonwjackson/code/github/simonwjackson/pyxis
  branch: main
  commit: 10d0c82
  repo: pyxis
  invoked_by: user
---

# Batch album ingestion into one durable store commit

## Why it matters

Live reacquisition slows sharply on large releases because source.album.get candidate registration and library.album.add track writes each rewrite the full multi-megabyte YAML document. The behavior is correct, but import and normal album adds scale with track count times store size.

## Acceptance Criteria

- [ ] source.album.get registers all returned track candidates in one ProseQL mutation.
- [ ] library.album.add writes the album, tracks, and source reference in one ProseQL mutation.
- [ ] An integration test proves failure cannot leave a partly added album.
- [ ] A benchmark or timing test shows one album causes a bounded number of durable writes independent of track count.

## Related

- `services/pyxis/src/source_catalog.rs`
- `services/pyxis/src/library/albums.rs`
- `services/pyxis/src/db/store.rs`
