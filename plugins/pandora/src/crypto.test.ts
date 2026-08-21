import { describe, expect, test } from "bun:test"
import { Blowfish } from "egoroof-blowfish"
import { decrypt, encrypt, encryptJson } from "./crypto"

describe("Pandora Blowfish ECB", () => {
  test("matches the standard zero-key Blowfish vector", () => {
    const key = new Uint8Array(8)
    const plaintext = new Uint8Array(8)
    const cipher = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.NULL)

    expect(Buffer.from(cipher.encode(plaintext)).toString("hex").toUpperCase()).toBe(
      "4EF997456198DD78",
    )
  })

  test("round trips UTF-8 and strips only null padding", () => {
    const encrypted = encrypt("test-key", "Hello 世界")

    expect(decrypt("test-key", encrypted)).toBe("Hello 世界")
  })

  test("JSON encryption is lowercase hexadecimal", () => {
    expect(encryptJson("test-key", { username: "user", password: "secret" })).toMatch(/^[0-9a-f]+$/)
  })
})
