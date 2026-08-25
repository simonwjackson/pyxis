import { describe, expect, test } from "bun:test"
import { createPluginRuntime, PluginCapability } from "@pyxis/plugin-sdk"
import { verifyPlugin } from "@pyxis/plugin-sdk/testing"
import type { SoulseekNetwork } from "./client"
import { createSoulseekPlugin } from "./index"
import { SoulseekUpgradeProvider } from "./upgrade"

function network(): SoulseekNetwork {
  return {
    search: async () => [],
    download: async () => 0,
    close: () => undefined,
  }
}

function call(operation: string, input: unknown): string {
  return JSON.stringify({
    id: operation,
    request: {
      _tag: "capability.call",
      payload: {
        capability: "provider",
        operation,
        input,
        accountId: "default",
        config: { username: "listener", password: "secret" },
      },
    },
  })
}

describe("Soulseek fidelity plugin", () => {
  test("is provider-only and passes SDK conformance", async () => {
    const plugin = createSoulseekPlugin(new SoulseekUpgradeProvider(async () => network()))
    await expect(verifyPlugin(plugin, [])).resolves.toEqual({ passed: true, checks: 3 })
    expect(plugin.manifest.capabilities).toEqual([PluginCapability.Provider])
    expect(Object.keys(plugin.capabilities.provider ?? {}).sort()).toEqual([
      "upgrade.download",
      "upgrade.search",
    ])
  })

  test("the pinned dependency advertises zero shared folders and files", async () => {
    const patch = await Bun.file(
      new URL("../../../patches/soulseek-ts@2.1.4.patch", import.meta.url),
    ).text()
    expect(patch).toContain('sharedFoldersFiles", { dirs: 0, files: 0 }')
    expect(patch).toContain("sharedFoldersFiles', { dirs: 0, files: 0 }")
    expect(patch).toContain("maxOutputLength: 8 * 1024 * 1024")
    expect(patch).toContain("results.length < 100")
    expect(patch).toContain("MAX_MESSAGE_BYTES = 16 * 1024 * 1024")
    expect(patch).toContain("msgs.on('error', () => c.destroy())")
    expect(patch).toContain("console.error('Failed to parse peer message', error)")
    expect(patch).toContain("this.conn.destroy()")
  })

  test("maps malformed requests to permanent failures", async () => {
    const runtime = createPluginRuntime(
      createSoulseekPlugin(new SoulseekUpgradeProvider(async () => network())),
    )
    const result = await runtime.handleLine(call("upgrade.search", { track: {} }))
    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "soulseek.invalidInput", retryable: false },
          },
        },
      },
    })
  })
})
