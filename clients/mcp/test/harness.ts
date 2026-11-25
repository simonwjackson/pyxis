import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PyxisClient } from "../src/pyxis-client"
import { protocolVersion, serveMcp } from "../src/server"
import type { registerTools } from "../src/tools/registry"

const root = fileURLToPath(new URL("../../../", import.meta.url))

async function startCore(stateDir: string, loopbackMedia = false) {
  const binary = resolve(root, process.env.CARGO_TARGET_DIR ?? "target", "debug/pyxis")
  const processHandle = Bun.spawn(
    [binary, "--state-dir", stateDir, "--host", "127.0.0.1", "--port", "0"],
    {
      env: {
        PATH: stateDir,
        HOME: stateDir,
        PYXIS_LOG: "info",
        ...(loopbackMedia && { PYXIS_LAN_BASE_URL: "http://127.0.0.1:0" }),
      },
      stdout: "pipe",
      stderr: "inherit",
    },
  )
  const close = async () => {
    processHandle.kill()
    await processHandle.exited
  }
  // Read the OS-assigned port from the listening event rather than racing a port reservation.
  const readyTimeout = setTimeout(() => processHandle.kill(), 15_000)
  try {
    const output = processHandle.stdout.pipeThrough(new TextDecoderStream())
    const reader = output.getReader()
    let line = ""
    while (true) {
      const { value, done } = await reader.read()
      if (done) throw new Error("Pyxis exited before listening")
      line += value
      const address = line
        .split("\n")
        .slice(0, -1)
        .find((item) => item.includes("pyxis listening"))
        ?.match(/127\.0\.0\.1:\d+/)?.[0]
      if (address) {
        reader.releaseLock()
        void output.pipeTo(new WritableStream())
        return { baseUrl: new URL(`http://${address}`), close }
      }
      line = line.slice(line.lastIndexOf("\n") + 1)
    }
  } catch (error) {
    await close()
    throw error
  } finally {
    clearTimeout(readyTimeout)
  }
}

export async function startHarness(
  options: {
    register?: typeof registerTools
    loopbackMedia?: boolean
    scopes?: string[]
    prepareState?: (stateDir: string) => Promise<void>
  } = {},
) {
  const stateDir = await mkdtemp(join(tmpdir(), "pyxis-mcp-"))
  let core: Awaited<ReturnType<typeof startCore>> | undefined
  let mcp: ReturnType<typeof serveMcp> | undefined
  const close = async () => {
    await mcp?.close()
    await core?.close()
    await rm(stateDir, { recursive: true, force: true })
  }
  try {
    await options.prepareState?.(stateDir)
    core = await startCore(stateDir, options.loopbackMedia)
    const { baseUrl } = core
    const device = await new PyxisClient(baseUrl).call({
      _tag: "auth.device.claim",
      payload: { name: "bootstrap" },
    })
    if (device.status !== "ready") throw new Error("Could not claim default account")
    const account = await new PyxisClient(baseUrl, `Bearer ${device.value.bearerToken}`).call({
      _tag: "account.create",
      payload: { name: "MCP", deviceName: "owner" },
    })
    if (account.status !== "ready") throw new Error("Could not create test account")
    const owner = new PyxisClient(baseUrl, `Bearer ${account.value.bearerToken}`)
    const token = await owner.call({
      _tag: "auth.token.create",
      payload: { name: "agent", scopes: options.scopes ?? ["session:read"] },
    })
    if (token.status !== "ready") throw new Error("Could not create API token")
    mcp = serveMcp({ hostname: "127.0.0.1", port: 0, baseUrl }, options.register)
    const endpoint = new URL("/mcp", mcp.url)
    return {
      close,
      baseUrl,
      endpoint,
      owner,
      device: account.value,
      token: token.value,
      post(
        method: string,
        params: Record<string, unknown> = {},
        options: {
          signal?: AbortSignal
          headers?: Record<string, string>
          token?: string | null
          version?: string
          capabilities?: Record<string, unknown>
        } = {},
      ) {
        const version = options.version ?? protocolVersion
        const bearer = options.token === undefined ? token.value.bearerToken : options.token
        const name = params.name ?? params.uri
        return fetch(endpoint, {
          ...(options.signal && { signal: options.signal }),
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": version,
            "Mcp-Method": method,
            ...(typeof name === "string" ? { "Mcp-Name": name } : {}),
            ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
            ...options.headers,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method,
            params: {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": version,
                "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
                "io.modelcontextprotocol/clientCapabilities": options.capabilities ?? {},
              },
              ...params,
            },
          }),
        })
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}
