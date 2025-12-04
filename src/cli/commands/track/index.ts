import { Command } from "commander"
import { registerInfoCommand } from "./info.js"
import { registerExplainCommand } from "./explain.js"
import { registerShareCommand } from "./share.js"
import { registerLikeCommand } from "./like.js"
import { registerDislikeCommand } from "./dislike.js"
import { registerSleepCommand } from "./sleep.js"
import { registerUnfeedbackCommand } from "./unfeedback.js"

export function registerTrackCommands(program: Command): void {
  const trackCommand = program
    .command("track")
    .description("Track information, sharing, and feedback operations")

  registerInfoCommand(trackCommand)
  registerExplainCommand(trackCommand)
  registerShareCommand(trackCommand)
  registerLikeCommand(trackCommand)
  registerDislikeCommand(trackCommand)
  registerSleepCommand(trackCommand)
  registerUnfeedbackCommand(trackCommand)
}
