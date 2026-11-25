import { afterAll, beforeAll, expect, test } from "bun:test"
import { z } from "zod"
import { confirmAction } from "../src/mrtr"
import { runTool } from "../src/tools/result"
import { startHarness } from "./harness"

let harness: Awaited<ReturnType<typeof startHarness>>
beforeAll(async () => {
  harness = await startHarness({
    scopes: ["library:write"],
    register(server, pyxis) {
      server.registerTool(
        "create_playlist",
        { inputSchema: z.object({ title: z.string() }) },
        ({ title }, ctx) =>
          runTool(async () => {
            const prompt = confirmAction(ctx, `Create playlist ${title}?`)
            if (prompt) return prompt
            const result = await pyxis.call({
              _tag: "library.playlist.create",
              payload: { title, trackIds: [] },
            })
            return { structuredContent: { ...result.value }, content: [] }
          }),
      )
    },
  })
})
afterAll(async () => {
  await harness?.close()
})

const form = { elicitation: { form: {} } }
const call = async (
  title: string,
  capabilities: Record<string, unknown>,
  inputResponses?: Record<string, unknown>,
  token?: string,
) => {
  const response = await harness.post(
    "tools/call",
    { name: "create_playlist", arguments: { title }, inputResponses },
    { capabilities, ...(token && { token }) },
  )
  expect(response.status).toBe(200)
  return response.json()
}

test("a form-capable client confirms the concrete action on an independent retry", async () => {
  const title = "Confirmed"
  const question = z
    .object({
      result: z.object({
        resultType: z.literal("input_required"),
        inputRequests: z.record(
          z.string(),
          z.object({
            method: z.literal("elicitation/create"),
            params: z.object({ message: z.string() }),
          }),
        ),
      }),
    })
    .parse(await call(title, form))
  const [entry] = Object.entries(question.result.inputRequests)
  if (!entry) throw new Error("Missing confirmation request")
  const [key, request] = entry
  expect(request.params.message).toContain(title)
  for (const answer of [
    { action: "cancel" },
    { action: "decline" },
    { action: "accept", content: { confirm: false } },
  ]) {
    expect(await call(title, form, { [key]: answer })).toMatchObject({
      result: { resultType: "complete", content: [{ text: expect.stringContaining("no change") }] },
    })
  }
  const yes = { [key]: { action: "accept", content: { confirm: true } } }
  expect(await call("Changed target", form, yes)).toMatchObject({
    result: { resultType: "input_required" },
  })
  const before = await harness.owner.call({ _tag: "library.playlists.list", payload: {} })
  expect(before.value).not.toContainEqual(expect.objectContaining({ title }))
  expect(await call(title, form, yes)).toMatchObject({
    result: { resultType: "complete", structuredContent: { title } },
  })
})

test("a client without form support proceeds without a prompt", async () => {
  for (const capabilities of [{}, { elicitation: { url: {} } }]) {
    expect(await call("No form", capabilities)).toMatchObject({
      result: { resultType: "complete", structuredContent: { title: "No form" } },
    })
  }
})

test("tool execution returns the core scope failure without losing its code or retry policy", async () => {
  const token = await harness.owner.call({
    _tag: "auth.token.create",
    payload: { name: "reader", scopes: ["library:read"] },
  })
  if (token.status !== "ready") throw new Error("Could not create reader")
  expect(await call("Forbidden", {}, undefined, token.value.bearerToken)).toMatchObject({
    result: {
      isError: true,
      structuredContent: { code: "auth.insufficientScope", retryable: false },
    },
  })
})
