import { Command } from "commander"
import { Effect } from "effect"
import pc from "picocolors"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import { handleEffectError } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

async function unfeedbackCommand(feedbackId: string, options: GlobalOptions): Promise<void> {
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

    await Effect.runPromise(Client.deleteFeedback(session, feedbackId))

    if (options.json) {
      console.log(JSON.stringify({ success: true, message: "Feedback removed" }, null, 2))
      return
    }

    console.log(pc.green("Feedback removed successfully"))
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

export function registerUnfeedbackCommand(parent: Command): void {
  parent
    .command("unfeedback <feedback-id>")
    .description("Remove a rating (thumbs up/down)")
    .action(async (feedbackId: string) => {
      const program = parent.parent
      if (!program) {
        throw new Error("Could not access parent program")
      }
      const opts = program.opts<GlobalOptions>()
      await unfeedbackCommand(feedbackId, opts)
    })
}
