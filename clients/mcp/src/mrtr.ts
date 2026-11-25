import { createHash } from "node:crypto"
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type ServerContext,
} from "@modelcontextprotocol/server"
import { z } from "zod"

// Confirm the concrete action, not just the tool. If target resolution changes
// on retry, its prompt changes too and the old answer cannot confirm it.
export function confirmAction(ctx: ServerContext, message: string) {
  const key = createHash("sha256").update(message).digest("hex")
  const answer = inputResponse(ctx.mcpReq.inputResponses, key)
  if (answer.kind === "elicit") {
    if (answer.action === "accept" && answer.content?.confirm === true) return
    return { content: [{ type: "text" as const, text: "Action not confirmed; no change made." }] }
  }
  const envelope: Record<string, unknown> = ctx.mcpReq.envelope ?? {}
  const capabilities = z
    .object({
      elicitation: z.object({ form: z.object({}).optional(), url: z.object({}).optional() }),
    })
    .safeParse(envelope[CLIENT_CAPABILITIES_META_KEY])
  if (!capabilities.success) return
  const { form, url } = capabilities.data.elicitation
  if (!form && url) return
  return inputRequired({
    inputRequests: {
      [key]: inputRequired.elicit({
        message,
        requestedSchema: {
          type: "object",
          properties: { confirm: { type: "boolean", title: "Confirm" } },
          required: ["confirm"],
        },
      }),
    },
  })
}
