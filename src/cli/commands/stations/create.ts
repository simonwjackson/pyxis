import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { createStation } from "../../../client.js"
import type { CreateStationResponse, CreateStationRequest } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type CreateOptions = {
  readonly type: "song" | "artist"
  readonly track?: string
}

type CreateCommandOptions = GlobalOptions & CreateOptions

function formatCreateResponse(
  response: CreateStationResponse,
  options: { json: boolean }
): string {
  if (options.json) {
    const result = {
      success: true,
      data: response,
    }
    return JSON.stringify(result, null, 2)
  }

  const checkmark = pc.green("✓")
  const stationName = pc.bold(response.stationName)
  const stationIdLabel = pc.dim("Station ID")
  const stationTokenLabel = pc.dim("Station Token")
  
  return `${checkmark} Created station: ${stationName}
${stationIdLabel}: ${response.stationId}
${stationTokenLabel}: ${response.stationToken}`
}

export function registerCreateCommand(program: Command): void {
  program
    .command("create <music-token>")
    .description("Create a new station from a music token")
    .option("-t, --type <type>", "Music type: song or artist", "song")
    .option("--track <token>", "Use track token instead of music token")
    .action(async (musicToken: string, options: CreateOptions, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allOpts: CreateCommandOptions = {
        ...globalOpts,
        ...options,
      }

      if (allOpts.type !== "song" && allOpts.type !== "artist") {
        console.error(
          pc.red(`Invalid type: ${allOpts.type}. Must be "song" or "artist"`)
        )
        process.exit(2)
      }

      const effect: Effect.Effect<CreateStationResponse, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const request: CreateStationRequest = allOpts.track
          ? { trackToken: allOpts.track, musicType: allOpts.type }
          : { musicToken, musicType: allOpts.type }

        const response: CreateStationResponse = yield* createStation(session, request)

        return response
      })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatCreateResponse(result, {
        json: allOpts.json,
      })

      console.log(output)
    })
}
