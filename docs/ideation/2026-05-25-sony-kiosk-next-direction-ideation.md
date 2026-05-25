---
date: 2026-05-25
topic: sony-kiosk-next-direction
focus: Next direction after the Sony Android Pyxis kiosk APK is working
mode: repo-grounded
---

# Ideation: Sony Kiosk Next Direction

Run: 3b011348
Focus: next direction after working Sony Android Pyxis kiosk APK
Mode: repo-grounded

## Grounding summary
- Pyxis is a Bun/TypeScript daemon + React/Vite web UI; daemon is the source of truth.
- Product vision: albums are the unit; Discovery/Collection/Archive/Dismissed, Hot from listening history, journal, Weekly Mix, cross-source identity, enrichment, caching, and lean-back mode.
- Current milestone: Sony Android/Kotlin WebView kiosk works with hardcoded LAN IP, reconnect UI, guarded WebView, health endpoint, and Device Owner scaffold.
- Learnings: browse→play friction matters; append-only listen log at playback transitions is a strong foundation; playback trust/position bugs are high severity; strict persisted-state contracts prevent expensive device/debug failures.
- External: mature kiosk systems emphasize reliability/recovery/remote observability; Android WebView is weak for media controls; native MediaSession is credible; Sony NW-A306 battery/small-screen/network constraints matter.

## Ranked Ideas

### 1. Playback trust spine
**Description:** Build a daemon-owned playback truth layer: append-only listen ledger, position reconciliation, durable current-playback state, and explicit recovery after reload/reconnect/stream failure.
**Warrant:** direct: learnings identify append-only listen logs at playback transition points and high-severity playback trust/position bugs; vision says Hot comes from listening history.
**Rationale:** This unlocks trust, Hot, journal, Weekly Mix, debugging, and future device handoff from one foundation.
**Downsides:** Requires careful event modeling and may expose existing playback-state bugs before it creates new UI value.
**Confidence:** 92%
**Complexity:** Medium
**Status:** Unexplored

### 2. Kiosk control plane
**Description:** Make the Sony a manageable appliance: pairing/discovery instead of hardcoded IP, kiosk heartbeat, WebView/network/battery status, last failure, remote reload/restart, and Device Owner policy status.
**Warrant:** direct: current kiosk still hardcodes LAN IP but has health/reconnect/Device Owner foundations; external: mature kiosk products compete on recovery and remote observability.
**Rationale:** This moves the Android work from “working demo” to “device I can actually live with.”
**Downsides:** Can sprawl into generic MDM/admin if not kept to one personal-device use case.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

### 3. Native Android MediaSession bridge
**Description:** Add a thin Kotlin MediaSession layer that mirrors daemon playback and forwards play/pause/skip/metadata for hardware keys, Bluetooth AVRCP, lockscreen/system controls, and screen-off behavior.
**Warrant:** external: Android WebView media-session/background control is weak; Android MediaSession is the native contract for media controls.
**Rationale:** The Walkman should feel like a music device, not just a browser displaying a music app.
**Downsides:** Needs a clear WebView/daemon/native boundary to avoid introducing split-brain playback control.
**Confidence:** 84%
**Complexity:** Medium-High
**Status:** Explored → `docs/brainstorms/android-mediasession-bridge-requirements.md`

### 4. Album-first lean-back mode
**Description:** Build a kiosk-optimized mode around large album art, now playing, next album, one-action start, Hot from listen history, and minimal transport/triage actions.
**Warrant:** direct: Pyxis vision names albums as the unit, Hot from listening history, and lean-back mode; learnings emphasize browse→play friction.
**Rationale:** It is the strongest product direction for the Sony hardware: low-friction listening, not deep browsing.
**Downsides:** Needs playback/listen-history quality first or it risks becoming a pretty randomizer.
**Confidence:** 86%
**Complexity:** Medium
**Status:** Unexplored

### 5. Album lifecycle and identity foundation
**Description:** Formalize album states (Discovery, Collection, Archive, Dismissed) plus cross-source album identity and enrichment/cache metadata as schema-validated daemon state.
**Warrant:** direct: vision names these album states and cross-source identity; learnings warn strict contracts are needed for persisted state.
**Rationale:** This gives Pyxis a product spine beyond search/play and makes future recommendations, caching, and journal features coherent.
**Downsides:** It is foundational and may feel slow unless paired with a visible workflow slice.
**Confidence:** 82%
**Complexity:** High
**Status:** Unexplored

### 6. Offline-resilient Sony mode
**Description:** Treat the NW-A306 constraints as first-class: local app shell/art cache, cached album manifests where possible, clear cached/unavailable status, and battery-aware always-off/dim behavior.
**Warrant:** external: Sony battery and Wi-Fi constraints are material; direct: vision includes caching and current kiosk already has reconnect UI.
**Rationale:** This makes the dedicated device feel dependable under real household network and battery conditions.
**Downsides:** Stream caching may run into source/legal/technical limits; scope needs to start with shell/art/metadata before audio.
**Confidence:** 74%
**Complexity:** High
**Status:** Unexplored

## Rejection summary

| Idea | Reason rejected |
|---|---|
| Zero-friction album start | Strong but folded into Album-first lean-back mode. |
| Daemon appliance dashboard | Duplicate of Kiosk control plane. |
| Router-style appliance admin | Too broad; strongest subset is kiosk pairing/observability. |
| Digital-signage remote observability | Duplicate of Kiosk control plane. |
| Field-device provisioning flow | Duplicate/variant of Kiosk control plane. |
| Remote observability console | Duplicate of Kiosk control plane. |
| Configurable daemon discovery | Folded into Kiosk control plane. |
| No server config pairing | Folded into Kiosk control plane. |
| Car-media Now Playing contract | Folded into Native MediaSession bridge. |
| Native MediaSession shell | Duplicate of Native MediaSession bridge. |
| Camera roll for listening history | Folded into Playback trust spine. |
| Append-only listen ledger alone | Strong but more valuable combined with reconciliation and Hot/history. |
| Playback trust hardening alone | Strong but more valuable combined with listen ledger. |
| Hot from listening history | Folded into Album-first lean-back mode and Playback trust spine. |
| Radio preset lean-back mode | Folded into Album-first lean-back mode. |
| No-touch lean-back queue | Folded into Album-first lean-back mode. |
| Discovery-to-Collection workflow | Folded into Album lifecycle and identity foundation. |
| E-reader library states | Useful analogy, not a standalone product direction. |
| Cross-source album identity spine | Strong but too foundational alone; folded into album lifecycle foundation. |
| NAS-style source/cache integrity | Too admin-heavy; folded into lifecycle/identity and offline-resilient mode. |
| Daemon-managed enrichment/cache pipeline | Folded into Album lifecycle and identity foundation. |
| Strict persisted-state contracts | Implementation posture, not user-facing direction; embedded in foundations. |
| Schema-validated persistent state | Duplicate of strict contracts. |
| Always-off kiosk | Folded into Offline-resilient Sony mode. |
| Zero-network album cache | Ambitious variant of Offline-resilient Sony mode; audio cache risks scope/legal issues. |
| Many-device source-of-truth playback | Real future direction but too broad for the immediate post-Sony step. |
