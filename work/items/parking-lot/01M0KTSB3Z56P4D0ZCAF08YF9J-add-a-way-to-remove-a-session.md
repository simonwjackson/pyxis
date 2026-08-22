---
id: 01M0KTSB3Z56P4D0ZCAF08YF9J
slug: add-a-way-to-remove-a-session
title: Add a way to remove a session
origin: parked
status: To Do
priority: low
labels:
  - sessions
  - api
  - cleanup
created: 2026-08-22
source: se-work
context:
  branch: main
  commit: e2c45d0
  repo: pyxis
  invoked_by: U13 tailnet validation
---

# Add a way to remove a session

## Why it matters

Sessions are durable but there is no RPC to delete one. Every device claim plus session create leaves a permanent record, and the tailnet realtime check just added a throwaway "tailnet check" session that can never be removed. Over time the durable session list accumulates dead entries from old devices, browser reinstalls, and diagnostics. They are hidden from the default console view because they are unreachable, so the clutter is invisible until someone asks the durable question, which makes it worse rather than better. U13 added handoff, which makes stale sessions more confusing: they appear as handoff targets the moment their host reconnects.

## Acceptance Criteria

- [ ] `session.remove` exists as a public RPC and is account-scoped
- [ ] Removing a session a device still hosts is refused or explicitly ends it rather than orphaning the host
- [ ] Removal fans out on the sessions topic so consoles drop it immediately
- [ ] The throwaway 'tailnet check' session can be removed from the live store

## Related

- `services/pyxis/src/sessions/mod.rs`
- `services/pyxis/src/rpc/contract.rs`
