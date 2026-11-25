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
  await withTransportConfig({ requestsPerSecond: 1, burstSize: 1 }, () =>
    Promise.all([request("search", {}), request("next", {})]),
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
