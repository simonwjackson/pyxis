---
id: 01M1W0J02HD295KB4SCDV074MN
slug: reject-empty-or-out-of-range-provider-duration-components
title: Reject empty or out-of-range provider duration components
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-09-06
source: se-work
---

# Reject empty or out-of-range provider duration components

## Why it matters

The historical duration-omission fix handles LIVE and invalid minute/second ranges, but the current parser still accepts ':' as zero, '1:' as one minute, and '999999999:00' as 59999999940000 ms. The last exceeds the core album contract's u32 field and can reject an otherwise valid album instead of omitting unavailable duration metadata.

## Acceptance Criteria

- [ ] Add parser regressions for empty components, non-digit components, oversized values, LIVE, valid mm:ss and hh:mm:ss.
- [ ] Only emit durationMs when every component is valid and the final integer fits the public/core wire contract.
- [ ] Ensure invalid duration metadata is omitted without rejecting otherwise valid album metadata.

## Related

- `plugins/ytmusic/src/internal-api.ts`
- `plugins/ytmusic/src/internal-api.test.ts`
- `services/pyxis/src/source_catalog.rs`

## Notes

2026-09-06 independent review executed current parseAlbum with valid header/track fixtures varying only duration. This is a genuine residual of the historical invalid-duration card, not a newly introduced M3 regression.
