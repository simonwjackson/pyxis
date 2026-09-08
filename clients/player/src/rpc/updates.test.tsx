import { describe, expect, test, vi } from "vitest"
import { bundleOf, createUpdateWatcher } from "./updates.ts"

const shell = (bundle: string) =>
  `<!doctype html><html><body><script type="module" src="/${bundle}"></script></body></html>`

function serving(...bodies: string[]) {
  let call = 0
  const requests: RequestInit[] = []
  const request = async (_input: string, init?: RequestInit) => {
    requests.push(init ?? {})
    const body = bodies[Math.min(call, bodies.length - 1)] ?? ""
    call += 1
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } })
  }
  return { request, calls: () => call, requests }
}

describe("noticing a new build", () => {
  test("says nothing while the server serves the bundle this page is running", async () => {
    const server = serving(shell("assets/index-aaa111.js"))
    const watcher = createUpdateWatcher({
      request: server.request,
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
      request: server.request,
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
      request: server.request,
      current: "assets/index-aaa111.js",
      intervalMs: 5,
    })

    const stop = watcher.start(() => {})
    await vi.waitFor(() => expect(server.calls()).toBeGreaterThan(0))
    stop()

    expect(server.requests[0]).toMatchObject({ cache: "no-store" })
  })

  test("learns its own bundle from the first shell when none was given", async () => {
    const server = serving(shell("assets/index-aaa111.js"), shell("assets/index-bbb222.js"))
    const watcher = createUpdateWatcher({ request: server.request, intervalMs: 1 })
    const onUpdate = vi.fn()

    const stop = watcher.start(onUpdate)
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    stop()
  })

  test("names the bundle inside a module url", () => {
    expect(bundleOf("https://pyxis.example.net/assets/index-CoMA-Idw.js")).toBe(
      "assets/index-CoMA-Idw.js",
    )
    expect(bundleOf("https://pyxis.example.net/src/main.tsx")).toBeUndefined()
  })
})
