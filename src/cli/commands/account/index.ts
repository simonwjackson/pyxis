import { Command } from "commander"
import { registerSettingsCommand } from "./settings.js"
import { registerUsageCommand } from "./usage.js"
import { registerSetCommand } from "./set.js"

export function registerAccountCommands(program: Command): void {
  const account = program
    .command("account")
    .description("Account information commands")

  registerSettingsCommand(account)
  registerUsageCommand(account)
  registerSetCommand(account)
}
