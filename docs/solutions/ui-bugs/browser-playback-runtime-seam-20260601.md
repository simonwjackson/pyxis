---
module: Playback
date: 2026-06-01
problem_type: architecture
component: web_playback_runtime
resolution_type: seam_extraction
severity: medium
tags: [playback, react, effect-atoms, html-audio, reconciliation]
---

# Browser Playback Runtime Seam

## Problem

`usePlayback` used to own too many responsibilities at once:

- subscribing to Effect RPC player state atoms
- deciding how server state should reconcile with local browser audio
- mutating `HTMLAudioElement` directly
- handling pause/resume handoff progress
- reporting duration, progress, track-ended, and audio errors
- projecting internal state into the public `PlaybackContext` contract

That made playback regressions hard to test because important behavior lived inside a React hook coupled to DOM audio APIs.

## Ownership Model

The split is now:

1. **Server player state is authoritative for queue/transport intent.**
   - Current track
   - Transport status: `playing`, `paused`, `stopped`
   - Server progress used for reconnect/handoff
   - Volume

2. **Browser audio owns physical realization.**
   - Loaded stream URL
   - Actual `currentTime`
   - Paused/playing DOM state
   - Media events and media errors

3. **Pure reconciliation policy decides the bridge.**
   - `reconcilePlaybackState(...)` compares server state with an audio snapshot.
   - It returns audio actions (`Load`, `Seek`, `Play`, `Pause`, `ResetTime`, `SetVolume`) and a state patch.
   - It does not touch React, Effect atoms, or `HTMLAudioElement`.

4. **`usePlayback` remains the runtime coordinator.**
   - It subscribes to atoms.
   - It executes policy actions through the browser-audio adapter.
   - It keeps the public `PlaybackContextValue` unchanged.

## Significant Types

```ts
export type BrowserAudio = {
  readonly snapshot: () => PlaybackAudioSnapshot;
  readonly setSrc: (src: string) => void;
  readonly setCurrentTime: (time: number) => void;
  readonly setVolume: (volume: number) => void;
  readonly play: () => Promise<void>;
  readonly pause: () => void;
};
```

```ts
export type PlaybackAudioAction =
  | { readonly _tag: "Load"; readonly src: string }
  | { readonly _tag: "Seek"; readonly position: number; readonly when: "now" | "canplay" }
  | { readonly _tag: "Play"; readonly context: string }
  | { readonly _tag: "Pause" }
  | { readonly _tag: "ResetTime" }
  | { readonly _tag: "SetVolume"; readonly volume: number };
```

## Why This Works

The fragile branch logic is now testable without React or media APIs. Tests directly cover:

- first server snapshot suppresses autoplay for a newly loaded track
- reconnect/same-track resume
- pause reconciliation
- same-track progress drift seek before resume
- new stream URL transitions after commands like skip
- stopped/no-track cleanup
- audio error message mapping used by reporting

The hook still decides when to report progress or errors, but the policy decides *what should happen* when server state and local audio diverge.

## Related Files

- `src/web/shared/playback/playbackReconciliation.ts`
- `src/web/shared/playback/playbackReconciliation.test.ts`
- `src/web/shared/playback/browserAudio.ts`
- `src/web/shared/playback/usePlayback.ts`
