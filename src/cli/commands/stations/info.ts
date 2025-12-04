import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getStationList, getStation } from "../../../client.js"
import type { 
  Station, 
  StationListResponse,
  GetStationResponse,
  StationSeed 
} from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type InfoCommandOptions = GlobalOptions

function findStationByName(
  stations: readonly Station[],
  stationName: string
): Station | undefined {
  const lowerName = stationName.toLowerCase()
  return stations.find(
    (station) => station.stationName.toLowerCase() === lowerName
  )
}

function formatSeeds(seeds: readonly StationSeed[] | undefined, label: string): string {
  if (!seeds || seeds.length === 0) {
    return ""
  }

  const items = seeds.map((seed) => {
    if (seed.songName && seed.artistName) {
      return `  - "${seed.songName}" by ${seed.artistName}`
    } else if (seed.artistName) {
      return `  - ${seed.artistName}`
    }
    return `  - Unknown`
  })

  return `\n${pc.bold(label)}:\n${items.join("\n")}`
}

function formatStationInfo(
  station: GetStationResponse,
  options: { json: boolean }
): string {
  if (options.json) {
    const response = {
      success: true,
      data: station,
    }
    return JSON.stringify(response, null, 2)
  }

  const title = pc.bold(station.stationName)
  const separator = "=".repeat(Math.min(station.stationName.length, 60))

  let output = `${title}\n${separator}\n`
  output += `\n${pc.bold("Station ID")}: ${station.stationId}`
  output += `\n${pc.bold("Station Token")}: ${station.stationToken}`

  // Seeds
  if (station.music) {
    const artistSeeds = formatSeeds(station.music.artists, "Artist Seeds")
    const songSeeds = formatSeeds(station.music.songs, "Song Seeds")
    
    if (artistSeeds || songSeeds) {
      output += "\n"
      if (artistSeeds) output += artistSeeds
      if (songSeeds) output += songSeeds
    }
  }

  // Feedback
  if (station.feedback) {
    const thumbsUpCount = station.feedback.thumbsUp?.length ?? 0
    const thumbsDownCount = station.feedback.thumbsDown?.length ?? 0

    if (thumbsUpCount > 0 || thumbsDownCount > 0) {
      output += `\n\n${pc.bold("Feedback")}:`
      output += `\n  Thumbs up: ${thumbsUpCount}`
      output += `\n  Thumbs down: ${thumbsDownCount}`
    }
  }

  return output
}

export function registerInfoCommand(program: Command): void {
  program
    .command("info <station-name>")
    .description("Get detailed information about a station")
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

      const effect: Effect.Effect<GetStationResponse, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        // Get station list to find the station token
        const stationListResponse: StationListResponse = yield* getStationList(session)
        const station = findStationByName(stationListResponse.stations, stationName)

        if (!station) {
          return yield* Effect.fail(
            new SessionError({
              message: `Station "${stationName}" not found. Use 'pandora stations list' to see available stations.`,
            })
          )
        }

        // Get detailed station info
        const stationInfo: GetStationResponse = yield* getStation(session, {
          stationToken: station.stationToken,
          includeExtendedAttributes: true,
        })

        return stationInfo
      })

      const result = await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      const output = formatStationInfo(result, {
        json: globalOpts.json,
      })

      console.log(output)
    })
}
