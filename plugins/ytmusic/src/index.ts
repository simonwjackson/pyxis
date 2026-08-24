import { definePlugin, PluginCapability, PluginOperationError, runPlugin } from "@pyxis/plugin-sdk"
import { searchInput, streamFetchInput, streamResolveInput } from "./api"
import { createYtMusicInternalApi, type YtMusicInternalApi } from "./internal-api"
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
            tracks: await ytdlp.search(request.query, request.limit ?? 10),
          }))
        },
        "album.search": async (input) => {
          const request = validInput(() => searchInput(input))
          return { albums: await providerCall(() => internalApi.searchAlbums(request.query)) }
        },
        "album.get": async (input) => {
          const externalId = validInput(() => externalIdOf(input))
          return providerCall(() => internalApi.getAlbum(externalId))
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
