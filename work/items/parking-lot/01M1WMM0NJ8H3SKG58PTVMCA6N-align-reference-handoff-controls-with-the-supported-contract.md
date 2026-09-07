---
id: 01M1WMM0NJ8H3SKG58PTVMCA6N
slug: align-reference-handoff-controls-with-the-supported-contract
title: Align reference handoff controls with the supported contract
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-09-07
source: se-debug
---

# Align reference handoff controls with the supported contract

## Why it matters

The reference offers 'hand off to this device' for Sonos output sessions even though session.handoff always returns outputUnsupported. It also offers handoff to destinations with existing queues without explaining that Stop retains the queue. These false affordances make expected refusals look like broken playback. This is independently visible in code; it is not yet established as the user's particular failed handoff.

## Acceptance Criteria

- [ ] Output sessions do not advertise unsupported handoff as an available operation; explain the existing queue-and-play path instead.
- [ ] Nonempty destination refusal explains that the existing queue is preserved and Stop does not empty it; never auto-clear or overwrite it.
- [ ] Supported empty browser destinations still hand off normally, with UI/API regression coverage.
- [ ] Retain useful typed output-command failure details instead of reducing all failures to 'unavailable'.

## Related

- `clients/app/src/reference/Remote.tsx`
- `clients/app/src/reference/api.ts`
- `services/pyxis/src/rpc/contract.rs`
- `services/pyxis/tests/output_rpc.rs`

## Notes

Discovered while investigating the user report that bidirectional transport works but handoff and Sonos do not. Current runtime contract explicitly excludes output handoff; implementing speaker handoff would be a separate behavior decision. The current audio fix addresses a separately reproduced source restart during browser handoff.
