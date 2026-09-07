---
id: 01M1WNM11MH33SPVVGE5P1KJN6
slug: make-browser-diagnostics-fail-closed-outside-diagnostic-host
title: Make browser diagnostics fail closed outside diagnostic hosts
origin: parked
status: To Do
priority: high
labels:[]
created: 2026-09-07
source: se-debug
---

# Make browser diagnostics fail closed outside diagnostic hosts

## Why it matters

A temporary smoke script selected the first global 'Clear queue' button, which became a Sonos output control when Kitchen reappeared. The request failed and Kitchen retained its 42 tracks, but session assertions alone did not prevent the unintended request. An older /tmp Chromium profile also lost its IndexedDB manifest around system temporary-file cleanup. Diagnostic safety must not depend on current output visibility or temporary-file retention.

## Acceptance Criteria

- [ ] Check every mutating diagnostic request against explicit allowed session/device IDs before it can reach the core; cover unknown/output targets with negative tests.
- [ ] Scope transport and queue selectors to the intended session section; test duplicate button labels and changing output visibility.
- [ ] Use persistent diagnostic-profile locations outside /tmp and retain sanitized verification evidence durably.
- [ ] Make diagnostic creation and cleanup explicit; never clear, restore, regroup, or send playback commands to user/output sessions implicitly.
- [ ] Exercise native press/release intervals with intervening realtime updates, not only effectively instantaneous clicks; resolve intended rows by explicit session identity.

## Related

- `docs/operations/2026-09-06-m3-reconnect-validation.md`
- `docs/operations/2026-09-06-m3-read-only-reopens.md`
- `clients/app/src/reference/Outputs.tsx`
- `clients/app/src/reference/Sessions.tsx`
- `docs/operations/2026-09-06-m3-handoff-click-stability.md`

## Notes

Current temporary helpers now scope Clear queue to Session, validate explicit RPC method arguments, and enforce CDP Fetch request-stage guards with nonexistent-target negative probes. These protections need a durable shared harness rather than divergent /tmp copies. The old diagnostic A core queue was left untouched after its profile failure.

The `560b530` follow-up reproduced a silent lost click when an unchanged realtime update moved a handoff button during a native press. The view now has stable ID ordering and `data-session-id` row locators. Its guarded live retest uses 120-ms presses and precise Session/Host transport/library-list scopes. The first seed attempt failed closed because Library albums is the second heading in its section; do not assume the first heading identifies every nested region. B's closed profile was copied to `~/.local/state/pyxis-diagnostics/m3-handoff-b-20260906`; its old /tmp copy is retired. These temporary improvements still do not constitute shared all-channel guards.
