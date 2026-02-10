---
module: Playback
date: 2026-02-10
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - "Song restarts from beginning after pause/resume toggle"
  - "Log shows: [action] seek before resume: 50.494416→0 (delta=50.494416)"
  - "serverProgressRef.current stuck at 0 during entire playback"
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [playback, pause-resume, stale-ref, sse, audio-seek]
---

# Troubleshooting: Pause/Resume Restarts Song From Beginning

## Problem

When toggling pause and then resuming playback, the song restarts from the beginning instead of continuing from the paused position. The HTML audio element's `currentTime` is forcibly set to 0 by stale state in `serverProgressRef`.

## Environment

- Module: Web Playback (`src/web/shared/playback/use-playback.ts`)
- Affected Component: `togglePlayPause` function, `serverProgressRef` ref
- Date: 2026-02-10

## Symptoms

- Song audibly restarts from the beginning when unpausing
- Playback log shows: `[action] seek before resume: 50.494416→0 (delta=50.494416)`
- `serverProgressRef.current` remains `0` for the entire duration of a track after it starts
- The seek-before-resume delta check (`delta > 2`) always triggers because the ref is stale

## What Didn't Work

**Direct solution:** The problem was identified and fixed on the first attempt after log analysis revealed the exact seek behavior.

## Solution

Sync `serverProgressRef.current` with `audio.currentTime` when the user pauses, so the ref holds the correct position when resume checks the delta.

**Code changes:**

```typescript
// Before (broken) - use-playback.ts:428-434:
if (state.isPlaying) {
    logToServer("[action] togglePlayPause → pause");
    const audio = audioRef.current;
    if (audio) audio.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
    pauseMutation.mutate();
}

// After (fixed) - use-playback.ts:428-437:
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

## Why This Works

1. **Root cause:** `serverProgressRef` (line 81) was initialized to `0` and only updated when `handleServerState` processed SSE messages or mutation responses (line 234). During normal local playback, `onTimeUpdate` updated React state but never touched the ref. The progress report interval (every 5s) sent `audio.currentTime` TO the server, but the server's `reportProgress()` is a silent update (no SSE broadcast), so the ref was never echoed back. After a new track started via `trackEnded` mutation response with `progress=0`, the ref stayed at `0` for the entire track duration.

2. **Why the fix works:** By saving `audio.currentTime` to `serverProgressRef.current` at pause time, the resume delta check finds `|50.5 - 50.5| = 0`, which is `< 2`, so the seek is skipped and audio continues from the paused position.

3. **Multi-device handoff preserved:** The seek-before-resume logic was designed for multi-device scenarios where another device may have advanced playback. This still works because `handleServerState` (via SSE) overwrites `serverProgressRef.current` with the server's position whenever a state change is broadcast. Only local pause now also writes to the ref.

## Prevention

- When using refs to track server-authoritative values, ensure they stay in sync during local-only operations (not just server push events)
- Be wary of refs that are only updated by external events (SSE, mutation responses) but read during local actions — they go stale during uninterrupted local playback
- The playback logs are the fastest path to diagnosing seek/position bugs — check for `[action] seek before resume` entries showing unexpected position jumps

## Related Issues

No related issues documented yet.
