---
date: 2026-05-25
topic: android-mediasession-bridge
---

# Android MediaSession Bridge Requirements

## Summary

Give the Sony Android kiosk a full native Android media presence while keeping Pyxis playback daemon/WebView-authoritative: Bluetooth controls, hardware/media buttons, lockscreen/notification controls, and screen-off operation should feel like a real Walkman music app rather than a browser wrapper.

---

## Problem Frame

The Sony kiosk MVP proves that Pyxis can launch as a dedicated Android WebView shell, but it still inherits a browser-like control model. A music device that only works comfortably while the screen is awake and the WebView is visible does not match the expectations created by the Sony Walkman hardware, Bluetooth headphones, Android system media controls, or lockscreen affordances.

Pyxis also has a broader product constraint: the daemon is intended to be the source of truth. Native Android integration must improve device-level control without creating a competing playback state machine that drifts from the server and web UI.

---

## Actors

- A1. Device listener: Uses the Sony Walkman as a dedicated Pyxis music device, often with the screen off or headphones connected.
- A2. Android system media surfaces: Lock screen, notification shade, media buttons, Bluetooth AVRCP, and other OS-level controls that expect an app to expose media state.
- A3. Pyxis daemon/web app: The existing playback authority and user interface loaded by the kiosk WebView.
- A4. Device provisioner/developer: Validates behavior on the Sony and diagnoses mismatches between daemon, WebView, and Android media state.

---

## Key Flows

- F1. Control Pyxis from Android media surfaces
  - **Trigger:** The listener presses play/pause/next/previous from Bluetooth, hardware/media buttons, lockscreen, or notification controls.
  - **Actors:** A1, A2, A3
  - **Steps:** Android receives the media action, the kiosk bridge forwards the intent to Pyxis, Pyxis applies or rejects the action according to its current playback state, and the Android media surface updates to reflect the resulting state.
  - **Outcome:** The listener can operate Pyxis through native Android media controls without opening or touching the WebView.
  - **Covered by:** R1, R2, R3, R5, R8

- F2. Keep system metadata truthful
  - **Trigger:** Pyxis playback starts, changes track, pauses, resumes, stops, errors, or reconnects.
  - **Actors:** A2, A3, A4
  - **Steps:** The bridge observes the authoritative Pyxis playback state, publishes current media metadata and transport availability to Android, and updates or clears stale state when playback is unavailable or uncertain.
  - **Outcome:** Android system surfaces do not display misleading track information or enabled actions after Pyxis state changes.
  - **Covered by:** R3, R4, R5, R6, R7

- F3. Use Pyxis with the Sony screen off
  - **Trigger:** The listener turns the screen off, locks the device, or lets the device sleep while Pyxis is playing or ready to resume.
  - **Actors:** A1, A2, A3
  - **Steps:** Android keeps the appropriate media session/control presence available, media actions continue to route to Pyxis, and user-visible state remains consistent when the screen wakes again.
  - **Outcome:** Screen-off or locked-device use remains a supported first-version behavior rather than a best-effort side effect.
  - **Covered by:** R1, R2, R5, R8, R9

- F4. Recover from disagreement or unavailable playback
  - **Trigger:** The WebView reloads, the daemon is unreachable, playback errors, or Android and Pyxis disagree about current playback.
  - **Actors:** A2, A3, A4
  - **Steps:** The bridge treats Pyxis as authoritative, avoids presenting stale controls as if they are valid, and exposes a diagnosable degraded state until Pyxis can provide fresh playback truth.
  - **Outcome:** The listener is not encouraged to use controls that appear to work but actually target stale or unknown playback state.
  - **Covered by:** R5, R6, R7, R10

---

## Requirements

**System media presence**
- R1. The Sony kiosk must expose Pyxis as an Android media app to OS-level media surfaces while the kiosk is installed and active.
- R2. Bluetooth AVRCP controls, Sony/Android hardware or media-button controls, and lockscreen/notification controls must all be treated as first-version success paths, not optional polish.
- R3. Android media surfaces must show current Pyxis playback metadata when available, including enough title/artist/album/artwork information for the listener to recognize what is playing.
- R4. Android media surfaces must update when Pyxis playback changes, pauses, resumes, stops, errors, or becomes unavailable.

**Daemon-authoritative control**
- R5. Native Android controls must command Pyxis playback rather than creating independent Android-owned playback truth.
- R6. When Android, the WebView, and the daemon disagree, the user-facing media state must converge toward the authoritative Pyxis state rather than preserving stale Android state.
- R7. When Pyxis state is unknown, unreachable, or not currently controllable, Android media surfaces must avoid presenting misleading metadata or enabled actions as if playback were healthy.

