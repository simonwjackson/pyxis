# Sony Android Kiosk Provisioning

This runbook is for the Sony Walkman NW-A306 MVP debug APK. The APK is a personal development build that targets the Pyxis server on this machine at `http://192.168.1.243:8765/`.

## Safety posture

- This is a debug/test-only kiosk flow, not a production release process.
- Device Owner provisioning can make the Sony difficult to escape if recovery has not been prepared.
- Prove the pre-lockdown checks below before running `dpm set-device-owner`.
- Recovery must not depend on Wi-Fi, ZAO, or the Pyxis WebView loading.

## Pre-lockdown checks

Before Device Owner validation:

1. Confirm the provisioner machine is trusted for USB debugging.
2. Confirm the Sony hardware factory reset or recovery-mode path is available.
3. Confirm the Pyxis server is reachable from another LAN device at `http://192.168.1.243:8765/`.
4. Confirm `http://192.168.1.243:8765/healthz` returns the Pyxis health marker.
5. Confirm the debug APK can be installed and launched as a normal app before kiosk provisioning.

If any check fails, do not proceed to Device Owner provisioning.

Use `docs/operations/sony-android-kiosk-validation.md` to record pass/fail notes during device bring-up.

## Build and install

Build the debug APK:

```bash
just android-build
```

Install on a connected Sony device:

```bash
just android-install
```

The debug APK path is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Device Owner provisioning

Start from a clean or reset Sony device:

1. Factory reset the Sony Walkman NW-A306.
2. Complete setup without adding a Google account.
3. Enable Developer Options.
4. Enable USB debugging.
5. Install the debug APK.
6. Set Pyxis as Device Owner:

```bash
adb shell dpm set-device-owner com.simonwjackson.pyxis.kiosk/.PyxisDeviceAdminReceiver
```

Verify ownership:

```bash
adb shell dpm list-owners
```

If provisioning fails because accounts or extra users exist, factory reset and repeat setup while skipping account sign-in.

## Development update path

For normal debug iteration, keep the package name, signing key, Device Admin receiver, and launcher component stable. Then reinstall over the existing app:

```bash
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
```

If the package name, signing key, Device Admin receiver, or launcher component changes, assume recovery may require deprovisioning or factory reset.

## ADB recovery path

Preferred debug recovery is USB ADB from the trusted provisioner machine:

```bash
adb shell dpm remove-active-admin com.simonwjackson.pyxis.kiosk/.PyxisDeviceAdminReceiver
adb shell pm uninstall com.simonwjackson.pyxis.kiosk
```

If WebView state appears stale or poisoned during development, clear app data or reinstall after deprovisioning:

```bash
adb shell pm clear com.simonwjackson.pyxis.kiosk
adb install -r -t android/app/build/outputs/apk/debug/app-debug.apk
```

Validate these commands while the device is still recoverable. Do not rely on network debugging for MVP recovery.

## Factory reset fallback

If ADB is unavailable or Device Owner cannot be removed, use the Sony hardware factory reset or recovery-mode path confirmed during pre-lockdown checks.

Factory reset is an acceptable MVP fallback, but it should not be the first recovery path during development.

## Debug-only assumptions

- The target URL is hardcoded to `http://192.168.1.243:8765/`.
- LAN HTTP is trusted for this MVP only.
- The APK is not ready for app-store distribution.
- Production signing, non-test-only recovery posture, and update channels are deferred.
