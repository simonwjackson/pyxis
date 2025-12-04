import { Command } from "commander"
import { registerListCommand } from "./list.js"
import { registerInfoCommand } from "./info.js"
import { registerQuickMixCommands } from "./quickmix.js"
import { registerCreateCommand } from "./create.js"
import { registerDeleteCommand } from "./delete.js"
import { registerRenameCommand } from "./rename.js"
import { registerSeedCommand } from "./seed.js"

export function registerStationsCommands(program: Command): void {
  const stations = program
    .command("stations")
    .description("Station management commands")

  registerListCommand(stations)
  registerInfoCommand(stations)
  registerQuickMixCommands(stations)
  registerCreateCommand(stations)
  registerDeleteCommand(stations)
  registerRenameCommand(stations)
  registerSeedCommand(stations)
}
