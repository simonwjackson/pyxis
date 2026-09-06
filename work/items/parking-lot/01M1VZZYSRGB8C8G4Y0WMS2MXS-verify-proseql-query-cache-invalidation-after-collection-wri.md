---
id: 01M1VZZYSRGB8C8G4Y0WMS2MXS
slug: verify-proseql-query-cache-invalidation-after-collection-wri
title: Verify ProseQL query-cache invalidation after collection writes
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-09-06
source: se-work
---

# Verify ProseQL query-cache invalidation after collection writes

## Why it matters

Real-WASM storage probes returned an empty cached collection query after creating a row that findById could already read. Production Pyxis reopens storage under each Web Lock, so the observed probes succeed at the actual production boundaries. This upstream behavior still constrains future performance work: removing reopen costs without a verified invalidation contract could lose visibility of queued commands.

## Acceptance Criteria

- [ ] Reproduce stale query visibility against the pinned ProseQL engine in a minimal upstream test.
- [ ] Determine whether immediate query visibility is promised and fix or document the relevant invalidation behavior upstream.
- [ ] Keep Pyxis refresh-under-lock intact until an equivalent consistency guarantee is verified.

## Related

- `clients/app/src/worker/proseql-engine.test.ts`
- `clients/app/src/worker/entry.ts`
- `clients/app/src/worker/database.ts`
- `flake.nix`

## Notes

Independent storage review on 2026-09-06 reproduced a queued-command visibility mismatch without reopen and confirmed the protection with production reopen boundaries. This is not introduced by the snapshot replacement fix.
