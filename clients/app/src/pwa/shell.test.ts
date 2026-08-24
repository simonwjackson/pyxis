import { afterEach, describe, expect, test, vi } from "vitest"
import { isShellAsset, navigationShellResponse, shellCacheName } from "./shell"

afterEach(() => {
  vi.useRealTimers()
})

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

  test("uses the network response when navigation completes promptly", async () => {
    const cached = vi.fn(async () => new Response("cached"))

    const response = await navigationShellResponse(async () => new Response("network"), cached, 25)

    expect(await response.text()).toBe("network")
    expect(cached).not.toHaveBeenCalled()
  })

  test("falls back when an airplane-mode navigation never settles", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const responsePromise = navigationShellResponse(
      (nextSignal) => {
        signal = nextSignal
        return new Promise<Response>(() => undefined)
      },
      async () => new Response("cached"),
      25,
    )

    await vi.advanceTimersByTimeAsync(25)
    const response = await responsePromise

    expect(signal?.aborted).toBe(true)
    expect(await response.text()).toBe("cached")
  })

  test("reports an unavailable shell only when network and cache both fail", async () => {
    const response = await navigationShellResponse(
      async () => {
        throw new Error("offline")
      },
      async () => undefined,
      25,
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toContain("shell is unavailable")
  })
})
