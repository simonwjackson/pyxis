import { describe, expect, test, vi } from "vitest"
import { createUpdateWatcher } from "./updates"

const shell = (bundle: string) =>
  `<!doctype html><html><body><script type="module" src="/${bundle}"></script></body></html>`

function serving(...bodies: string[]): {
  fetch: typeof fetch
  calls: () => number
  requests: RequestInit[]
} {
  let call = 0
  const requests: RequestInit[] = []
  const impl = (async (_url: string, init?: RequestInit) => {
    requests.push(init ?? {})
    const body = bodies[Math.min(call, bodies.length - 1)] ?? ""
    call += 1
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } })
  }) as unknown as typeof fetch
  return { fetch: impl, calls: () => call, requests }
}

describe("noticing a new build", () => {
  test("says nothing while the server serves the bundle this page is running", async () => {
    const server = serving(shell("assets/index-aaa111.js"))
    const watcher = createUpdateWatcher({
      fetch: server.fetch,
      current: "assets/index-aaa111.js",
      intervalMs: 5,
    })
    const onUpdate = vi.fn()

    const stop = watcher.start(onUpdate)
    await vi.waitFor(() => expect(server.calls()).toBeGreaterThan(0))
    stop()

    expect(onUpdate).not.toHaveBeenCalled()
  })

  test("reports once when the served bundle changes", async () => {
    const server = serving(shell("assets/index-aaa111.js"), shell("assets/index-bbb222.js"))
    const watcher = createUpdateWatcher({
      fetch: server.fetch,
      current: "assets/index-aaa111.js",
      intervalMs: 1,
    })
    const onUpdate = vi.fn()

    const stop = watcher.start(onUpdate)
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    const settled = server.calls()
    await new Promise((resolve) => setTimeout(resolve, 20))
    stop()

    // Reporting repeatedly would be noise, and polling after the answer is known is waste.
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(server.calls()).toBe(settled)
  })

  test("reads the shell rather than whatever the browser kept", async () => {
    const server = serving(shell("assets/index-aaa111.js"))
    const watcher = createUpdateWatcher({
      fetch: server.fetch,
      current: "assets/index-aaa111.js",
      intervalMs: 5,
    })

    const stop = watcher.start(() => undefined)
    await vi.waitFor(() => expect(server.calls()).toBeGreaterThan(0))
    stop()

    expect(server.requests[0]?.cache).toBe("no-store")
  })

  test("a failed check is not an update", async () => {
    const failing = (async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    const watcher = createUpdateWatcher({
      fetch: failing,
      current: "assets/index-aaa111.js",
      intervalMs: 1,
    })
    const onUpdate = vi.fn()

    const stop = watcher.start(onUpdate)
    await new Promise((resolve) => setTimeout(resolve, 20))
    stop()

    expect(onUpdate).not.toHaveBeenCalled()
  })

  test("without knowing its own bundle, the first answer becomes the baseline", async () => {
    const server = serving(shell("assets/index-aaa111.js"), shell("assets/index-bbb222.js"))
    // No `current`, as on a build whose module URL names no hashed bundle.
    const watcher = createUpdateWatcher({ fetch: server.fetch, intervalMs: 1 })
    const onUpdate = vi.fn()

    const stop = watcher.start(onUpdate)
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    stop()

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
