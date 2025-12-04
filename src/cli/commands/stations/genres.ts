import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getGenreStations } from "../../../client.js"
import type { GenreCategory, GenreStation, GetGenreStationsResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import { formatTable, type OutputOptions } from "../../output/formatter.js"
import type { GlobalOptions } from "../../index.js"

type GenresOptions = {
  readonly category?: string
}

type GenresCommandOptions = GlobalOptions & GenresOptions

function filterByCategory(
  categories: readonly GenreCategory[],
  categoryName: string | undefined
): readonly GenreCategory[] {
  if (!categoryName) {
    return categories
  }

  const filtered = categories.filter(
    (cat) => cat.categoryName.toLowerCase().includes(categoryName.toLowerCase())
  )

  return filtered
}

function formatGenresTable(
  categories: readonly GenreCategory[],
  options: OutputOptions
): string {
  if (options.json) {
    const response = {
      success: true,
      data: {
        categories,
        totalCategories: categories.length,
        totalStations: categories.reduce((sum, cat) => sum + cat.stations.length, 0),
      },
    }
    return JSON.stringify(response, null, 2)
  }

  if (categories.length === 0) {
    return pc.dim("No genre categories found.")
  }

  const sections = categories.map((category) => {
    const categoryTitle = pc.bold(pc.cyan(category.categoryName))
    const separator = "-".repeat(category.categoryName.length)

    if (category.stations.length === 0) {
      return `${categoryTitle}\n${separator}\n${pc.dim("No stations in this category")}\n`
    }

    const rows = category.stations.map((station) => ({
      NAME: station.stationName,
      "STATION ID": station.stationId,
    }))

    const headers = ["NAME", "STATION ID"]
    const table = formatTable(headers, rows, { json: false })

    return `${categoryTitle}\n${separator}\n${table}\n`
  })

  const title = pc.bold("Pandora Genre Stations")
  const mainSeparator = "=".repeat(23)
  const totalCategories = categories.length
  const totalStations = categories.reduce((sum, cat) => sum + cat.stations.length, 0)
  const footer = `\nTotal: ${totalCategories} categories, ${totalStations} stations`

  return `${title}\n${mainSeparator}\n\n${sections.join("\n")}\n${footer}`
}

type GenreStationsResult = {
  readonly categories: readonly GenreCategory[]
}

export function registerGenresCommand(program: Command): void {
  program
    .command("genres")
    .description("List predefined genre stations")
    .option("-c, --category <name>", "Filter by category name (case-insensitive substring match)")
    .action(async (options: GenresOptions, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allOpts: GenresCommandOptions = {
        ...globalOpts,
        ...options,
      }

      const effect: Effect.Effect<GenreStationsResult, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const response: GetGenreStationsResponse = yield* getGenreStations(session!)

        const categories = filterByCategory(response.categories, allOpts.category)

        return {
          categories,
        }
      })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatGenresTable(result.categories, {
        json: allOpts.json,
      })

      console.log(output)
    })
}
