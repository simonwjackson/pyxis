import type { CallToolResult, InputRequiredResult } from "@modelcontextprotocol/server"
import { PyxisError } from "../pyxis-client"

export async function runTool(run: () => Promise<CallToolResult | InputRequiredResult>) {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof PyxisError)) throw error
    return {
      isError: true,
      structuredContent: { ...error.failure },
      content: [{ type: "text" as const, text: JSON.stringify(error.failure) }],
    }
  }
}
