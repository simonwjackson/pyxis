---
date: 2026-05-24
topic: sony-android-kiosk-apk
---

# Sony Android Kiosk APK Requirements

## Summary

Build a Sony Walkman NW-A306–targeted Pyxis Android APK that behaves like a dedicated music appliance: it launches into the ZAO-hosted Pyxis instance over local Wi-Fi/LAN, recovers cleanly when that instance is unavailable, and supports full device-owner kiosk provisioning for the MVP.

---

## Problem Frame

Pyxis already has a web/PWA surface, but the PWA experience has been flaky enough that it does not feel like a first-class dedicated music device. The desired near-term experience is closer to turning the Sony Walkman into a dependable Pyxis endpoint than asking the user to manage browser state, install quirks, or PWA relaunch behavior.

The first target device is the Sony Walkman NW-A306. iKKO and generic Android support remain future considerations, but this requirements pass should not dilute the first proof across multiple devices. The core pain to remove is uncertainty at launch: when the device is picked up, it should predictably open Pyxis, show an understandable recovery path if ZAO is unreachable, and avoid fragile PWA behavior.

---

## Actors

- A1. Device user: Uses the Sony Walkman as a dedicated Pyxis playback/control surface.
- A2. Device provisioner: Installs, provisions, recovers, and updates the APK during development.
- A3. Sony Walkman NW-A306: The first Android device profile and validation target.
- A4. ZAO Pyxis instance: The existing Pyxis server and web app the APK connects to over local Wi-Fi/LAN.

---

## Key Flows

- F1. Provision Sony as a Pyxis kiosk
  - **Trigger:** The device provisioner prepares the Sony Walkman for the MVP test.
  - **Actors:** A2, A3
  - **Steps:** The provisioner starts from a clean or resettable Sony device, installs the debug APK, provisions the APK as the device-owner kiosk app, and confirms there is a documented escape/recovery path.
  - **Outcome:** The Sony can be used as a dedicated Pyxis device without relying on normal browser/PWA setup.
  - **Covered by:** R1, R2, R3, R9, R10

- F2. Launch into Pyxis on ZAO
  - **Trigger:** The device user wakes, boots, or returns home on the Sony Walkman.
  - **Actors:** A1, A3, A4
  - **Steps:** The APK opens in fullscreen kiosk posture, attempts to load the hardcoded ZAO Pyxis URL over the local network, and presents the Pyxis web app when reachable.
  - **Outcome:** The user lands in Pyxis without choosing a browser, entering a URL, or managing PWA state.
  - **Covered by:** R2, R4, R5, R6

- F3. Recover from unreachable ZAO
  - **Trigger:** The APK cannot reach the configured ZAO Pyxis instance.
  - **Actors:** A1, A3, A4
  - **Steps:** The APK stops showing a blank or generic browser failure, presents a simple branded reconnect screen, shows enough context to understand what it is trying to reach, and lets the user retry.
  - **Outcome:** The user has an understandable recovery path while remaining inside the dedicated Pyxis shell.
  - **Covered by:** R4, R7, R8

---

## Requirements

**Target and packaging**
- R1. The MVP APK must target the Sony Walkman NW-A306 as the first supported and validated Android device.
- R2. The APK must be usable as a dedicated Pyxis launcher/kiosk app, not merely as a browser shortcut.
- R3. The MVP may be debug-only and personally configured, but it must clearly identify any hardcoded or temporary development assumptions.

**ZAO connectivity**
- R4. The APK must load the ZAO-hosted Pyxis instance over the same local Wi-Fi/LAN using a hardcoded URL for the MVP.
- R5. The hardcoded ZAO URL must be treated as a temporary MVP constraint, not as the long-term configuration model.
- R6. Successful launch must take the user directly to the Pyxis web app without requiring browser selection, URL entry, or PWA installation steps.

**Failure and recovery**
- R7. When the configured ZAO instance cannot be reached, the APK must show a simple branded reconnect screen rather than a blank WebView or generic browser error.
- R8. The reconnect state must give the user a clear retry action and enough visible context to understand that the APK is trying to reach the configured Pyxis instance.

