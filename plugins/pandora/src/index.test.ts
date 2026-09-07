import { describe, expect, test } from "bun:test"
import { createPluginRuntime, PLUGIN_PROTOCOL_VERSION } from "@pyxis/plugin-sdk"
import type { PandoraApi } from "./api"
import { PandoraError } from "./errors"
import { createPandoraPlugin } from "./index"

const config = { username: "user", password: "pass" }

function api(overrides: Partial<PandoraApi> = {}): PandoraApi {
  return {
    login: async () => ({
      syncOffset: 0,
      partnerId: "p",
      partnerAuthToken: "pt",
      userId: "u",
      userAuthToken: "ut",
    }),
    stations: async () => [
      {
        stationId: "1",
        stationToken: "station-1",
        stationName: "Bowie Radio",
        artUrl: "https://art.example/bowie.jpg",
      },
      { stationId: "2", stationToken: "station-2", stationName: "Jazz Radio" },
    ],
    stationTracks: async () => [
      {
        trackToken: "track-1",
        songName: "Heroes",
        artistName: "David Bowie",
        albumName: "Heroes",
        additionalAudioUrl: "https://audio.example/one.mp3",
      },
    ],
    search: async () => ({ songs: [] }),
    ...overrides,
  }
}

async function call(
  runtime: ReturnType<typeof createPluginRuntime>,
  operation: string,
  input: unknown,
) {
  return runtime.handleLine(
    JSON.stringify({
      id: operation,
      request: {
        _tag: "capability.call",
        payload: {
          capability: "source",
          operation,
          input,
          accountId: "default",
          config,
        },
      },
    }),
  )
}

describe("Pandora plugin", () => {
  test("a station batch returns canonical tracks and enables stream resolution", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const stations = await call(runtime, "station.list", {})
    const batch = await call(runtime, "station.next", { stationId: "station-1" })
    const stream = await call(runtime, "stream.resolve", { trackId: "track-1" })

    expect(stations).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            value: {
              stations: [
                {
                  externalId: "station-1",
                  name: "Bowie Radio",
                  artworkUrl: "https://art.example/bowie.jpg",
                },
                { externalId: "station-2", name: "Jazz Radio" },
              ],
            },
          },
        },
      },
    })
    expect(batch).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { value: { tracks: [{ title: "Heroes" }], exhausted: false } },
        },
      },
    })
    expect(stream).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { value: { url: "https://audio.example/one.mp3" } } } },
    })
  })

  test("a Pandora batch carries no cursor, because every call is a fresh playlist", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const batch = await call(runtime, "station.next", { stationId: "station-1" })

    const value = (batch as { envelope: { response: { outcome: { value: unknown } } } }).envelope
      .response.outcome.value as Record<string, unknown>
    expect(value.cursor).toBeUndefined()
    expect(value.exhausted).toBe(false)
  })

  test("station search matches the account's own stations by name", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const result = await call(runtime, "station.search", { query: "jazz" })

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { value: { stations: [{ externalId: "station-2", name: "Jazz Radio" }] } },
        },
      },
    })
  })

  test("a batch honours the requested limit", async () => {
    const runtime = createPluginRuntime(
      createPandoraPlugin(
        api({
          stationTracks: async () =>
            ["one", "two", "three"].map((token) => ({
              trackToken: token,
              songName: token,
              artistName: "David Bowie",
              albumName: "Heroes",
              additionalAudioUrl: `https://audio.example/${token}.mp3`,
            })),
        }),
      ),
    )

    const batch = await call(runtime, "station.next", { stationId: "station-1", limit: 2 })

    const value = (batch as { envelope: { response: { outcome: { value: unknown } } } }).envelope
      .response.outcome.value as { tracks: unknown[] }
    expect(value.tracks).toHaveLength(2)
  })

  test("a playlist item missing required detail is dropped rather than invented", async () => {
    const runtime = createPluginRuntime(
      createPandoraPlugin(
        api({
          stationTracks: async () => [
            { trackToken: "", songName: "", artistName: "", albumName: "" },
            {
              trackToken: "track-1",
              songName: "Heroes",
              artistName: "David Bowie",
              albumName: "Heroes",
              additionalAudioUrl: "https://audio.example/one.mp3",
            },
          ],
        }),
      ),
    )

    const batch = await call(runtime, "station.next", { stationId: "station-1" })

    const value = (batch as { envelope: { response: { outcome: { value: unknown } } } }).envelope
      .response.outcome.value as { tracks: { title: string }[] }
    expect(value.tracks).toEqual([expect.objectContaining({ title: "Heroes" })])
  })

  test("creating a station is refused, because Pandora stations are account-owned", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const result = await call(runtime, "station.create", {
      seed: { kind: "track", externalId: "track-1" },
    })

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { status: "unavailable", value: { code: "capability.unknownOperation" } },
        },
      },
    })
  })

  test("stream resolution refuses a track no batch produced", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const result = await call(runtime, "stream.resolve", { trackId: "never-seen" })

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { status: "unavailable", value: { code: "pandora.trackNotCached" } },
        },
      },
    })
  })

  test("expired auth retries login once", async () => {
    let logins = 0
    let stationCalls = 0
    const runtime = createPluginRuntime(
      createPandoraPlugin(
        api({
          login: async () => {
            logins += 1
            return {
              syncOffset: 0,
              partnerId: "p",
              partnerAuthToken: "pt",
              userId: "u",
              userAuthToken: `token-${logins}`,
            }
          },
          stations: async () => {
            stationCalls += 1
            if (stationCalls === 1) {
              throw new PandoraError("pandora.api", "expired", false, { apiCode: 1001 })
            }
            return []
          },
        }),
      ),
    )

    const result = await call(runtime, "station.list", {})

    expect(result).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
    expect(logins).toBe(2)
  })

  test("missing account config is a permanent typed failure", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const result = await runtime.handleLine(
      JSON.stringify({
        id: "stations",
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation: "station.list",
            input: {},
            accountId: "default",
          },
        },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { status: "unavailable", value: { code: "pandora.notConfigured" } },
        },
      },
    })
  })

  test("handshake remains available before credentials are configured", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))
    const result = await runtime.handleLine(
      JSON.stringify({
        id: "h",
        request: {
          _tag: "plugin.handshake",
          payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
        },
      }),
    )
    expect(result).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
  })
})
