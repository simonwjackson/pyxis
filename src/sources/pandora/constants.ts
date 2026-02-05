/**
 * @module pandora/constants
 * Pandora API configuration constants including device credentials and endpoint URLs.
 */

import type { DeviceKey } from "./types/config.js"

/**
 * Base URL for Pandora's JSON API endpoint.
 * All API calls are made to this endpoint with method names appended.
 */
export const PANDORA_API_URL = "https://tuner.pandora.com/services/json/"

/**
 * Android device credentials for partner authentication.
 * These are publicly known device credentials used to authenticate as an Android client.
 * Required for the two-step authentication flow (partner login → user login).
 */
export const ANDROID_DEVICE: DeviceKey = {
  username: "android",
  password: "AC7IBG09A3DTSYM4R41UJWL07VLN8JI7",
  deviceId: "android-generic",
  encryptKey: "6#26FRL$ZWD",
  decryptKey: "R=U!LH$O2B#"
}
