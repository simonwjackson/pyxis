import { Command } from "commander"
import { Effect } from "effect"
import pc from "picocolors"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import { handleEffectError } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

async function sleepCommand(trackToken: string, options: GlobalOptions): Promise<void> {
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

    await Effect.runPromise(Client.sleepSong(session, trackToken))

    if (options.json) {
      console.log(JSON.stringify({ success: true, message: "Song marked as tired" }, null, 2))
      return
    }

    console.log(pc.blue("Song marked as tired (will not play for 30 days)"))
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

export function registerSleepCommand(parent: Command): void {
  parent
    .command("sleep <track-token>")
    .description("Mark a track as tired (will not play for 30 days)")
    .action(async (trackToken: string) => {
      const program = parent.parent
      if (!program) {
        throw new Error("Could not access parent program")
      }
      const opts = program.opts<GlobalOptions>()
      await sleepCommand(trackToken, opts)
    })
}