**Kiosk behavior**
- R9. The MVP must pursue full device-owner kiosk behavior for the Sony target, including the expectation that clean provisioning or factory reset may be required.
- R10. The kiosk path must include a documented recovery or release path suitable for development so the provisioner can regain control of the device if the APK misbehaves.
- R11. Fullscreen/dedicated-device behavior should be prioritized over generic Android distribution polish for this MVP.

**Future compatibility posture**
- R12. The Sony-first MVP should avoid unnecessary choices that would prevent later support for iKKO or generic Android devices.
- R13. The APK should be shaped so later device-specific UI iteration can happen without redefining the MVP's core launch/connect/recover contract.

---

## Acceptance Examples

- AE1. **Covers R4, R6.** Given the Sony is connected to the same LAN as ZAO and the Pyxis instance is reachable, when the user launches or returns home to the APK, the Pyxis web app loads directly inside the dedicated app surface.
- AE2. **Covers R7, R8.** Given the Sony is offline or ZAO is unavailable, when the APK attempts to load Pyxis, the user sees a Pyxis-branded reconnect state with a retry action instead of a blank screen or generic browser error.
- AE3. **Covers R9, R10.** Given the Sony has been cleanly provisioned for Device Owner, when the APK enters kiosk mode, the provisioner can still follow documented development recovery steps if the device needs to be released or reprovisioned.
- AE4. **Covers R3, R5.** Given the debug APK contains a hardcoded ZAO URL, when a maintainer inspects the MVP behavior or documentation, the hardcoding is visible as a temporary personal/development constraint.

---

## Success Criteria

- The Sony Walkman reliably behaves like a dedicated Pyxis appliance for the local ZAO instance during normal launch, wake, and home-return use.
- The user is never stranded on an unexplained blank or generic WebView failure when ZAO is unreachable.
- Device-owner/kiosk provisioning is proven on the Sony with a known development recovery path.
- A downstream planning agent can distinguish MVP scope from future work: ZAO hardcoding and Sony-first targeting are intentional short-term constraints, while offline sync and multi-device polish are deferred.

---

## Scope Boundaries

- Music synchronization and offline library support are deferred.
- Automatic server discovery, saved instances, QR setup, and editable server configuration are deferred.
- Tailscale/VPN or roaming connectivity is deferred; MVP assumes same local Wi-Fi/LAN.
- iKKO-specific support is deferred, despite prior exploration proving related kiosk mechanics.
- Generic Android distribution polish, app-store readiness, signing/release workflows, and production update channels are deferred.
- Native media-control polish, lockscreen/notification controls, and background-playback improvements are secondary unless required for basic kiosk viability.
- Reworking the Pyxis web UI is out of scope for this requirements pass, except where minor adjustments are necessary to function inside the Android shell.

---

## Key Decisions

- Sony first: Targeting one real device keeps the MVP concrete and testable while still leaving room for later iKKO support.
- Native APK over PWA-first: The PWA has been unreliable, and the desired appliance experience needs native launch/kiosk control.
- Hardcoded ZAO URL for MVP: This is acceptable because the first proof is personal and development-oriented, as long as the temporary nature is explicit.
- Full device-owner kiosk from MVP: The goal is to prove a dedicated music-device posture, not only a normal Android app wrapper.
- Simple reconnect screen: Reliability includes understandable failure recovery, but diagnostics and setup flows can wait.

---

## Dependencies / Assumptions

- A Sony Walkman NW-A306 is available for installation, reset/provisioning, and validation.
- Factory reset or clean Device Owner provisioning is acceptable for the MVP.
- The ZAO Pyxis instance is reachable from the Sony over the same local Wi-Fi/LAN during normal use.
- The exact ZAO hostname/IP and port will be known during implementation.
- Prior iKKO sandbox work can inform kiosk mechanics, but Sony behavior must be validated directly on the Sony.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Technical] What exact ZAO URL should the debug APK use, and how should it be visibly marked as temporary?
- [Affects R9, R10][Needs research] What Sony NW-A306 Android version, provisioning constraints, and device-owner limitations apply on the actual device?
- [Affects R7, R8][Technical] What load-failure signals are reliable enough to trigger the reconnect screen without hiding recoverable page loads?
- [Affects R12, R13][Technical] What is the smallest device-profile seam needed now to avoid hard-coding Sony assumptions everywhere without overbuilding multi-device support?
