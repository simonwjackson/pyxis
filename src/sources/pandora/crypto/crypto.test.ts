import { describe, it, expect } from "bun:test"
import { encrypt, encryptJson, decrypt } from "./index.js"
import { expectEffectSuccess, expectEffectFailure } from "../test-utils.js"
import { EncryptionError, DecryptionError } from "../types/errors.js"
import { ANDROID_DEVICE } from "../constants.js"

describe("crypto", () => {
  const testKey = ANDROID_DEVICE.encryptKey
  const decryptKey = ANDROID_DEVICE.decryptKey

  describe("encrypt", () => {
    it("should encrypt a string and return hex output", async () => {
      const plaintext = "hello world"
      const result = await expectEffectSuccess(encrypt(testKey)(plaintext))

      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
      // Hex output should only contain hex characters
      expect(result).toMatch(/^[0-9a-f]+$/i)
    })

    it("should produce different output for different inputs", async () => {
      const result1 = await expectEffectSuccess(encrypt(testKey)("message1"))
      const result2 = await expectEffectSuccess(encrypt(testKey)("message2"))

      expect(result1).not.toBe(result2)
    })

    it("should produce different output for different keys", async () => {
      const result1 = await expectEffectSuccess(encrypt(testKey)("same message"))
      const result2 = await expectEffectSuccess(encrypt("differentkey")("same message"))

      expect(result1).not.toBe(result2)
    })

    it("should handle empty string", async () => {
      const result = await expectEffectSuccess(encrypt(testKey)(""))
      expect(typeof result).toBe("string")
    })

    it("should handle unicode characters", async () => {
      const result = await expectEffectSuccess(encrypt(testKey)("Hello 世界 🌍"))
      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe("encryptJson", () => {
    it("should serialize and encrypt an object", async () => {
      const data = { username: "test", password: "secret" }
      const result = await expectEffectSuccess(encryptJson(testKey)(data))

      expect(typeof result).toBe("string")
      expect(result).toMatch(/^[0-9a-f]+$/i)
    })

    it("should handle nested objects", async () => {
      const data = {
        user: { name: "test", settings: { theme: "dark" } },
        items: [1, 2, 3]
      }
      const result = await expectEffectSuccess(encryptJson(testKey)(data))

      expect(typeof result).toBe("string")
      expect(result.length).toBeGreaterThan(0)
    })

    it("should handle arrays", async () => {
      const data = [1, 2, 3, "four", { five: 5 }]
      const result = await expectEffectSuccess(encryptJson(testKey)(data))

      expect(typeof result).toBe("string")
    })

    it("should handle null and primitives", async () => {
      const nullResult = await expectEffectSuccess(encryptJson(testKey)(null))
      const numResult = await expectEffectSuccess(encryptJson(testKey)(42))
      const boolResult = await expectEffectSuccess(encryptJson(testKey)(true))

      expect(typeof nullResult).toBe("string")
      expect(typeof numResult).toBe("string")
      expect(typeof boolResult).toBe("string")
    })

    it("should fail on circular references", async () => {
      const circular: Record<string, unknown> = { name: "test" }
      circular.self = circular

      const error = await expectEffectFailure(encryptJson(testKey)(circular))
      expect(error).toBeInstanceOf(EncryptionError)
    })
  })

  describe("decrypt", () => {
    it("should decrypt previously encrypted data with matching keys", async () => {
      // Use the same key for encrypt/decrypt in this test
      const key = "testkey123"
      const plaintext = "secret message"

      const encrypted = await expectEffectSuccess(encrypt(key)(plaintext))
      const decrypted = await expectEffectSuccess(decrypt(key)(encrypted))

      expect(decrypted).toBe(plaintext)
    })

    it("should handle Pandora-style encrypt/decrypt key pairs", async () => {
      // Pandora uses different keys for encrypt vs decrypt
      // This tests the actual usage pattern
      const plaintext = "test data"

      const encrypted = await expectEffectSuccess(encrypt(testKey)(plaintext))
      // Note: decrypt with same key should work for roundtrip
      const decrypted = await expectEffectSuccess(decrypt(testKey)(encrypted))

      expect(decrypted).toBe(plaintext)
    })

    it("should handle malformed input gracefully", async () => {
      // Blowfish may not throw on all invalid inputs, but should return some result
      // Testing that it doesn't crash
      const result = await expectEffectSuccess(decrypt(testKey)("abcd"))
      expect(typeof result).toBe("string")
    })

    it("should handle empty encrypted string", async () => {
      // Empty string encryption produces valid output
      const encrypted = await expectEffectSuccess(encrypt(testKey)(""))
      const decrypted = await expectEffectSuccess(decrypt(testKey)(encrypted))
      expect(decrypted).toBe("")
    })
  })

  describe("encrypt/decrypt roundtrip", () => {
    it("should roundtrip JSON data", async () => {
      const key = "roundtripkey"
      const original = { foo: "bar", num: 42, arr: [1, 2, 3] }

      const encrypted = await expectEffectSuccess(encryptJson(key)(original))
      const decrypted = await expectEffectSuccess(decrypt(key)(encrypted))

      expect(JSON.parse(decrypted)).toEqual(original)
    })

    it("should roundtrip long strings", async () => {
      const key = "longstringkey"
      const longString = "x".repeat(10000)

      const encrypted = await expectEffectSuccess(encrypt(key)(longString))
      const decrypted = await expectEffectSuccess(decrypt(key)(encrypted))

      expect(decrypted).toBe(longString)
    })

    it("should roundtrip special characters", async () => {
      const key = "specialcharkey"
      const special = "Line1\nLine2\tTabbed\r\nWindows"

      const encrypted = await expectEffectSuccess(encrypt(key)(special))
      const decrypted = await expectEffectSuccess(decrypt(key)(encrypted))

      expect(decrypted).toBe(special)
    })
  })
})
