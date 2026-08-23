// @vitest-environment node
import { describe, expect, test } from "vitest"
import { parseRangeHeader, rangeResponse } from "./range"

describe("range parsing", () => {
  test("parses standard, open, and suffix forms", () => {
    expect(parseRangeHeader(null, 100)).toBeUndefined()
    expect(parseRangeHeader("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRangeHeader("bytes=500-", 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRangeHeader("bytes=-200", 1000)).toEqual({ start: 800, end: 999 })
    expect(parseRangeHeader("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 })
  })

  test("rejects malformed or unsatisfiable ranges", () => {
    for (const value of ["bytes=1000-", "bytes=5-2", "bytes=-0", "bytes=-", "items=0-5"]) {
      expect(parseRangeHeader(value, 1000)).toBe("invalid")
    }
    expect(parseRangeHeader("bytes=0-", 0)).toBe("invalid")
  })
})

describe("cached range responses", () => {
  const bytes = new Uint8Array(100).map((_, index) => index)
  const cached = () =>
    new Response(bytes, {
      headers: {
        "content-type": "audio/mpeg",
        "x-pyxis-candidate-id": "candidate-1",
      },
    })

  test("serves the complete body", async () => {
    const response = await rangeResponse(cached(), new Request("https://pyxis.test/stream/t1"))
    expect(response.status).toBe(200)
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("x-pyxis-candidate-id")).toBe("candidate-1")
    expect((await response.arrayBuffer()).byteLength).toBe(100)
  })

  test("serves a real 206 slice", async () => {
    const response = await rangeResponse(
      cached(),
      new Request("https://pyxis.test/stream/t1", { headers: { range: "bytes=10-19" } }),
    )
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 10-19/100")
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      ...new Uint8Array(10).map((_, index) => index + 10),
    ])
  })

  test("answers an unsatisfiable request with 416", async () => {
    const response = await rangeResponse(
      cached(),
      new Request("https://pyxis.test/stream/t1", { headers: { range: "bytes=500-" } }),
    )
    expect(response.status).toBe(416)
    expect(response.headers.get("content-range")).toBe("bytes */100")
  })
})
