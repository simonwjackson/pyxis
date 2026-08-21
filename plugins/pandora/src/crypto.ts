import { Blowfish } from "egoroof-blowfish"

export function encrypt(key: string | Uint8Array, plaintext: string | Uint8Array): string {
  const cipher = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.NULL)
  return Buffer.from(cipher.encode(plaintext)).toString("hex")
}

export function decrypt(key: string | Uint8Array, ciphertext: string): string {
  const cipher = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.NULL)
  const bytes = Uint8Array.from(Buffer.from(ciphertext, "hex"))
  return cipher.decode(bytes, Blowfish.TYPE.STRING).replace(/\0+$/u, "")
}

export function encryptJson(key: string, value: unknown): string {
  return encrypt(key, JSON.stringify(value))
}
