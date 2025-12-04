import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { renameStation, getStationList } from "../../../client.js"
import type { StationListResponse, RenameStationResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import { findStationOrFail } from "../utils/findStation.js"
import type { GlobalOptions } from "../../index.js"

type RenameCommandOptions = GlobalOptions

function formatRenameResponse(
  oldName: string,
  response: RenameStationResponse,
  options: { json: boolean }
): string {
  if (options.json) {
    const result = {
      success: true,
      data: {
        oldName,
        newName: response.stationName,
        stationId: response.stationId,
        stationToken: response.stationToken,
      },
    }
    return JSON.stringify(result, null, 2)
  }

  const checkmark = pc.green("✓")
  const oldNameDim = pc.dim(oldName)
  const newNameBold = pc.bold(response.stationName)
  
  return `${checkmark} Renamed station: ${oldNameDim} → ${newNameBold}`
}

export function registerRenameCommand(program: Command): void {
  program
    .command("rename <station-name> <new-name>")
    .description("Rename a station")
    .action(async (stationName: string, newName: string, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const effect: Effect.Effect<{ oldName: string; response: RenameStationResponse }, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const stationListResponse: StationListResponse = yield* getStationList(session)
        const station = yield* findStationOrFail(stationListResponse.stations, stationName)

        const response: RenameStationResponse = yield* renameStation(session, {
          stationToken: station.stationToken,
          stationName: newName,
        })

        return {
          oldName: station.stationName,
          response,
        }
      })

      const result = await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      const output = formatRenameResponse(result.oldName, result.response, {
        json: globalOpts.json,
      })

      console.log(output)
    })
}
