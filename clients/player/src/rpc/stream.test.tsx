import { describe, expect, it, vi } from "vitest"
import { createStreamLoader, type StreamAuthorizer, type StreamCredentials } from "./stream.ts"

const CREDENTIALS: StreamCredentials = {
  token: "secret-token",
  accountId: "account-1",
  deviceId: "device-1",
  streamEpoch: 3,
}

/// A service worker double that answers the authorisation handshake over the real
/// MessageChannel the production path uses.
const workerAnswering = (reply: unknown): StreamAuthorizer & { seen: unknown[] } => {
  const seen: unknown[] = []
  return {
    seen,
    postMessage(message, transfer) {
      seen.push(message)
      const port = transfer[0]
      if (port instanceof MessagePort) port.postMessage(reply)
    },
  }
}

/// A body, without constructing a Blob. jsdom's Blob and undici's Response come from
/// different realms here, so handing one to the other fails inside the Response rather than
/// in anything under test.
// Parameters are declared even where unused, so the recorded calls carry their real shape.
const bytes = () =>
  vi.fn(async (_input: string, _init?: RequestInit) => new Response("audio", { status: 200 }))

describe("when a service worker can authorise the stream", () => {
  it("hands back a plain URL carrying identity and never the token", async () => {
    const worker = workerAnswering({ authorized: true })
    const request = bytes()
    const loader = createStreamLoader({
      request,
      controller: () => worker,
      createObjectUrl: () => "blob:unused",
    })

    const url = await loader.load("track 1", CREDENTIALS)

    // The element fetches this itself, so anything in it is as exposed as the URL is. The
    // worker matches these against credentials it already holds; a leaked URL is not a
    // credential.
    expect(url).toBe("/stream/track%201?pyxisAccount=account-1&pyxisDevice=device-1&pyxisEpoch=3")
    expect(url).not.toContain("secret-token")
    // No bytes were pulled through the page. The whole point of this path is that the
    // element streams and seeks for itself.
    expect(request).not.toHaveBeenCalled()
  })

  it("passes the track and credentials to the worker", async () => {
    const worker = workerAnswering({ authorized: true })
    const loader = createStreamLoader({ request: bytes(), controller: () => worker })
    await loader.load("track-1", CREDENTIALS)

    expect(worker.seen[0]).toEqual({
      _tag: "pyxis.stream.authorize",
      trackId: "track-1",
      ...CREDENTIALS,
    })
  })

  it("carries the worker's cached candidate when it offers one", async () => {
    const worker = workerAnswering({
      authorized: true,
      candidateUrl: "https://cdn.example/track.flac",
      cacheName: "pyxis-media",
    })
    const loader = createStreamLoader({ request: bytes(), controller: () => worker })

    const url = await loader.load("track-1", CREDENTIALS)

    expect(url).toContain("pyxisCandidate=https%3A%2F%2Fcdn.example%2Ftrack.flac")
    expect(url).toContain("pyxisCache=pyxis-media")
  })

  it("reads the controller when the stream is loaded, not when the loader is built", async () => {
    // A worker takes control after the page loads. Capturing the controller at construction
    // would mean every stream in a fresh tab silently used the slow path.
    let worker: StreamAuthorizer | undefined
    const request = bytes()
    const loader = createStreamLoader({
      request,
      controller: () => worker,
      createObjectUrl: () => "blob:fallback",
    })

    expect(await loader.load("track-1", CREDENTIALS)).toBe("blob:fallback")

    worker = workerAnswering({ authorized: true })
    expect(await loader.load("track-1", CREDENTIALS)).toContain("/stream/track-1?")
  })
})

describe("when the worker cannot authorise", () => {
  it("falls back to fetching the bytes with the credential attached", async () => {
    const request = bytes()
    const loader = createStreamLoader({
      request,
      controller: () => undefined,
      createObjectUrl: () => "blob:downloaded",
    })

    expect(await loader.load("track 1", CREDENTIALS)).toBe("blob:downloaded")
    expect(request).toHaveBeenCalledTimes(1)
    const call = request.mock.calls[0]
    expect(call).toBeDefined()
    expect(call?.[0]).toBe("/stream/track%201")
    const headers = call?.[1]?.headers as Record<string, string>
    // Here the page makes the request, so the credential travels as a header rather than
    // in a URL the element would expose.
    expect(headers.authorization).toBe("Bearer secret-token")
    expect(headers["x-pyxis-account-id"]).toBe("account-1")
  })

  it("falls back when the worker answers but refuses", async () => {
    const loader = createStreamLoader({
      request: bytes(),
      controller: () => workerAnswering({ authorized: false }),
      createObjectUrl: () => "blob:downloaded",
    })
    expect(await loader.load("track-1", CREDENTIALS)).toBe("blob:downloaded")
  })

  it("falls back rather than hanging when the worker never answers", async () => {
    const silent: StreamAuthorizer = { postMessage: () => undefined }
    const loader = createStreamLoader({
      request: bytes(),
      controller: () => silent,
      createObjectUrl: () => "blob:downloaded",
      authorizeTimeoutMs: 5,
    })

    // A person waiting on audio is better served by the slower path than by nothing.
    expect(await loader.load("track-1", CREDENTIALS)).toBe("blob:downloaded")
  })

  it("reports a refused download instead of handing back an unplayable URL", async () => {
    const loader = createStreamLoader({
      request: vi.fn(async () => new Response("no", { status: 403 })),
      controller: () => undefined,
    })
    await expect(loader.load("track-1", CREDENTIALS)).rejects.toThrow(
      "stream request failed with HTTP 403",
    )
  })
})
