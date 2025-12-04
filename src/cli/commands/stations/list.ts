import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getStationList } from "../../../client.js"
import type { Station, StationListResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import { formatTable, type OutputOptions } from "../../output/formatter.js"
import type { GlobalOptions } from "../../index.js"

type SortField = "name" | "created" | "recent"

type ListOptions = {
  readonly sort: SortField
  readonly limit?: number
}

type ListCommandOptions = GlobalOptions & ListOptions

function sortStations(stations: readonly Station[], sortField: SortField): Station[] {
  const mutableStations = [...stations]

  switch (sortField) {
    case "name":
      return mutableStations.sort((a, b) =>
        a.stationName.localeCompare(b.stationName)
      )
    case "created":
      return mutableStations.reverse()
    case "recent":
      return mutableStations
    default: {
      const _exhaustive: never = sortField
      return _exhaustive
    }
  }
}

function limitStations(stations: Station[], limit: number | undefined): Station[] {
  if (limit === undefined || limit <= 0) {
    return stations
  }
  return stations.slice(0, limit)
}

function formatStationsTable(
  stations: readonly Station[],
  options: OutputOptions
): string {
  if (options.json) {
    const response = {
      success: true,
      data: {
        stations,
        count: stations.length,
      },
    }
    return JSON.stringify(response, null, 2)
  }

  if (stations.length === 0) {
    return pc.dim("No stations found. Create one with: pandora stations create")
  }

  const rows = stations.map((station) => ({
    NAME: station.stationName,
    "STATION ID": station.stationId,
  }))

  const headers = ["NAME", "STATION ID"]
  const table = formatTable(headers, rows, { json: false })

  const title = pc.bold("Your Pandora Stations")
  const separator = "=".repeat(21)
  const pluralSuffix = stations.length === 1 ? "" : "s"
  const footer = `\nTotal: ${stations.length} station${pluralSuffix}`

  return `${title}\n
${separator}\n\n${table}\n
${footer}`
}

type StationListResult = {
  readonly stations: Station[]
  readonly count: number
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List all stations")
    .option("-s, --sort <field>", "Sort by: name, created, recent", "recent")
    .option("-l, --limit <n>", "Limit number of results", parseInt)
    .action(async (options: ListOptions, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allOpts: ListCommandOptions = {
        ...globalOpts,
        ...options,
      }

      const validSortFields: SortField[] = ["name", "created", "recent"]
      if (!validSortFields.includes(allOpts.sort)) {
        console.error(
          pc.red(
            `Invalid sort field: ${allOpts.sort}. Must be one of: ${validSortFields.join(", ")}`
          )
        )
        process.exit(2)
      }

      const effect: Effect.Effect<StationListResult, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const response: StationListResponse = yield* getStationList(session!)

        let stations = sortStations(response.stations, allOpts.sort)
        stations = limitStations(stations, allOpts.limit)

        return {
          stations,
          count: stations.length,
        }
      })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatStationsTable(result.stations, {
        json: allOpts.json,
      })

      console.log(output)
    })
}
