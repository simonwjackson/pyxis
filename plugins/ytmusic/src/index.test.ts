import { describe, expect, test } from "bun:test"
import { createPluginRuntime, PLUGIN_PROTOCOL_VERSION } from "@pyxis/plugin-sdk"
import { createYtMusicPlugin } from "./index"
import { createYtMusicInternalApi, type YtMusicInternalApi } from "./internal-api"
import type { YtDlp } from "./ytdlp"

const internal: YtMusicInternalApi = {
  searchAlbums: async () => [
    { externalId: "MPRE_album", title: "Heroes", artist: "David Bowie", year: 1977 },
  ],
  getAlbum: async (externalId) => ({
    externalId,
    title: "Heroes",
    artist: "David Bowie",
    year: 1977,
    tracks: [
      {
        externalId: "track-one",
        title: "Heroes",
        artist: "David Bowie",
        durationMs: 372000,
        trackNumber: 1,
      },
    ],
  }),
}

const working: YtDlp = {
  check: async () => "2026.08.21",
  search: async () => [
    {
      source: "ytmusic",
      externalId: "one",
      title: "Heroes",
      artist: "David Bowie",
    },
  ],
  resolveStream: async () => ({
    kind: "remote",
    url: "https://audio.example/stream",
    headers: {},
    lossless: false,
  }),
  fetchStream: async (_trackId, targetPath) => {
    await Bun.write(targetPath, "audio")
  },
}

describe("YouTube Music plugin", () => {
  test("search, album, and stream operations dispatch through the source capability", async () => {
    const runtime = createPluginRuntime(createYtMusicPlugin(working, internal))

    const search = await runtime.handleLine(
      JSON.stringify({
        id: "search",
        request: {
          _tag: "capability.call",
          payload: { capability: "source", operation: "search", input: { query: "Bowie" } },
        },
      }),
    )
    const albumSearch = await runtime.handleLine(
      JSON.stringify({
        id: "album-search",
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation: "album.search",
            input: { query: "Heroes" },
          },
        },
      }),
    )
    const albumGet = await runtime.handleLine(
      JSON.stringify({
        id: "album-get",
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation: "album.get",
            input: { externalId: "MPRE_album" },
          },
        },
      }),
    )
    const stream = await runtime.handleLine(
      JSON.stringify({
        id: "stream",
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation: "stream.resolve",
            input: { trackId: "one" },
          },
        },
      }),
    )

    expect(search).toMatchObject({
      _tag: "response",
      envelope: {
        response: { outcome: { status: "ready", value: { tracks: [{ title: "Heroes" }] } } },
      },
    })
    expect(albumSearch).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: { status: "ready", value: { albums: [{ externalId: "MPRE_album" }] } },
        },
      },
    })
    expect(albumGet).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: { externalId: "MPRE_album", tracks: [{ externalId: "track-one" }] },
          },
        },
      },
    })
    expect(stream).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready", value: { kind: "remote" } } } },
    })
  })

  test("album operations preserve invalid-input and provider failure types", async () => {
    const unavailableInternal: YtMusicInternalApi = {
      ...internal,
      searchAlbums: async () => {
        throw Object.assign(new Error("provider unavailable"), {
          code: "ytmusic.unavailable",
          retryable: true,
        })
      },
    }
    const runtime = createPluginRuntime(createYtMusicPlugin(working, unavailableInternal))

    const invalid = await runtime.handleLine(
      JSON.stringify({
        id: "invalid",
        request: {
          _tag: "capability.call",
          payload: { capability: "source", operation: "album.get", input: {} },
        },
      }),
    )
    const unavailable = await runtime.handleLine(
      JSON.stringify({
        id: "unavailable",
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation: "album.search",
            input: { query: "Heroes" },
          },
        },
      }),
    )

    expect(invalid).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.invalidInput", retryable: false },
          },
        },
      },
    })
    expect(unavailable).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "ytmusic.unavailable", retryable: true },
          },
        },
      },
    })
  })

  test("real YouTube HTTP failures preserve retryability", async () => {
    for (const [status, retryable] of [
      [503, true],
      [404, false],
    ] as const) {
      const fetcher = (async () => new Response("{}", { status })) as unknown as typeof fetch
      const runtime = createPluginRuntime(
        createYtMusicPlugin(working, createYtMusicInternalApi(fetcher)),
      )

      const response = await runtime.handleLine(
        JSON.stringify({
          id: `http-${status}`,
          request: {
            _tag: "capability.call",
            payload: {
              capability: "source",
              operation: "album.search",
              input: { query: "Heroes" },
            },
          },
        }),
      )

      expect(response).toMatchObject({
        _tag: "response",
        envelope: {
          response: {
            outcome: {
              status: "unavailable",
              value: { code: `ytmusic.http${status}`, retryable },
            },
          },
        },
      })
    }
  })

  test("missing yt-dlp rejects the handshake with a typed unavailable outcome", async () => {
    const unavailable: YtDlp = {
      ...working,
      check: async () => {
        throw Object.assign(new Error("yt-dlp not found"), {
          code: "ytDlp.missing",
          retryable: false,
        })
      },
    }
    const runtime = createPluginRuntime(createYtMusicPlugin(unavailable))

    const handshake = await runtime.handleLine(
      JSON.stringify({
        id: "handshake",
        request: {
          _tag: "plugin.handshake",
          payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
        },
      }),
    )

    expect(handshake).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "rejected",
            value: { code: "ytDlp.missing", retryable: false },
          },
        },
      },
    })
  })
})
