import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getStationList, setQuickMix } from "../../../client.js"
import type { Station, StationListResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import { findStation } from "../utils/findStation.js"
import type { GlobalOptions } from "../../index.js"

export function parseStationNames(args: string[]): string[] {
  const allNames: string[] = []
  
  for (const arg of args) {
    if (arg.includes(',')) {
      const names = arg.split(',').map(n => n.trim()).filter(n => n.length > 0)
      allNames.push(...names)
    } else {
      allNames.push(arg)
    }
  }
  
  return allNames
}

export function resolveStationIds(
  stations: readonly Station[],
  queries: string[]
): Effect.Effect<string[], PandoraError> {
  const stationIds: string[] = []
  const notFound: string[] = []
  
  for (const query of queries) {
    const station = findStation(stations, query)
    if (station) {
      stationIds.push(station.stationId)
    } else {
      notFound.push(query)
    }
  }
  
  if (notFound.length > 0) {
    const notFoundList = notFound.join(', ')
    return Effect.fail(
      new SessionError({
        message: `Stations not found: ${notFoundList}. Use 'pandora stations list' to see available stations.`
      })
    )
  }
  
  return Effect.succeed(stationIds)
}

export function registerQuickMixCommands(program: Command): void {
  const quickmix = program
    .command("quickmix")
    .description("Manage QuickMix shuffle stations")

  quickmix
    .command("set")
    .description("Set stations for QuickMix shuffle")
    .argument("<station-names...>", "Station names or tokens (comma-separated or space-separated)")
    .action(async (stationNames: string[], options, command: Command) => {
      const parentCommand = command.parent?.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const parsedNames = parseStationNames(stationNames)

      if (parsedNames.length === 0) {
        console.error(pc.red("Error: At least one station name must be provided"))
        process.exit(2)
      }

      const effect: Effect.Effect<void, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const stationListResponse: StationListResponse = yield* getStationList(session!)
        const stationIds = yield* resolveStationIds(stationListResponse.stations, parsedNames)
        yield* setQuickMix(session!, stationIds)

        if (!globalOpts.quiet) {
          if (globalOpts.json) {
            console.log(JSON.stringify({ success: true, stationCount: stationIds.length }, null, 2))
          } else {
            const plural = stationIds.length === 1 ? '' : 's'
            console.log(pc.green(`QuickMix updated with ${stationIds.length} station${plural}`))
          }
        }
      })

      await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })
    })

  quickmix
    .command("show")
    .description("Show current QuickMix stations")
    .action(async (options, command: Command) => {
      const parentCommand = command.parent?.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const effect: Effect.Effect<readonly Station[], PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const response: StationListResponse = yield* getStationList(session!)
        return response.stations
      })

      const result = await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      if (globalOpts.json) {
        console.log(JSON.stringify({ success: true, data: { stations: result } }, null, 2))
      } else {
        console.log(pc.bold("QuickMix Stations"))
        console.log("=".repeat(17))
        console.log()
        console.log(pc.dim("Note: This shows all stations. The API does not return QuickMix membership status."))
        console.log(pc.dim("Use 'pandora stations list' to see all available stations."))
      }
    })
}
