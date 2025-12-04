#!/usr/bin/env node

import { Command } from "commander"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import pc from "picocolors"
import {
  registerAuthCommands,
  registerStationsCommands,
  registerPlaylistCommands,
  registerConfigCommands,
  registerSearchCommand,
  registerBookmarksCommands,
  registerAccountCommands,
  registerTrackCommands,
} from "./commands/index.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = join(__dirname, "../../package.json")
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  version: string
  name: string
}

export type GlobalOptions = {
  json: boolean
  cache: boolean
  config?: string
  verbose: boolean
  quiet: boolean
}

export type CliContext = {
  options: GlobalOptions
}

function main(): void {
  const program = new Command()

  program
    .name("pandora")
    .description("Unofficial Pandora music service API client")
    .version(packageJson.version, "-V, --version", "Show version")
    .helpOption("-h, --help", "Show help")

  program
    .option("-j, --json", "Output in JSON format", false)
    .option("--no-cache", "Skip session caching")
    .option("-c, --config <path>", "Custom config file path")
    .option("-v, --verbose", "Verbose output", false)
    .option("-q, --quiet", "Suppress non-essential output", false)

  program.hook("preAction", (thisCommand, actionCommand) => {
    const opts = program.opts<GlobalOptions>()

    if (opts.verbose && opts.quiet) {
      console.error(pc.red("Error: Cannot use both --verbose and --quiet"))
      process.exit(1)
    }

    const commandWithContext = actionCommand as Command & { context?: CliContext }
    commandWithContext.context = {
      options: opts
    }
  })

  registerAuthCommands(program)
  registerStationsCommands(program)
  registerPlaylistCommands(program)
  registerConfigCommands(program)
  registerSearchCommand(program)
  registerBookmarksCommands(program)
  registerTrackCommands(program)
  registerAccountCommands(program)

  program.addHelpText("after", "\n\n" + pc.bold("Examples:") + "\n  $ pandora auth login\n  $ pandora stations list --json\n  $ pandora playlist get <station-id>\n  $ pandora search \"pink floyd\" --type artist\n  $ pandora account settings\n  $ pandora account usage\n  $ pandora config init\n  $ pandora --config ~/.pandora.yaml stations list\n  $ pandora --verbose auth status\n")

  program.parse()
}

main()
