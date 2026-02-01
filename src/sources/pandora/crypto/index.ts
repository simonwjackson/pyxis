import { Effect } from "effect"
import { blowfish } from "./blowfish.js"
import { EncryptionError, DecryptionError } from "../types/errors.js"

const CIPHER_MODE_ECB = 0 as const
const OUTPUT_TYPE_HEX = 1 as const

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

export const encryptJson = (key: string) => (data: unknown): Effect.Effect<string, EncryptionError> =>
  Effect.try({
    try: () => JSON.stringify(data),
    catch: (cause) => new EncryptionError({ message: "Failed to serialize JSON", cause })
  }).pipe(
    Effect.flatMap(encrypt(key))
  )

export const decrypt = (key: string) => (text: string): Effect.Effect<string, DecryptionError> =>
  Effect.try({
    try: () => blowfish.decrypt(text, key, {
      cipherMode: CIPHER_MODE_ECB,
      outputType: OUTPUT_TYPE_HEX
    }),
    catch: (cause) => new DecryptionError({ message: "Failed to decrypt", cause })
  })