**Screen-off and device behavior**
- R8. Play, pause, next, and previous controls must work when the Sony screen is off or locked, subject to the current Pyxis playback capabilities.
- R9. Returning to the kiosk WebView after screen-off or lockscreen control must show playback state consistent with the actions taken through Android media surfaces.
- R10. Failures in the media bridge must be diagnosable through existing or follow-on Pyxis logging/validation paths so the developer can distinguish bridge failure, daemon failure, WebView failure, and unsupported Android behavior.

**Scope control**
- R11. The first version must preserve the WebView/Pyxis web app as the primary browse and playback surface.
- R12. The first version must not require Android to become a full native playback engine.
- R13. The requirements apply first to the Sony Walkman NW-A306; broader Android behavior should not be assumed complete until separately validated.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R5, R8.** Given Pyxis is playing on the Sony and the screen is off, when the listener presses pause on Bluetooth headphones, Pyxis pauses and Android surfaces reflect the paused state.
- AE2. **Covers R1, R2, R5, R8.** Given Pyxis is paused or ready to resume and the Sony is locked, when the listener presses play from the lockscreen or notification media controls, Pyxis receives the intent and playback state updates consistently.
- AE3. **Covers R2, R3, R4.** Given Pyxis advances to a new track, when Android media surfaces are visible, the displayed metadata changes to the new track rather than continuing to show the previous one.
- AE4. **Covers R6, R7, R10.** Given the WebView reloads or the daemon becomes unreachable, when Android media surfaces cannot confirm current Pyxis playback state, they clear or degrade stale controls instead of pretending the last known track is still controllable.
- AE5. **Covers R9.** Given the listener used Bluetooth controls while the screen was off, when the Sony wakes back into the kiosk, the WebView-visible playback state matches the outcome of those controls.

---

## Success Criteria

- The Sony Walkman can control Pyxis through Bluetooth, hardware/media buttons, and lockscreen/notification controls with the screen off.
- Android system media metadata is recognizable, current, and cleared or degraded when Pyxis state is not trustworthy.
- Pyxis remains daemon/WebView-authoritative; native controls do not introduce a second playback truth.
- Downstream planning can distinguish the required media-control behavior from deferred native playback, offline sync, and broader kiosk-management work.

---

## Scope Boundaries

- Building a full native Android playback engine is out of scope.
- Replacing the Pyxis web player or browse UI is out of scope.
- Offline sync, cached audio playback, and local-library playback are out of scope.
- Kiosk control-plane work such as pairing/discovery, heartbeat dashboards, and remote restart is out of scope except where minimal diagnostics are needed to validate media-bridge behavior.
- Generic Android certification or support across non-Sony devices is deferred.
- Multi-device playback handoff is deferred beyond the reconciliation needed to keep the Sony’s Android media surfaces truthful.
- Visual redesign of the Pyxis web UI is out of scope unless a small adjustment is required to reflect media-control state correctly.

---

## Key Decisions

- Full system media presence over transport-only bridge: Bluetooth, hardware/media buttons, and lockscreen/notification behavior are all required because the Walkman should feel native as a music device.
- Screen-off behavior is required: The first version is not done if controls only work while the WebView is foregrounded and the screen is awake.
- Daemon remains authoritative: Native integration improves control surfaces but does not redefine where playback truth lives.
- WebView remains primary: The bridge should not turn this follow-on into a native-player rewrite.
- Sony first: The NW-A306 remains the validation target before claiming broader Android support.

---

## Dependencies / Assumptions

- The Sony Walkman NW-A306 supports the needed Android media-control surfaces for the desired behaviors.
- Pyxis can expose or derive enough current playback state for Android media surfaces to stay truthful.
- Existing playback state semantics are reliable enough to serve as the authority, or any gaps will be surfaced during planning as prerequisites.
- Physical Bluetooth/headphone/hardware control validation requires the actual Sony device and relevant accessories.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2, R8][Needs research] Which Android media-control APIs and foreground/service behaviors are required for reliable screen-off control on the Sony’s Android version?
- [Affects R3, R4][Technical] What playback metadata is already available to the WebView or daemon, and what minimal additions are needed for Android system surfaces?
- [Affects R5, R6, R7][Technical] What is the safest reconciliation rule when Android receives a control action while Pyxis is reconnecting, paused, errored, or unreachable?
- [Affects R10][Technical] What logging or validation evidence should be captured during Sony hardware testing to prove each control path works?
