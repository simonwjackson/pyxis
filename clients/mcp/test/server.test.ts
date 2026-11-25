import { afterAll, beforeAll, expect, test } from "bun:test"
import { protocolVersion } from "../src/server"
import { startHarness } from "./harness"

let harness: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  harness = await startHarness()
})
afterAll(async () => {
  await harness?.close()
})
const args = { name: "system.status", arguments: {} }

test("the first call reads the real zero-plugin core with a narrowly scoped API token", async () => {
  const response = await harness.post("tools/call", args)
  expect(response.status).toBe(200)
  expect(response.headers.get("mcp-session-id")).toBeNull()
  expect(await response.json()).toMatchObject({
    result: {
      resultType: "complete",
      structuredContent: {
        pluginCount: 0,
        capabilities: [],
        accountCount: 2,
        contractId: "pyxis-rpc-v4",
      },
    },
  })
})

test("discovery advertises only the modern revision, and tools/list includes system.status", async () => {
  expect(await (await harness.post("server/discover")).json()).toMatchObject({
    result: { supportedVersions: [protocolVersion], capabilities: { tools: {} } },
  })
  expect(await (await harness.post("tools/list")).json()).toMatchObject({
    result: { tools: expect.arrayContaining([expect.objectContaining({ name: "system.status" })]) },
  })
})

test("Pyxis authorization is required even for discovery and public status", async () => {
  for (const [method, params] of [
    ["tools/call", args],
    ["server/discover", {}],
  ] as const) {
    const response = await harness.post(method, params, { token: null })
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe("Bearer")
  }
})

test("a previously working token stops working immediately on revocation", async () => {
  const created = await harness.owner.call({
    _tag: "auth.token.create",
    payload: { name: "revocable", scopes: ["account:read"] },
  })
  if (created.status !== "ready") throw new Error("token creation failed")
  const options = { token: created.value.bearerToken }
  expect((await harness.post("tools/call", args, options)).status).toBe(200)
  await harness.owner.call({
    _tag: "auth.token.revoke",
    payload: { tokenId: created.value.token.id },
  })
  const response = await harness.post("tools/call", args, options)
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: "auth.invalidToken", retryable: false })
})

test("an unsupported version is rejected with the supported revision", async () => {
  const response = await harness.post("tools/list", {}, { version: "2099-01-01" })
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({
    error: { code: -32022, data: { supported: [protocolVersion] } },
  })
})

for (const [header, value] of [
  ["Mcp-Method", "tools/list"],
  ["Mcp-Name", "some.other.tool"],
] as const) {
  test(`a mismatched ${header} fails before dispatch`, async () => {
    const response = await harness.post("tools/call", args, { headers: { [header]: value } })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: -32020 } })
  })
}

test("the health endpoint needs no token and browser origins cannot call MCP", async () => {
  expect((await fetch(new URL("/healthz", harness.endpoint))).status).toBe(200)
  expect(
    (await harness.post("tools/call", args, { headers: { origin: "https://foreign.invalid" } }))
      .status,
  ).toBe(403)
})

test("a device credential cannot be used as an agent's delegated API token", async () => {
  const response = await harness.post("tools/call", args, { token: harness.device.bearerToken })
  expect(response.status).toBe(401)
})

test("a legacy initialization cannot start a session", async () => {
  const response = await fetch(harness.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${harness.token.bearerToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "legacy", version: "1" },
      },
    }),
  })
  expect(response.status).toBe(400)
  expect(response.headers.get("mcp-session-id")).toBeNull()
})
