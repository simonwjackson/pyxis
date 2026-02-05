/**
 * @module pandora/crypto
 *
 * Blowfish ECB encryption/decryption for Pandora API communication.
 * Pandora requires all authenticated API payloads to be encrypted using
 * Blowfish ECB mode with hex output. Partner login returns encrypted
 * sync time that must be decrypted to calculate the time offset.
 */
import { Effect } from "effect"
import { blowfish } from "./blowfish.js"
import { EncryptionError, DecryptionError } from "../types/errors.js"

/** Blowfish ECB cipher mode constant */
const CIPHER_MODE_ECB = 0 as const
/** Hex string output type constant */
const OUTPUT_TYPE_HEX = 1 as const

/**
 * Creates an encryption function using Blowfish ECB with the given key.
 *
 * @param key - Blowfish encryption key (from device constants)
 * @returns Curried function that encrypts text to hex string
 *
 * @example
 * ```ts
 * const encrypted = yield* encrypt(ANDROID_DEVICE.encryptKey)("plaintext");
 * ```
 *
 * @effect
 * - Success: string - hex-encoded encrypted ciphertext
 * - Error: EncryptionError - when encryption fails
 */
export const encrypt = (key: string) => (text: string): Effect.Effect<string, EncryptionError> =>
  Effect.try({
    try: () => {
      const result = blowfish.encrypt(text, key, {
        cipherMode: CIPHER_MODE_ECB,
        outputType: OUTPUT_TYPE_HEX
      })
      if (typeof result !== "string") {
        throw new Error("Unexpected non-string result from blowfish.encrypt")
      }
      return result
    },
    catch: (cause) => new EncryptionError({ message: "Failed to encrypt", cause })
  })

/**
 * Serializes data to JSON and encrypts it using Blowfish ECB.
 * This is the primary method for encrypting API request payloads.
 *
 * @param key - Blowfish encryption key (from device constants)
 * @returns Curried function that serializes and encrypts data to hex string
 *
 * @example
 * ```ts
 * const body = yield* encryptJson(ANDROID_DEVICE.encryptKey)({
 *   username: "user",
 *   password: "pass"
 * });
 * ```
 *
 * @effect
 * - Success: string - hex-encoded encrypted JSON payload
 * - Error: EncryptionError - when JSON serialization or encryption fails
 */
export const encryptJson = (key: string) => (data: unknown): Effect.Effect<string, EncryptionError> =>
  Effect.try({
    try: () => JSON.stringify(data),
    catch: (cause) => new EncryptionError({ message: "Failed to serialize JSON", cause })
  }).pipe(
    Effect.flatMap(encrypt(key))
  )

/**
 * Creates a decryption function using Blowfish ECB with the given key.
 * Used primarily to decrypt the sync time from partner login response.
 *
 * @param key - Blowfish decryption key (from device constants)
 * @returns Curried function that decrypts hex string to plaintext
 *
 * @example
 * ```ts
 * const decrypted = yield* decrypt(ANDROID_DEVICE.decryptKey)(encryptedSyncTime);
 * const serverTime = parseInt(decrypted.slice(4), 10);
 * ```
 *
 * @effect
 * - Success: string - decrypted plaintext
 * - Error: DecryptionError - when decryption fails
 */
export const decrypt = (key: string) => (text: string): Effect.Effect<string, DecryptionError> =>
  Effect.try({
    try: () => blowfish.decrypt(text, key, {
      cipherMode: CIPHER_MODE_ECB,
      outputType: OUTPUT_TYPE_HEX
    }),
    catch: (cause) => new DecryptionError({ message: "Failed to decrypt", cause })
  })
