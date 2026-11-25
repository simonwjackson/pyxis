# Canonical album id preflight

Read-only count on unzen, 2026-11-25 UTC, from `albumSourceRefs` in the active
`/var/lib/pyxis/data/db/pyxis.yaml` (not the old per-table files). Grouping the
`ytmusic` rows by account and album: 370 MPRE references, zero OLAK references,
zero albums with both forms. No merge or data change was needed; after the check
the duplicate count remains zero. This is a pre-deploy count, not a live upgrade test.
