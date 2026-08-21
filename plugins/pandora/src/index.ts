import {
  type CapabilityContext,
  definePlugin,
  PluginCapability,
  PluginOperationError,
  runPlugin,
} from "@pyxis/plugin-sdk"
import { createLiveTransport, createPandoraApi, type PandoraApi } from "./api"
import { pandoraConfig } from "./config"
import { PandoraError } from "./errors"
import { createFixtureTransport } from "./fixtures"
import { createSessionManager } from "./session"
import { audioUrl, canonicalStation, canonicalTrack } from "./stations"
import type { PandoraPlaylistItem, PandoraSession } from "./types"

interface CachedTrack {
  readonly stationId: string
  readonly item: PandoraPlaylistItem
  readonly resolvedAt?: number
}

export function createPandoraPlugin(api: PandoraApi) {
  const sessions = createSessionManager(api)
  const tracks = new Map<string, CachedTrack>()

  const account = (context: CapabilityContext): string => {
    if (context.accountId === undefined) {
      throw new PandoraError("pandora.accountRequired", "Pandora requires account context", false)
    }
    return context.accountId
  }

  const withSession = <T>(
    context: CapabilityContext,
    operation: (session: PandoraSession) => Promise<T>,
  ): Promise<T> =>
    providerCall(() => sessions.withSession<T>(account(context), pandoraConfig(context), operation))

  return definePlugin({
    manifest: {
      id: "pandora",
      name: "Pandora",
      version: "1.0.0",
      capabilities: [PluginCapability.Source],
      configSchema: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string", secret: true },
        },
      },
    },
    capabilities: {
      source: {
        // Pandora music search returns station seeds, not directly playable audio tracks.
        // Keep unified track search honest and expose the seed results separately.
        search: async (_input, context) => {
          await withSession(context, (session) => api.search(session, queryOf(_input)))
          return { tracks: [] }
        },
        "station.search": (input, context) =>
          withSession(context, (session) => api.search(session, queryOf(input))),
        "stations.list": (_input, context) =>
          withSession(context, async (session) => ({
            stations: (await api.stations(session)).map(canonicalStation),
          })),
        "station.tracks": (input, context) => {
          const stationId = stationIdOf(input)
          const accountId = account(context)
          return withSession(context, async (session) => {
            const items = await api.stationTracks(session, stationId)
            const canonical = []
            for (const item of items) {
              const track = canonicalTrack(item)
              if (track === undefined) continue
              tracks.set(trackKey(accountId, item.trackToken), { stationId, item })
              canonical.push(track)
            }
            return { tracks: canonical }
          })
        },
        "stream.resolve": (_input, context) => {
          const trackId = trackIdOf(_input)
          const accountId = account(context)
          return withSession(context, async (session) => {
            let cached = tracks.get(trackKey(accountId, trackId))
            if (cached === undefined) {
              throw new PandoraError(
                "pandora.trackNotCached",
                "Pandora tracks must come from station.tracks before playback",
                false,
              )
            }
            if (cached.resolvedAt !== undefined && Date.now() - cached.resolvedAt < 60_000) {
              const refreshed = await api.stationTracks(session, cached.stationId)
              const replacement =
                refreshed.find((item) => item.trackToken === trackId) ??
                refreshed.find(
                  (item) =>
                    item.songName === cached?.item.songName &&
                    item.artistName === cached.item.artistName &&
                    item.albumName === cached.item.albumName,
                )
              if (replacement !== undefined) {
                cached = { stationId: cached.stationId, item: replacement }
              }
            }
            const url = audioUrl(cached.item)
            if (url === undefined) {
              throw new PandoraError("pandora.noAudio", "Pandora returned no audio URL", true)
            }
            tracks.set(trackKey(accountId, trackId), { ...cached, resolvedAt: Date.now() })
            return {
              kind: "remote",
              url,
              headers: {},
              format: "mp3",
              bitrateKbps: 128,
              lossless: false,
            }
          })
        },
      },
    },
  })
}

if (import.meta.main) {
  const mode = fixtureMode()
  const directory =
    process.env.PYXIS_PANDORA_FIXTURE_DIR ?? new URL("../fixtures", import.meta.url).pathname
  const transport = createFixtureTransport({
    mode,
    directory,
    live: createLiveTransport(),
  })
  await runPlugin(createPandoraPlugin(createPandoraApi(transport)))
}

async function providerCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PandoraError) {
      throw new PluginOperationError(error.code, error.message, error.retryable)
    }
    throw error
  }
}

function queryOf(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    !("query" in input) ||
    typeof input.query !== "string"
  ) {
    throw new PluginOperationError("capability.invalidInput", "query is required", false)
  }
  return input.query
}

function stationIdOf(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    !("stationId" in input) ||
    typeof input.stationId !== "string"
  ) {
    throw new PluginOperationError("capability.invalidInput", "stationId is required", false)
  }
  return input.stationId
}

function trackIdOf(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    !("trackId" in input) ||
    typeof input.trackId !== "string"
  ) {
    throw new PluginOperationError("capability.invalidInput", "trackId is required", false)
  }
  return input.trackId
}

function trackKey(accountId: string, trackId: string): string {
  return `${accountId}\0${trackId}`
}

function fixtureMode(): "live" | "record" | "replay" {
  const mode = process.env.PYXIS_PANDORA_FIXTURE_MODE
  return mode === "record" || mode === "replay" ? mode : "live"
}
