import { expect, test } from "bun:test"
import { createTransport, withTransportConfig } from "./transport"

test("concurrent reads bootstrap once; retries wait for Retry-After and carry the visitor twice", async () => {
  let now = Date.UTC(2026, 10, 24),
    count = 0
  const times: number[] = []
  const request = createTransport(
    async (url, opts) => {
      times.push(now)
      const body = JSON.parse(String(opts?.body))
      if (String(url).includes("/browse?"))
        return Response.json({ responseContext: { visitorData: "visitor" } })
      expect(new Headers(opts?.headers).get("X-Goog-Visitor-Id")).toBe("visitor")
      expect(body.context.client).toMatchObject({
        visitorData: "visitor",
        clientVersion: "1.20261124.01.00",
      })
      return ++count === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "4" } })
        : Response.json({})
    },
    {
      now: () => now,
      random: () => 0,
      sleep: async (ms) => {
        now += ms
      },
    },
  )
  await withTransportConfig(
    { requestsPerSecond: 1, burstSize: 1 },
    () => Promise.all([request("search", {}), request("next", {})]),
    () => now,
  )
  expect(times).toHaveLength(4)
  expect(Number(times[1]) - Number(times[0])).toBeGreaterThanOrEqual(1000)
  expect(Number(times[3]) - Number(times[1])).toBeGreaterThanOrEqual(4000)
})

test("a long Retry-After returns a retryable failure instead of sleeping beyond the call budget", async () => {
  let requests = 0
  const request = createTransport(
    async () => {
      requests++
      return new Response(null, { status: 429, headers: { "Retry-After": "3600" } })
    },
    {
      now: () => 1234,
      random: () => 0,
      sleep: async () => {
        throw new Error("must not sleep")
      },
    },
  )
  for (let n = 0; n < 2; n++)
    await expect(request("search", {})).rejects.toMatchObject({ retryable: true })
  expect(requests).toBe(1)
})

test("waiters reacquire bucket slots after another caller triggers a cooldown", async () => {
  let now = Date.now()
  const start = now
  const waits: { at: number; resume: () => void }[] = []
  const searchAt: number[] = []
  const request = createTransport(
    async (url) => {
      if (url.pathname.endsWith("/browse"))
        return Response.json({ responseContext: { visitorData: "v" } })
      searchAt.push(now - start)
      return searchAt.length === 1
        ? new Response(null, { status: 429, headers: { "Retry-After": "4" } })
        : Response.json({})
    },
    {
      now: () => now,
      random: () => 0,
      sleep: (ms) => new Promise<void>((resume) => waits.push({ at: now + ms, resume })),
    },
  )
  const done = withTransportConfig({ requestsPerSecond: 1, burstSize: 1 }, () =>
    Promise.all(Array.from({ length: 4 }, () => request("search", {}))),
  )
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve))
    if (!waits.length) break
    now = Math.min(...waits.map((w) => w.at))
    for (const w of waits.filter((w) => w.at === now)) {
      waits.splice(waits.indexOf(w), 1)
      w.resume()
    }
  }
  await done
  expect(searchAt).toEqual([1000, 5000, 6000, 7000, 8000])
})
test("bootstrap time counts toward the operation deadline; a retry that cannot fit keeps the cooldown", async () => {
  let now = Date.now(),
    searches = 0
  const waits: number[] = []
  const request = createTransport(
    async (url) => {
      if (url.pathname.endsWith("/browse")) {
        now += 23000
        return Response.json({ responseContext: { visitorData: "v" } })
      }
      searches++
      return searches === 1
        ? new Response(null, { status: 503, headers: { "Retry-After": "10" } })
        : Response.json({})
    },
    {
      now: () => now,
      random: () => 0,
      sleep: async (ms) => {
        waits.push(ms)
        now += ms
      },
    },
  )
  await expect(request("search", {})).rejects.toMatchObject({ retryable: true })
  expect(searches).toBe(1)
  expect(waits).toEqual([])
  await request("search", {})
  expect(waits).toEqual([10000])
})
test("persistent 503 is retried exactly maxRetries times", async () => {
  let now = Date.now(),
    attempts = 0
  const request = createTransport(
    async () => {
      attempts++
      return new Response(null, { status: 503 })
    },
    {
      now: () => now,
      random: () => 0,
      sleep: async (ms) => {
        now += ms
      },
    },
  )
  await expect(
    withTransportConfig({ maxRetries: 3 }, () => request("search", {})),
  ).rejects.toMatchObject({ code: "ytmusic.http503", retryable: true })
  expect(attempts).toBe(4)
})

test("a second HTTP request within the same capability has only the remaining budget", async () => {
  let now = Date.now(),
    attempts = 0
  const request = createTransport(
    async (url) => {
      if (url.pathname.endsWith("/browse"))
        return Response.json({ responseContext: { visitorData: "v" } })
      attempts++
      if (attempts === 1) {
        now += 15000
        return Response.json({})
      }
      return new Response(null, { status: 503, headers: { "Retry-After": "13" } })
    },
    {
      now: () => now,
      sleep: async (ms) => {
        now += ms
      },
      random: () => 0,
    },
  )
  await expect(
    withTransportConfig(
      {},
      async () => {
        await request("next", {})
        await request("search", {})
      },
      () => now,
    ),
  ).rejects.toMatchObject({ retryable: true })
  expect(attempts).toBe(2)
})
