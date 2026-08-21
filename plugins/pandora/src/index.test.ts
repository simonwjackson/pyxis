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
      { stationId: "1", stationToken: "station-1", stationName: "Bowie Radio" },
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
  test("station playlist returns canonical tracks and enables stream resolution", async () => {
    const runtime = createPluginRuntime(createPandoraPlugin(api()))

    const stations = await call(runtime, "stations.list", {})
    const tracks = await call(runtime, "station.tracks", { stationId: "station-1" })
    const stream = await call(runtime, "stream.resolve", { trackId: "track-1" })

    expect(stations).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { value: { stations: [{ name: "Bowie Radio" }] } } } },
    })
    expect(tracks).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { value: { tracks: [{ title: "Heroes" }] } } } },
    })
    expect(stream).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { value: { url: "https://audio.example/one.mp3" } } } },
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

    const result = await call(runtime, "stations.list", {})

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
            operation: "stations.list",
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
