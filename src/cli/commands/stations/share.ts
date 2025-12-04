import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getStationList, shareStation } from "../../../client.js"
import type { Station, StationListResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type ShareCommandOptions = GlobalOptions

function findStationByName(
  stations: readonly Station[],
  stationName: string
): Station | undefined {
  const lowerName = stationName.toLowerCase()
  return stations.find(
    (station) => station.stationName.toLowerCase() === lowerName
  )
}

type ShareResult = {
  readonly stationName: string
  readonly emails: readonly string[]
}

export function registerShareCommand(program: Command): void {
  program
    .command("share <station-name> <email> [emails...]")
    .description("Share a station via email")
    .action(async (stationName: string, firstEmail: string, additionalEmails: string[], command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allEmails = [firstEmail, ...additionalEmails]

      const effect: Effect.Effect<ShareResult, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        // Get station list to find the station
        const stationListResponse: StationListResponse = yield* getStationList(session)
        const station = findStationByName(stationListResponse.stations, stationName)

        if (!station) {
          return yield* Effect.fail(
            new SessionError({
              message: `Station "${stationName}" not found. Use 'pandora stations list' to see available stations.`,
            })
          )
        }

        // Share the station
        yield* shareStation(session, {
          stationId: station.stationId,
          stationToken: station.stationToken,
          emails: allEmails,
        })

        return {
          stationName: station.stationName,
          emails: allEmails,
        }
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
        const emailList = result.emails.map(e => `  - ${e}`).join("\n")
        console.log(pc.green(`Station "${result.stationName}" shared successfully!`))
        console.log(`\nShared with:\n${emailList}`)
      }
    })
}
