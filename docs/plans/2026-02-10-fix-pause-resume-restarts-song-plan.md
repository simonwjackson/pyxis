---
title: "fix: Pause/resume restarts song from beginning"
type: fix
date: 2026-02-10
---

# fix: Pause/resume restarts song from beginning

When toggling pause and then resuming, the song restarts from the beginning instead of continuing from the paused position.

## Root Cause

`serverProgressRef` in `use-playback.ts:81` is stale at resume time. The ref is initialized to `0` and only updated when `handleServerState` processes SSE messages or mutation responses (line 234). During normal local playback:

1. A new track starts with `progress=0` via the `trackEnded` mutation response — `serverProgressRef.current = 0`
2. The song plays for 50+ seconds. `onTimeUpdate` (line 121) updates React state but **never** updates `serverProgressRef`
3. The progress report interval (line 394-405) sends `audio.currentTime` TO the server every 5s, but the server never echoes it back
4. `serverProgressRef.current` remains `0` the entire time

When the user resumes, `togglePlayPause` (line 438-444) compares `audio.currentTime` (50.5s) against `serverProgressRef.current` (0s), finds `delta > 2`, and **seeks the audio to position 0**.

```
Log evidence:
[action] seek before resume: 50.494416→0 (delta=50.494416)
```

The seek-before-resume logic was designed for multi-device handoff (another device may have advanced playback), but the stale ref makes it destructive during single-device pause/resume.

## Fix

In the pause branch of `togglePlayPause`, save the audio element's current position to `serverProgressRef` before pausing. This ensures the ref reflects reality when resume checks the delta.

### `src/web/shared/playback/use-playback.ts`

**Line 431-432** — add one line to sync the ref at pause time:

```typescript
// Before (lines 428-434):
if (state.isPlaying) {
    logToServer("[action] togglePlayPause → pause");
    const audio = audioRef.current;
    if (audio) audio.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
    pauseMutation.mutate();
}

// After:
if (state.isPlaying) {
    logToServer("[action] togglePlayPause → pause");
    const audio = audioRef.current;
    if (audio) {
        serverProgressRef.current = audio.currentTime;
        audio.pause();
    }
    setState((prev) => ({ ...prev, isPlaying: false }));
    pauseMutation.mutate();
}
```

**Why this works:**
- On resume, `delta = |50.5 - 50.5| = 0`, seek is skipped, audio continues from paused position
- Multi-device handoff is unaffected: `handleServerState` still overwrites `serverProgressRef` when SSE delivers a different position from another device
- Zero risk of regression — we're recording a known-correct value at the exact moment it matters

## Acceptance Criteria

- [x] Pause and resume continues from the paused position (does not restart)
- [x] Multi-device handoff still works (resuming on device B after device A advanced position should seek to server position)
- [x] Rapid pause/resume cycles (< 1 second between toggles) work correctly
- [x] Log output shows `delta < 2` on resume (no seek triggered)

## Context

- **Bug location:** `src/web/shared/playback/use-playback.ts:428-450`
- **Stale ref:** `serverProgressRef` at line 81, updated only at line 234
- **Server progress reporting:** lines 394-405 (sends to server, never updates local ref)
- **Server `reportProgress`:** `server/services/player.ts:331-335` (silent update, no SSE broadcast)
