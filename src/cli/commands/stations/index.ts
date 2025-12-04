import { Command } from "commander"
import { registerListCommand } from "./list.js"

export function registerStationsCommands(program: Command): void {
  const stations = program
    .command("stations")
    .description("Station management commands")

  registerListCommand(stations)
}
