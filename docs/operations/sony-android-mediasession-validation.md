# Sony Android MediaSession Validation

This checklist validates the native Android MediaSession bridge on the Sony Walkman NW-A306. It is separate from general kiosk provisioning because these checks prove system media behavior, not just WebView launch behavior.

## Bridge setup

Use the same non-URL token on the Pyxis daemon and Android build. Do not place the token in URLs or logs.

```bash
export PYXIS_ANDROID_BRIDGE_ENABLED=1
export PYXIS_ANDROID_BRIDGE_TOKEN='<local-dev-token>'

bun run dev:server
just android-build
just android-install
adb shell am start -n com.simonwjackson.pyxis.kiosk/.MainActivity
```

Confirm the daemon bridge is guarded:

```bash
curl -i http://192.168.1.243:8765/android-media-bridge/state
curl -i -H "X-Pyxis-Bridge-Token: $PYXIS_ANDROID_BRIDGE_TOKEN" \
  http://192.168.1.243:8765/android-media-bridge/state
```

Expected: the first request is unauthorized/not exposed; the second returns JSON with `status`, `availability`, `stateRevision`, and no stream URL.

## Android diagnostics

```bash
adb shell dumpsys activity services com.simonwjackson.pyxis.kiosk | grep PyxisMediaSessionService
adb shell dumpsys media_session | grep -A20 -i pyxis
adb shell cmd media_session dispatch play
adb shell cmd media_session dispatch pause
adb shell input keyevent KEYCODE_MEDIA_PLAY_PAUSE
adb shell input keyevent KEYCODE_MEDIA_NEXT
adb shell input keyevent KEYCODE_MEDIA_PREVIOUS
```

Record whether each command reaches Pyxis, updates daemon state, and wakes the WebView into matching visible state.

## Required pass/fail scenarios

- [ ] **AE1 Bluetooth pause with screen off:** start Pyxis playback, turn screen off, wait at least 15 minutes, press Bluetooth pause, then confirm Pyxis daemon and Android media state become paused.
- [ ] **AE2 Lockscreen/notification play:** from the visible Android media surface, press play/resume and confirm Pyxis resumes without restarting the track.
- [ ] **AE3 Metadata advance:** press next and confirm Android title/artist/album replace the previous track metadata.
- [ ] **AE4 Stale/degraded state:** stop Pyxis daemon or break Wi-Fi and confirm Android media state disables/degrades controls rather than presenting healthy stale playback.
- [ ] **AE5 Wake consistency:** after screen-off native control, wake into the kiosk and confirm WebView state matches the native action outcome.

## Abuse and recovery checks

- [ ] Missing or invalid bridge token cannot read state, subscribe to events, send commands, or write native logs.
- [ ] Browser-origin/cross-origin attempts without the bridge token are rejected before payload parsing.
- [ ] Command storms are rate-limited and visible in server logs.
- [ ] Native logs redact token-, credential-, and URL-shaped fields.
- [ ] Unknown Android controller apps cannot escape kiosk mode or access non-media commands.
- [ ] Notification shade, lockscreen, recents, home, back, package replacement, reboot, and recovery paths match the selected Device Owner policy.

## Evidence to capture

- `tail -200 ~/.local/state/pyxis/playback.log`
- `tail -200 ~/.local/state/pyxis/server.log`
- `adb logcat -d | grep -i Pyxis`
- `adb shell dumpsys media_session`
- `adb shell dumpsys activity services com.simonwjackson.pyxis.kiosk`

Do not mark the MediaSession bridge complete for Sony use unless all required pass/fail scenarios have recorded evidence or the product requirement is revised.
