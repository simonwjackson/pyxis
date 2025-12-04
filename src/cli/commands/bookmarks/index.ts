import { Command } from "commander"
import { registerListCommand } from "./list.js"
import { registerAddCommand } from "./add.js"
import { registerDeleteCommand } from "./delete.js"

export function registerBookmarksCommands(program: Command): void {
  const bookmarks = program
    .command("bookmarks")
    .description("Manage your Pandora bookmarks")

  registerListCommand(bookmarks)
  registerAddCommand(bookmarks)
  registerDeleteCommand(bookmarks)
}
