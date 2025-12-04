import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { getBookmarks } from "../../../client.js"
import type {
  ArtistBookmark,
  SongBookmark,
  GetBookmarksResponse,
} from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import { formatTable, type OutputOptions } from "../../output/formatter.js"
import type { GlobalOptions } from "../../index.js"

type BookmarkType = "artists" | "songs" | "all"

type ListOptions = {
  readonly type: BookmarkType
}

type ListCommandOptions = GlobalOptions & ListOptions

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString()
}

function formatArtistsTable(
  artists: readonly ArtistBookmark[],
  options: OutputOptions
): string {
  if (options.json) {
    return JSON.stringify(
      {
        success: true,
        data: {
          artists,
          count: artists.length,
        },
      },
      null,
      2
    )
  }

  if (artists.length === 0) {
    return pc.dim("No artist bookmarks found.")
  }

  const rows = artists.map((artist) => ({
    ARTIST: artist.artistName,
    DATE: formatDate(artist.dateCreated.time),
  }))

  const headers = ["ARTIST", "DATE"]
  return formatTable(headers, rows, { json: false })
}

function formatSongsTable(
  songs: readonly SongBookmark[],
  options: OutputOptions
): string {
  if (options.json) {
    return JSON.stringify(
      {
        success: true,
        data: {
          songs,
          count: songs.length,
        },
      },
      null,
      2
    )
  }

  if (songs.length === 0) {
    return pc.dim("No song bookmarks found.")
  }

  const rows = songs.map((song) => ({
    SONG: song.songName,
    ARTIST: song.artistName,
    ALBUM: song.albumName ?? "-",
    DATE: formatDate(song.dateCreated.time),
  }))

  const headers = ["SONG", "ARTIST", "ALBUM", "DATE"]
  return formatTable(headers, rows, { json: false })
}

function formatBookmarksTable(
  response: GetBookmarksResponse,
  bookmarkType: BookmarkType,
  options: OutputOptions
): string {
  if (options.json) {
    const data: Record<string, unknown> = {}
    let count = 0

    if (bookmarkType === "artists" || bookmarkType === "all") {
      data.artists = response.artists ?? []
      count += (response.artists ?? []).length
    }

    if (bookmarkType === "songs" || bookmarkType === "all") {
      data.songs = response.songs ?? []
      count += (response.songs ?? []).length
    }

    return JSON.stringify(
      {
        success: true,
        data: { ...data, count },
      },
      null,
      2
    )
  }

  const parts: string[] = []

  if (bookmarkType === "artists" || bookmarkType === "all") {
    const artists = response.artists ?? []
    parts.push(pc.bold("Artist Bookmarks"))
    parts.push("=".repeat(17))
    parts.push(formatArtistsTable(artists, options))
    const pluralSuffix = artists.length === 1 ? "" : "s"
    parts.push("\nTotal: " + artists.length + " artist" + pluralSuffix)
  }

  if (bookmarkType === "songs" || bookmarkType === "all") {
    if (parts.length > 0) {
      parts.push("\n")
    }
    const songs = response.songs ?? []
    parts.push(pc.bold("Song Bookmarks"))
    parts.push("=".repeat(15))
    parts.push(formatSongsTable(songs, options))
    const pluralSuffix = songs.length === 1 ? "" : "s"
    parts.push("\nTotal: " + songs.length + " song" + pluralSuffix)
  }

  return parts.join("\n")
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List your bookmarks")
    .option(
      "-t, --type <type>",
      "Bookmark type: artists, songs, or all",
      "all"
    )
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

      const validTypes: BookmarkType[] = ["artists", "songs", "all"]
      if (!validTypes.includes(allOpts.type)) {
        console.error(
          pc.red(
            "Invalid bookmark type: " + allOpts.type + ". Must be one of: " + validTypes.join(", ")
          )
        )
        process.exit(2)
      }

      const effect: Effect.Effect<GetBookmarksResponse, PandoraError> =
        Effect.gen(function* () {
          const session = yield* Effect.promise(() => getSession())

          if (!session) {
            return yield* Effect.fail(
              new SessionError({
                message: "No active session found",
              })
            )
          }

          const response: GetBookmarksResponse = yield* getBookmarks(session!)

          return response
        })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatBookmarksTable(result, allOpts.type, {
        json: allOpts.json,
      })

      console.log(output)
    })
}
