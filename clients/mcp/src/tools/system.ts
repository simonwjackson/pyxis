import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { PyxisClient } from "../pyxis-client"
import { runTool } from "./result"

export function registerSystem(server: McpServer, pyxis: PyxisClient) {
  server.registerTool(
    "system.status",
    {
      description:
        "Read the running Pyxis version, contract, account and plugin counts and capabilities.",
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(async () => {
        const result = await pyxis.call({ _tag: "system.status.get", payload: {} })
        return { structuredContent: { ...result.value }, content: [] }
      }),
  )
}
