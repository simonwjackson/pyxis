import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getStationList, transformSharedStation } from "../../../client.js"
import type { Station, StationListResponse, TransformSharedStationResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type CloneCommandOptions = GlobalOptions

function findStationByName(
  stations: readonly Station[],
  stationName: string
): Station | undefined {
  const lowerName = stationName.toLowerCase()
  return stations.find(
    (station) => station.stationName.toLowerCase() === lowerName
  )
}

export function registerCloneCommand(program: Command): void {
  program
    .command("clone <station-name>")
    .description("Clone a shared station to make it editable")
    .action(async (stationName: string, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const effect: Effect.Effect<TransformSharedStationResponse, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const stationListResponse: StationListResponse = yield* getStationList(session)
        const station = findStationByName(stationListResponse.stations, stationName)

        if (!station) {
          return yield* Effect.fail(
            new SessionError({
              message: "Station not found. Use 'pandora stations list' to see available stations.",
            })
          )
        }

        const newStation: TransformSharedStationResponse = yield* transformSharedStation(session, {
          stationToken: station.stationToken,
        })

        return newStation
      })

      const result = await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      if (globalOpts.json) {
        console.log(JSON.stringify({
          success: true,
          data: result,
        }, null, 2))
      } else {
        console.log(pc.green("Station cloned successfully!"))
        console.log("")
        console.log(pc.bold("New Station") + ":")
        console.log("  Name: " + result.stationName)
        console.log("  Station ID: " + result.stationId)
        console.log("  Station Token: " + result.stationToken)
        console.log("")
        console.log("You can now edit this station.")
      }
    })
}
