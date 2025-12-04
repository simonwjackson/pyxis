import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { shareMusic } from "../../../client.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type ShareCommandOptions = GlobalOptions

function formatShareSuccess(
  musicToken: string,
  email: string,
  options: { json: boolean }
): string {
  if (options.json) {
    const response = {
      success: true,
      data: {
        musicToken,
        email,
        message: "Track shared successfully"
      }
    }
    return JSON.stringify(response, null, 2)
  }

  return pc.green("✓") + " Track shared successfully with " + pc.bold(email)
}

export function registerShareCommand(program: Command): void {
  program
    .command("share <music-token> <email>")
    .description("Share a track via email")
    .action(async (musicToken: string, email: string, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const effect: Effect.Effect<Record<string, never>, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const result: Record<string, never> = yield* shareMusic(session, musicToken, email)

        return result
      })

      await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      const output = formatShareSuccess(musicToken, email, {
        json: globalOpts.json,
      })

      console.log(output)
    })
}
