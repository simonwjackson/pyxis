import { Command } from "commander"
import { Effect } from "effect"
import pc from "picocolors"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import { findStationOrFail } from "../utils/findStation.js"
import { handleEffectError } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

async function likeCommand(trackToken: string, options: GlobalOptions & { station: string }): Promise<void> {
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

    const stationList = await Effect.runPromise(Client.getStationList(session))
    const station = await Effect.runPromise(
      findStationOrFail(stationList.stations, options.station)
    )

    const feedback = await Effect.runPromise(
      Client.addFeedback(session, station.stationToken, trackToken, true)
    )

    if (options.json) {
      console.log(JSON.stringify({ success: true, data: feedback }, null, 2))
      return
    }

    console.log(pc.green("Thumbs up added!"))
    console.log("Song: " + pc.bold(feedback.songName))
    console.log("Artist: " + pc.bold(feedback.artistName))
    console.log("Feedback ID: " + pc.dim(feedback.feedbackId))
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

export function registerLikeCommand(parent: Command): void {
  parent
    .command("like <track-token>")
    .description("Give a track a thumbs up")
    .requiredOption("-s, --station <name>", "Station name or token")
    .action(async (trackToken: string, cmdOpts: { station: string }) => {
      const program = parent.parent
      if (!program) {
        throw new Error("Could not access parent program")
      }
      const globalOpts = program.opts<GlobalOptions>()
      await likeCommand(trackToken, { ...globalOpts, station: cmdOpts.station })
    })
}
