import { describe, expect, test } from "vitest"
import { isShellAsset, shellCacheName } from "./shell"

describe("PWA shell identity", () => {
  test("is stable across manifest ordering and changes with content", () => {
    expect(shellCacheName(["/", "/assets/a.js"])).toBe(shellCacheName(["/assets/a.js", "/"]))
    expect(shellCacheName(["/", "/assets/a.js"])).not.toBe(shellCacheName(["/", "/assets/b.js"]))
  })

  test("recognises only injected immutable assets", () => {
    const assets = new Set(["/assets/a.js", "/manifest.webmanifest"])
    expect(isShellAsset("/assets/a.js", assets)).toBe(true)
    expect(isShellAsset("/rpc", assets)).toBe(false)
  })
})
