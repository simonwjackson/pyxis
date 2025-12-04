import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { addArtistBookmark, addSongBookmark } from "../../../client.js"
import type {
  AddArtistBookmarkResponse,
  AddSongBookmarkResponse,
} from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type BookmarkType = "artist" | "song"

type AddOptions = Record<string, unknown>

type AddCommandOptions = GlobalOptions & AddOptions

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString()
}

function formatArtistBookmark(
  result: AddArtistBookmarkResponse,
  options: { readonly json: boolean }
): string {
  if (options.json) {
    return JSON.stringify(
      {
        success: true,
        data: result,
      },
      null,
      2
    )
  }

  const lines: string[] = []
  lines.push(pc.green("Artist bookmark added successfully!"))
  lines.push("")
  lines.push(pc.bold("Artist:") + " " + result.artistName)
  lines.push(pc.bold("Bookmark Token:") + " " + result.bookmarkToken)
  lines.push(pc.bold("Music Token:") + " " + result.musicToken)
  lines.push(pc.bold("Date Created:") + " " + formatDate(result.dateCreated.time))

  return lines.join("\n")
}

function formatSongBookmark(
  result: AddSongBookmarkResponse,
  options: { readonly json: boolean }
): string {
  if (options.json) {
    return JSON.stringify(
      {
        success: true,
        data: result,
      },
      null,
      2
    )
  }

  const lines: string[] = []
  lines.push(pc.green("Song bookmark added successfully!"))
  lines.push("")
  lines.push(pc.bold("Song:") + " " + result.songName)
  lines.push(pc.bold("Artist:") + " " + result.artistName)
  if (result.albumName) {
    lines.push(pc.bold("Album:") + " " + result.albumName)
  }
  lines.push(pc.bold("Bookmark Token:") + " " + result.bookmarkToken)
  lines.push(pc.bold("Music Token:") + " " + result.musicToken)
  lines.push(pc.bold("Date Created:") + " " + formatDate(result.dateCreated.time))

  return lines.join("\n")
}

export function registerAddCommand(program: Command): void {
  const add = program
    .command("add")
    .description("Add a bookmark from a track token")

  add
    .command("artist")
    .description("Bookmark an artist from a track token")
    .argument("<track-token>", "Track token from playlist output")
    .action(async (trackToken: string, options: AddOptions, command: Command) => {
      const parentCommand = command.parent?.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allOpts: AddCommandOptions = {
        ...globalOpts,
        ...options,
      }

      const effect: Effect.Effect<AddArtistBookmarkResponse, PandoraError> =
        Effect.gen(function* () {
          const session = yield* Effect.promise(() => getSession())

          if (!session) {
            return yield* Effect.fail(
              new SessionError({
                message: "No active session found",
              })
            )
          }

          const response: AddArtistBookmarkResponse = yield* addArtistBookmark(
            session,
            { trackToken }
          )

          return response
        })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatArtistBookmark(result, { json: allOpts.json })
      console.log(output)
    })

  add
    .command("song")
    .description("Bookmark a song from a track token")
    .argument("<track-token>", "Track token from playlist output")
    .action(async (trackToken: string, options: AddOptions, command: Command) => {
      const parentCommand = command.parent?.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const allOpts: AddCommandOptions = {
        ...globalOpts,
        ...options,
      }

      const effect: Effect.Effect<AddSongBookmarkResponse, PandoraError> =
        Effect.gen(function* () {
          const session = yield* Effect.promise(() => getSession())

          if (!session) {
            return yield* Effect.fail(
              new SessionError({
                message: "No active session found",
              })
            )
          }

          const response: AddSongBookmarkResponse = yield* addSongBookmark(
            session,
            { trackToken }
          )

          return response
        })

      const result = await runEffect(effect, {
        verbose: allOpts.verbose,
        json: allOpts.json,
      })

      const output = formatSongBookmark(result, { json: allOpts.json })
      console.log(output)
    })
}
