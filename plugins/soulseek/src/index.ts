import {
  type CapabilityContext,
  definePlugin,
  PluginCapability,
  PluginOperationError,
  runPlugin,
} from "@pyxis/plugin-sdk"
import { SoulseekUpgradeProvider } from "./upgrade"

export function createSoulseekPlugin(provider = new SoulseekUpgradeProvider()) {
  return definePlugin({
    manifest: {
      id: "soulseek",
      name: "Soulseek Fidelity",
      version: "1.0.0",
      capabilities: [PluginCapability.Provider],
      configSchema: {
        type: "object",
        required: ["username", "password"],
        additionalProperties: false,
        properties: {
          username: { type: "string", minLength: 1 },
          password: { type: "string", minLength: 1 },
          listenPort: { type: "integer", minimum: 1024, maximum: 65_535 },
          searchTimeoutMs: { type: "integer", minimum: 1000, maximum: 25_000 },
          downloadTimeoutMs: { type: "integer", minimum: 5000, maximum: 21_600_000 },
          maxFileBytes: { type: "integer", minimum: 1024, maximum: 2_147_483_648 },
          maxResults: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    capabilities: {
      provider: {
        "upgrade.search": (input, context) =>
          providerCall(() => provider.search(accountId(context), context.config, input)),
        "upgrade.download": (input, context) =>
          providerCall(() => provider.download(accountId(context), context.config, input)),
      },
    },
  })
}

if (import.meta.main) await runPlugin(createSoulseekPlugin())

function accountId(context: CapabilityContext): string {
  if (context.accountId === undefined || context.accountId.length === 0) {
    throw new PluginOperationError(
      "soulseek.accountRequired",
      "Soulseek upgrades require an account context",
      false,
    )
  }
  return context.accountId
}

async function providerCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PluginOperationError) throw error
    const message = error instanceof Error ? error.message : "Soulseek operation failed"
    const invalid = /must|required|missing field|unknown field|bounds|expired|config/iu.test(
      message,
    )
    throw new PluginOperationError(
      invalid ? "soulseek.invalidInput" : "soulseek.unavailable",
      redact(message),
      !invalid,
    )
  }
}

function redact(message: string): string {
  return message
    .replace(/password\s*[=:]\s*\S+/giu, "password=[redacted]")
    .replace(/[/\\][^\s]+\.partial/gu, "[staging-path]")
    .slice(0, 500)
}
