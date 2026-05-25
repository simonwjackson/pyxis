# Sony Android Kiosk Validation Checklist

Use this checklist to validate the Pyxis Sony Walkman NW-A306 MVP. Record pass/fail notes before considering the APK ready for Device Owner use.

## Server and LAN readiness

- [ ] From another LAN device, open `http://192.168.1.243:8765/` and confirm the Pyxis web app loads.
- [ ] From another LAN device, open `http://192.168.1.243:8765/healthz` and confirm it returns a minimal Pyxis health marker.
- [ ] Confirm `/trpc` requests from the web app work from the LAN origin.
- [ ] Confirm `/stream` URLs are reachable from the LAN origin.
- [ ] Confirm the host firewall and Pyxis binding allow LAN access before debugging Android WebView behavior.

## Non-owner APK smoke test

- [ ] Build with `just android-build`.
- [ ] Run JVM tests with `just android-test`.
- [ ] Install with `just android-install`.
- [ ] Launch Pyxis Kiosk as a normal app.
- [ ] With ZAO online, confirm the app leaves the native checking state and loads Pyxis.
- [ ] With ZAO offline or port blocked, confirm the native reconnect screen appears with target context and Retry.
- [ ] Restore ZAO, tap Retry, and confirm Pyxis loads.

## Minimum Sony usability path

- [ ] Confirm the WebView fits the Sony NW-A306 screen without browser chrome.
- [ ] Confirm text is readable at the device's default display and font scale.
- [ ] Confirm touch targets for playback controls are usable.
- [ ] Confirm queue/library/search navigation is usable enough for the MVP.
- [ ] Confirm scrolling does not fight the kiosk shell.
- [ ] Confirm the expected orientation behavior on the Sony.
- [ ] Note any Pyxis web UI compatibility fixes required before Device Owner validation.

## Device Owner preflight

- [ ] Confirm USB debugging is authorized from the trusted provisioner machine.
- [ ] Confirm hardware factory reset or recovery-mode access is understood before lockdown.
- [ ] Confirm the provisioning runbook has the current package and receiver names.
- [ ] Confirm ADB recovery commands do not depend on Wi-Fi, ZAO, or WebView loading.

## Device Owner kiosk validation

- [ ] Factory reset or start from a clean account-free Sony device.
- [ ] Install the debug APK.
- [ ] Set Device Owner with the package/receiver from the runbook.
- [ ] Confirm `adb shell dpm list-owners` shows Pyxis as Device Owner.
- [ ] Press HOME and confirm Pyxis is the persistent home surface.
- [ ] Wake the device and confirm it returns to Pyxis.
- [ ] Confirm lock task / status bar / keyguard posture matches MVP expectations.
- [ ] Confirm package update with `adb install -r -t` works while Device Owner is active.

## Recovery validation

- [ ] With Pyxis loaded, deprovision or uninstall through the ADB recovery path.
- [ ] With ZAO offline and the app on reconnect, deprovision or uninstall through the ADB recovery path.
- [ ] With Wi-Fi unavailable or wrong network, document the provisioner recovery path.
- [ ] Clear app/WebView state and confirm reinstall recovers from stale state.
- [ ] Confirm hardware factory reset remains available as fallback under the chosen kiosk posture.

## Known MVP tradeoffs

- The target URL is hardcoded to `http://192.168.1.243:8765/`.
- LAN HTTP is trusted for this MVP and is not a secure transport posture.
- iKKO support, server discovery, editable profiles, and offline sync are deferred.
- Native media-button and lockscreen-control polish are deferred unless Sony validation proves they are required for basic MVP usability.
