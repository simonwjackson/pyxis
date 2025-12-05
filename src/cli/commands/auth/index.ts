import { Command } from "commander"
import { Effect } from "effect"
import pc from "picocolors"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import { formatSuccess, formatError, type OutputOptions } from "../../output/formatter.js"
import { handleEffectError } from "../../errors/handler.js"
import type { GlobalOptions } from "../../index.js"

async function loginCommand(options: GlobalOptions): Promise<void> {
  try {
    const config = await loadConfig(options.config)

    // Get credentials from config (which includes env vars)
    const username = config.auth?.username ?? process.env.PANDORA_USERNAME
    const password = config.auth?.password ?? process.env.PANDORA_PASSWORD

    if (!username || !password) {
      console.error(pc.red(pc.bold("Error: Missing Credentials")))
      console.error("")
      console.error("Provide credentials via environment variables:")
      console.error("  $ export PANDORA_USERNAME=your@email.com")
      console.error("  $ export PANDORA_PASSWORD=yourpassword")
      console.error("")
      console.error("Or add them to your config file:")
      console.error("  $ pyxis config init")
      process.exit(3)
    }

    const session = await Effect.runPromise(
      Client.login(username, password)
    )

    if (options.cache) {
      await Session.saveSession(session, config.cache?.ttl)
    }

    const outputOpts: OutputOptions = { json: options.json }
    console.log(formatSuccess("Successfully logged in to Pandora", outputOpts))

    if (options.verbose) {
      console.log(pc.dim(`User ID: ${session.userId}`))
      console.log(pc.dim(`Session cached: ${options.cache ? 'yes' : 'no'}`))
    }
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

async function logoutCommand(options: GlobalOptions): Promise<void> {
  try {
    await Session.clearSession()

    const outputOpts: OutputOptions = { json: options.json }
    console.log(formatSuccess("Successfully logged out (session cache cleared)", outputOpts))
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

async function statusCommand(options: GlobalOptions): Promise<void> {
  try {
    const sessionInfo = await Session.getSessionInfo()
    const outputOpts: OutputOptions = { json: options.json }

    if (!sessionInfo) {
      console.log(formatError(
        { code: "NO_SESSION", message: "No cached session found" },
        outputOpts
      ))
      process.exit(1)
    }

    if (!sessionInfo.valid) {
      console.log(formatError(
        { code: "INVALID_SESSION", message: "Cached session is invalid or expired" },
        outputOpts
      ))
      console.log(pc.dim(`Cache path: ${sessionInfo.cachePath}`))
      process.exit(1)
    }

    console.log(formatSuccess("Valid session found", outputOpts))

    if (sessionInfo.expiresIn !== undefined) {
      const minutes = Math.floor(sessionInfo.expiresIn / 60)
      const seconds = sessionInfo.expiresIn % 60
      console.log(pc.dim(`Expires in: ${minutes}m ${seconds}s`))
    }

    if (options.verbose) {
      console.log(pc.dim(`Cache path: ${sessionInfo.cachePath}`))
    }
  } catch (error) {
    handleEffectError(error, { json: options.json, verbose: options.verbose })
    process.exit(1)
  }
}

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication commands")

  auth
    .command("login")
    .description("Login to Pandora")
    .action(async () => {
      const opts = program.opts<GlobalOptions>()
      await loginCommand(opts)
    })

  auth
    .command("logout")
    .description("Logout from Pandora")
    .action(async () => {
      const opts = program.opts<GlobalOptions>()
      await logoutCommand(opts)
    })

  auth
    .command("status")
    .description("Check authentication status")
    .action(async () => {
      const opts = program.opts<GlobalOptions>()
      await statusCommand(opts)
    })
}
