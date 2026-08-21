import { describe, expect, test } from "bun:test"
import { createPluginRuntime, PLUGIN_PROTOCOL_VERSION } from "@pyxis/plugin-sdk"
import { createYtMusicPlugin } from "./index"
import type { YtDlp } from "./ytdlp"

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
  test("search and stream.resolve are source capability operations", async () => {
    const runtime = createPluginRuntime(createYtMusicPlugin(working))

    const search = await runtime.handleLine(
      JSON.stringify({
        id: "search",
        request: {
          _tag: "capability.call",
          payload: { capability: "source", operation: "search", input: { query: "Bowie" } },
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
    expect(stream).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready", value: { kind: "remote" } } } },
    })
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
