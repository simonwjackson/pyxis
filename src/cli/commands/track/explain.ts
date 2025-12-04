import { Effect } from "effect"
import { Command } from "commander"
import pc from "picocolors"
import { explainTrack } from "../../../client.js"
import type { ExplainTrackResponse } from "../../../types/api.js"
import type { PandoraError } from "../../../types/errors.js"
import { SessionError } from "../../../types/errors.js"
import { getSession } from "../../cache/session.js"
import { runEffect } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

type ExplainCommandOptions = GlobalOptions

function formatTrackExplanation(
  explanation: ExplainTrackResponse,
  options: { json: boolean }
): string {
  if (options.json) {
    const response = {
      success: true,
      data: explanation,
    }
    return JSON.stringify(response, null, 2)
  }

  const title = pc.bold("Music Genome Traits")
  const separator = "=".repeat(20)

  let output = title + "\n" + separator + "\n"
  
  if (explanation.explanations && explanation.explanations.length > 0) {
    output += "\nThis track was selected based on these Music Genome traits:\n\n"
    
    explanation.explanations.forEach((trait, index) => {
      output += "  " + (index + 1) + ". " + pc.cyan(trait.focusTraitName)
      output += " (" + trait.focusTraitId + ")\n"
    })
  } else {
    output += "\nNo trait explanations available for this track.\n"
  }

  return output
}

export function registerExplainCommand(program: Command): void {
  program
    .command("explain <track-token>")
    .description("Get Music Genome attributes explaining why this track was selected")
    .action(async (trackToken: string, command: Command) => {
      const parentCommand = command.parent as Command & {
        parent?: Command & { optsWithGlobals?: () => GlobalOptions }
      }
      const globalOpts: GlobalOptions = parentCommand.parent?.optsWithGlobals?.() ?? {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      const effect: Effect.Effect<ExplainTrackResponse, PandoraError> = Effect.gen(function* () {
        const session = yield* Effect.promise(() => getSession())

        if (!session) {
          return yield* Effect.fail(
            new SessionError({
              message: "No active session found",
            })
          )
        }

        const trackExplanation: ExplainTrackResponse = yield* explainTrack(session, trackToken)

        return trackExplanation
      })

      const result = await runEffect(effect, {
        verbose: globalOpts.verbose,
        json: globalOpts.json,
      })

      const output = formatTrackExplanation(result, {
        json: globalOpts.json,
      })

      console.log(output)
    })
}
