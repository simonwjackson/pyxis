import { afterAll, beforeAll, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { RPC_CONTRACT_ID } from "../../../contracts/generated/pyxis"
import { PyxisClient } from "../src/pyxis-client"
import { startHarness } from "./harness"

let h: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  h = await startHarness()
})
afterAll(async () => {
  await h?.close()
})
const uri = "pyxis://now-playing"
const listen = {
  notifications: { resourcesListChanged: true, resourceSubscriptions: [uri, "pyxis://tags"] },
}

// Observe actual ESTABLISHED sockets to this isolated core (not an adapter counter).
async function corePeers() {
  const port = Number(h.baseUrl.port).toString(16).toUpperCase().padStart(4, "0")
  return (await readFile("/proc/net/tcp", "utf8"))
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([, local, , state]) => local === `0100007F:${port}` && state === "01")
    .map((row) => row[2])
}
async function* messages(response: Response) {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
    throw Error(await response.text())
  let pending = ""
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const { value: chunk, done } = await reader.read()
    if (done) return
    pending += chunk
    let end = pending.indexOf("\n\n")
    while (end !== -1) {
      const line = pending
        .slice(0, end)
        .split("\n")
        .find((l) => l.startsWith("data: "))
      pending = pending.slice(end + 2)
      if (line) yield JSON.parse(line.slice(6))
      end = pending.indexOf("\n\n")
    }
  }
}
test("listen acknowledges only supported URIs, gates on Pyxis scope, and never opens a watcher for an empty filter", async () => {
  const denied = await h.owner.call({
    _tag: "auth.token.create",
    payload: { name: "no session access", scopes: ["library:read"] },
  })
  if (denied.status !== "ready") throw Error(denied.status)
  expect(
    await (
      await h.post("subscriptions/listen", listen, { token: denied.value.bearerToken })
    ).json(),
  ).toMatchObject({ error: { data: { code: "auth.insufficientScope" } } })
  const stream = messages(
    await h.post("subscriptions/listen", {
      notifications: { resourceSubscriptions: ["pyxis://tags"] },
    }),
  )
  expect((await stream.next()).value).toMatchObject({
    method: "notifications/subscriptions/acknowledged",
    params: { notifications: {} },
  })
  expect((await stream.next()).value).toMatchObject({ result: { resultType: "complete" } })
  expect((await stream.next()).done).toBe(true)
})

test("one invalidation per session revision, with the Pyxis socket released on HTTP disconnect", async () => {
  const cancel = new AbortController()
  const host = new WebSocket(new URL("/realtime", h.baseUrl).href.replace(/^http/, "ws"))
  try {
    await new Promise<void>((resolve, reject) => {
      host.onopen = () =>
        host.send(
          JSON.stringify({
            _tag: "realtime.hello",
            payload: { contractId: RPC_CONTRACT_ID, bearerToken: h.device.bearerToken, topics: [] },
          }),
        )
      host.onmessage = (e) =>
        JSON.parse(e.data)._tag === "realtime.welcome" ? resolve() : reject(Error("No welcome"))
      host.onerror = () => reject(Error("Host socket failed"))
    })
    await h.post("server/discover").then((r) => r.json()) // warm the RPC connection before measuring
    const before = await corePeers()
    const stream = messages(await h.post("subscriptions/listen", listen, { signal: cancel.signal }))
    const ack = (await stream.next()).value
    expect(ack.method).toBe("notifications/subscriptions/acknowledged")
    expect(ack.params.notifications).toEqual({ resourceSubscriptions: [uri] })
    const observer = (await corePeers()).filter((peer) => !before.includes(peer))
    expect(observer).toHaveLength(1)
    async function update(id: string, revision: number) {
      expect((await stream.next()).value).toMatchObject({
        method: "notifications/resources/updated",
        params: {
          uri,
          _meta: { ...ack.params._meta, "pyxis.dev/sessionId": id, "pyxis.dev/revision": revision },
        },
      })
    }
    const session = await h.owner.call({ _tag: "session.create", payload: { name: "Test host" } })
    if (session.status !== "ready") throw Error(session.status)
    const { id, revision } = session.value
    await update(id, revision)
    const snapshot = await (await h.post("resources/read", { uri })).json()
    const tool = await (await h.post("tools/call", { name: "session.list", arguments: {} })).json()
    const state = JSON.parse(snapshot.result.contents[0].text)
    expect(state).toEqual(tool.result.structuredContent)
    expect(state.sessions).toContainEqual(expect.objectContaining({ id, revision }))
    // A host departure publishes the same session revision. The next new revision must
    // be the next notification, not a second invalidation for the departure.
    host.close()
    for (let i = 0; i < 100; i++) {
      const state = await h.owner.call({ _tag: "session.state.get", payload: { sessionId: id } })
      if (state.status === "ready" && !state.value.reachable) break
      await Bun.sleep(10)
    }
    for (const volume of [15, 20]) {
      const result = await h.owner.call({
        _tag: "session.command.run",
        payload: { sessionId: id, command: { _tag: "volume.set", payload: { volume } } },
      })
      if (result.status !== "applied") throw Error(result.status)
      await update(id, result.value.revision)
    }
    cancel.abort()
    for (let i = 0; i < 100 && (await corePeers()).includes(observer[0]); i++) await Bun.sleep(10)
    expect(await corePeers()).not.toContain(observer[0])
  } finally {
    cancel.abort()
    host.close()
  }
})

test("two account streams observing the same URI only deliver their own session revisions", async () => {
  const account = await h.owner.call({
    _tag: "account.create",
    payload: { name: "Guest", deviceName: "Guest host" },
  })
  if (account.status !== "ready") throw Error(account.status)
  const guest = new PyxisClient(h.baseUrl, `Bearer ${account.value.bearerToken}`)
  const token = await guest.call({
    _tag: "auth.token.create",
    payload: { name: "guest agent", scopes: ["session:read"] },
  })
  if (token.status !== "ready") throw Error(token.status)
  const stop = new AbortController()
  try {
    const a = messages(await h.post("subscriptions/listen", listen, { signal: stop.signal }))
    const b = messages(
      await h.post("subscriptions/listen", listen, {
        signal: stop.signal,
        token: token.value.bearerToken,
      }),
    )
    for (const stream of [a, b])
      expect((await stream.next()).value.method).toBe("notifications/subscriptions/acknowledged")
    for (const [owner, stream] of [
      [h.owner, a],
      [guest, b],
    ] as const) {
      const session = await owner.call({
        _tag: "session.create",
        payload: { name: "Private session" },
      })
      if (session.status !== "ready") throw Error(session.status)
      expect((await stream.next()).value.params._meta["pyxis.dev/sessionId"]).toBe(session.value.id)
    }
  } finally {
    stop.abort()
  }
})
