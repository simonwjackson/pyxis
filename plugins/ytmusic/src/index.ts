import {
  definePlugin,
  PluginCapability,
  PluginOperationError,
  runPlugin,
  StationSeedKind,
} from "@pyxis/plugin-sdk"
import { type SourceTrack, searchInput, streamFetchInput, streamResolveInput } from "./api"
import {
  createYtMusicInternalApi,
  radioPlaylistId,
  type YtMusicInternalApi,
  type YtMusicSong,
} from "./internal-api"
import { createYtDlp, type YtDlp } from "./ytdlp"

export function createYtMusicPlugin(
  ytdlp: YtDlp,
  internalApi: YtMusicInternalApi = createYtMusicInternalApi(),
) {
  return definePlugin({
    manifest: {
      id: "ytmusic",
      name: "YouTube Music",
      version: "1.0.0",
      capabilities: [PluginCapability.Source],
      // A YouTube Music station is derived from a recording, so a track seed is the only one
      // this source can honor. It owns no stations of its own, which is why `station.list` is
      // absent rather than answering with an empty list it would have to invent.
      source: { stationSeedKinds: [StationSeedKind.Track] },
      configSchema: {},
    },
    initialize: async () => {
      await providerCall(() => ytdlp.check())
    },
    capabilities: {
      source: {
        search: async (input) => {
          const request = validInput(() => searchInput(input))
          return providerCall(async () => ({
            tracks: (await internalApi.searchSongs(request.query, request.limit ?? 10)).map(
              sourceTrack,
            ),
          }))
        },
        "artist.search": async (input) => {
          const request = validInput(() => searchInput(input))
          return {
            artists: await providerCall(() =>
              internalApi.searchArtists(request.query, request.limit ?? 10),
            ),
          }
        },
        "album.search": async (input) => {
          const request = validInput(() => searchInput(input))
          return { albums: await providerCall(() => internalApi.searchAlbums(request.query)) }
        },
        "album.get": async (input) => {
          const externalId = validInput(() => externalIdOf(input))
          return providerCall(() => internalApi.getAlbum(externalId))
        },
        // Creating a station makes no upstream request. The radio playlist id is derived from
        // the seed recording, so this cannot fail upstream and needs no account.
        "station.create": async (input) => {
          const seed = validInput(() => trackSeedOf(input))
          return {
            station: {
              externalId: radioPlaylistId(seed),
              name: "YouTube Music radio",
            },
          }
        },
        "station.next": async (input) => {
          const request = validInput(() => stationNextInput(input))
          const seed = seedVideoId(request.stationId)
          return providerCall(async () => {
            const queue = await internalApi.watchQueue(seed, request.cursor, request.limit)
            return {
              tracks: queue.tracks.map(sourceTrack),
              ...(queue.continuation === undefined ? {} : { cursor: queue.continuation }),
              // A page with no continuation is the end of this radio. The parser throws on an
              // unreadable response, so exhaustion here always means exhaustion.
              exhausted: queue.continuation === undefined,
            }
          })
        },
        "stream.resolve": async (input) => {
          const request = validInput(() => streamResolveInput(input))
          return providerCall(() => ytdlp.resolveStream(request.trackId, request.preferredFormats))
        },
        "stream.fetch": async (input) => {
          const request = validInput(() => streamFetchInput(input))
          await providerCall(() =>
            ytdlp.fetchStream(request.trackId, request.targetPath, request.preferredFormats),
          )
          return { kind: "local", targetPath: request.targetPath }
        },
      },
    },
  })
}

if (import.meta.main) {
  await runPlugin(createYtMusicPlugin(createYtDlp()))
}

/// The album reference a song belongs to is parsed but not published yet: the core's search
/// track contract has no field for it. It arrives with the three-kind search operation.
function sourceTrack(song: YtMusicSong): SourceTrack {
  return {
    source: "ytmusic",
    externalId: song.externalId,
    title: song.title,
    artist: song.artist,
    ...(song.album === undefined ? {} : { album: song.album }),
    ...(song.durationMs === undefined ? {} : { durationMs: song.durationMs }),
    ...(song.artworkUrl === undefined ? {} : { artworkUrl: song.artworkUrl }),
  }
}

/// A station id is the derived radio playlist. Recovering the seed recording from it keeps the
/// station reference self-contained, so the core stores one opaque id and no side table.
function seedVideoId(stationId: string): string {
  return stationId.startsWith("RDAMVM") ? stationId.slice("RDAMVM".length) : stationId
}

function trackSeedOf(input: unknown): string {
  if (typeof input !== "object" || input === null || !("seed" in input)) {
    throw new Error("station.create input requires a seed")
  }
  const seed = input.seed
  if (
    typeof seed !== "object" ||
    seed === null ||
    !("kind" in seed) ||
    !("externalId" in seed) ||
    typeof seed.externalId !== "string" ||
    seed.externalId.length === 0
  ) {
    throw new Error("station.create seed requires kind and externalId")
  }
  if (seed.kind !== "track") {
    throw new Error(`YouTube Music stations start from a track, not '${String(seed.kind)}'`)
  }
  return seed.externalId
}

function stationNextInput(input: unknown): {
  readonly stationId: string
  readonly cursor: string | undefined
  readonly limit: number
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("stationId" in input) ||
    typeof input.stationId !== "string" ||
    input.stationId.length === 0
  ) {
    throw new Error("station.next input requires stationId")
  }
  const cursor =
    "cursor" in input && typeof input.cursor === "string" && input.cursor.length > 0
      ? input.cursor
      : undefined
  const limit =
    "limit" in input && typeof input.limit === "number" && Number.isInteger(input.limit)
      ? Math.min(Math.max(input.limit, 1), 100)
      : 25
  return { stationId: input.stationId, cursor, limit }
}

function externalIdOf(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    !("externalId" in input) ||
    typeof input.externalId !== "string" ||
    input.externalId.length === 0
  ) {
    throw new Error("album.get input requires externalId")
  }
  return input.externalId
}

function validInput<T>(parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    throw new PluginOperationError(
      "capability.invalidInput",
      error instanceof Error ? error.message : "input is invalid",
      false,
    )
  }
}

async function providerCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isCodedError(error)) {
      throw new PluginOperationError(error.code, error.message, error.retryable)
    }
    throw error
  }
}

function isCodedError(
  error: unknown,
): error is Error & { readonly code: string; readonly retryable: boolean } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  )
}
