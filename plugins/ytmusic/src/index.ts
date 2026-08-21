import { definePlugin, PluginCapability, PluginOperationError, runPlugin } from "@pyxis/plugin-sdk"
import { searchInput, streamFetchInput, streamResolveInput } from "./api"
import { createYtDlp, type YtDlp } from "./ytdlp"

export function createYtMusicPlugin(ytdlp: YtDlp) {
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
        "stream.resolve": async (input) => {
          const request = validInput(() => streamResolveInput(input))
          return providerCall(() => ytdlp.resolveStream(request.trackId))
        },
        "stream.fetch": async (input) => {
          const request = validInput(() => streamFetchInput(input))
          await providerCall(() => ytdlp.fetchStream(request.trackId, request.targetPath))
          return { kind: "local", targetPath: request.targetPath }
        },
      },
    },
  })
}

if (import.meta.main) {
  await runPlugin(createYtMusicPlugin(createYtDlp()))
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
