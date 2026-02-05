/**
 * @module pandora/types/config
 * Configuration types for Pandora API authentication.
 */

/**
 * User credentials for Pandora authentication.
 */
export type PandoraConfig = {
  /** Pandora account email or username */
  readonly username: string
  /** Pandora account password */
  readonly password: string
}

/**
 * Device credentials for partner authentication.
 * These credentials identify the client type (e.g., Android) and provide
 * the Blowfish encryption keys for API communication.
 */
export type DeviceKey = {
  /** Partner username (e.g., "android") */
  readonly username: string
  /** Partner password (device-specific) */
  readonly password: string
  /** Device identifier string */
  readonly deviceId: string
  /** Blowfish key for encrypting API request payloads */
  readonly encryptKey: string
  /** Blowfish key for decrypting API response data (e.g., syncTime) */
  readonly decryptKey: string
}
