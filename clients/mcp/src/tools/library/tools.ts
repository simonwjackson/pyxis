import type {
  CallToolResult,
  InputRequiredResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server"
import { z } from "zod"
import { RpcAlbumSort, type RpcTagExpression } from "../../../../../contracts/generated/pyxis"
import { type PyxisClient, PyxisError } from "../../pyxis-client"
import { runTool } from "../result"

export function tool<S extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: S,
  mode: "read" | "write",
  handle: (
    args: z.output<z.ZodObject<S>>,
    ctx: ServerContext,
  ) => Promise<CallToolResult | InputRequiredResult>,
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: z.strictObject(shape),
      annotations: { readOnlyHint: mode === "read" },
    },
    (args, ctx) => runTool(() => handle(args, ctx)),
  )
}
export function data(structuredContent: Record<string, unknown>, isError = false): CallToolResult {
  return isError
    ? {
        isError,
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      }
    : { structuredContent, content: [] }
}
export function outcome(value: { status: string; value?: unknown }): CallToolResult {
  return data({ ...value }, ["unknown", "conflict", "unknownPlaylist"].includes(value.status))
}
export function invalid(message: string): never {
  throw new PyxisError({ code: "mcp.invalid", message, retryable: false })
}
export const id = z.string().min(1)
export const page = { limit: z.int().min(1).max(100).optional(), cursor: id.optional() }
export const sort = z.enum(RpcAlbumSort)
export const expression: z.ZodType<RpcTagExpression> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.strictObject({ op: z.literal("tag"), value: id }),
    z.strictObject({ op: z.literal("and"), value: z.array(expression).min(1) }),
    z.strictObject({ op: z.literal("or"), value: z.array(expression).min(1) }),
    z.strictObject({ op: z.literal("not"), value: expression }),
  ]),
)
export async function albums(pyxis: PyxisClient) {
  return (await pyxis.call({ _tag: "library.albums.list", payload: {} })).value.sort((a, b) =>
    a.id.localeCompare(b.id),
  )
}
export async function albumById(pyxis: PyxisClient, albumId: string) {
  return (await albums(pyxis)).find((a) => a.id === albumId)
}
