import { Command } from "commander"
import { Effect } from "effect"
import pc from "picocolors"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import { formatTable, formatError, type OutputOptions } from "../../output/formatter.js"
import { handleEffectError } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

async function getCommand(stationToken: string, options: GlobalOptions): Promise<void> {
  try {
    const config = await loadConfig(options.config)
    let session = await Session.getSession()

    if (!session) {
      if (!config.auth?.username || !config.auth?.password) {
        throw new Error("Not logged in. Run 'pandora auth login' first.")
      }
      session = await Effect.runPromise(
        Client.login(config.auth.username, config.auth.password)
      )
      if (options.cache) {
        await Session.saveSession(session, config.cache?.ttl)
      }
    }

    const playlist = await Effect.runPromise(
      Client.getPlaylist(session, { stationToken })
    )

    const outputOpts: OutputOptions = { json: options.json }

    if (options.json) {
      console.log(JSON.stringify({ success: true, data: playlist }, null, 2))
      return
    }

    const rows = playlist.items.map(item => ({
      Artist: item.artistName,
      Song: item.songName,
      Album: item.albumName || '—',
      Token: item.trackToken,
    }))

    console.log(formatTable(['Artist', 'Song', 'Album', 'Token'], rows, outputOpts))
    console.log(pc.dim(`\nTotal tracks: ${playlist.items.length}`))
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

async function skipCommand(options: GlobalOptions): Promise<void> {
  console.log(formatError(
    { code: "NOT_IMPLEMENTED", message: "Track skipping not yet implemented" },
    { json: options.json }
  ))
  process.exit(1)
}

async function rateCommand(trackToken: string, rating: string, options: GlobalOptions): Promise<void> {
  console.log(formatError(
    { code: "NOT_IMPLEMENTED", message: "Track rating not yet implemented" },
    { json: options.json }
  ))
  process.exit(1)
}

export function registerPlaylistCommands(program: Command): void {
  const playlist = program
    .command("playlist")
    .description("Playlist commands")

  playlist
    .command("get <station-token>")
    .description("Get playlist for a station")
    .action(async (stationToken: string) => {
      const opts = program.opts<GlobalOptions>()
      await getCommand(stationToken, opts)
    })

  playlist
    .command("skip")
    .description("Skip current track")
    .action(async () => {
      const opts = program.opts<GlobalOptions>()
      await skipCommand(opts)
    })

  playlist
    .command("rate <track-token> <rating>")
    .description("Rate a track (rating: up|down)")
    .action(async (trackToken: string, rating: string) => {
      const opts = program.opts<GlobalOptions>()
      await rateCommand(trackToken, rating, opts)
    })
}
