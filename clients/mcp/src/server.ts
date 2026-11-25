import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"
import { PyxisClient, PyxisError } from "./pyxis-client"
import { registerTools } from "./tools/registry"

export const protocolVersion = "2026-07-28"

export interface McpSettings {
  hostname: string
  port: number
  baseUrl: URL
}

export function serveMcp(settings: McpSettings, register = registerTools) {
  const clientFor = (request: Request) =>
    new PyxisClient(
      settings.baseUrl,
      request.headers.get("authorization") ?? undefined,
      request.signal,
    )
  const handler = createMcpHandler(
    ({ requestInfo }) => {
      if (!requestInfo) throw new Error("Pyxis requires an HTTP request")
      const server = new McpServer(
        { name: "pyxis", version: "2.0.0" },
        { supportedProtocolVersions: [protocolVersion] },
      )
      register(server, clientFor(requestInfo))
      return server
    },
    { legacy: "reject" },
  )

  const listener = Bun.serve({
    hostname: settings.hostname,
    port: settings.port,
    idleTimeout: 90,
    async fetch(request) {
      const { pathname } = new URL(request.url)
      if (pathname === "/healthz" && request.method === "GET") return new Response("ok\n")
      if (pathname !== "/mcp") return new Response(null, { status: 404 })
      // Native agent endpoint, not a browser origin. Do not trust Host or forwarded headers.
      if (request.headers.has("origin")) return new Response(null, { status: 403 })
      if (!/^Bearer pyx_api_[^\s,]+$/.test(request.headers.get("authorization") ?? "")) {
        return Response.json(
          {
            code: "auth.required",
            message: "A Pyxis API bearer token is required",
            retryable: false,
          },
          { status: 401, headers: { "www-authenticate": "Bearer" } },
        )
      }
      try {
        await clientFor(request).authenticate()
      } catch (error) {
        if (!(error instanceof PyxisError)) throw error
        const unauthorized =
          error.failure.code === "auth.invalidToken" || error.failure.code === "auth.required"
        return Response.json(error.failure, {
          status: unauthorized ? 401 : 502,
          headers: unauthorized ? { "www-authenticate": "Bearer" } : {},
        })
      }
      return handler.fetch(request)
    },
  })
  return {
    url: listener.url,
    async close() {
      await handler.close()
      await listener.stop(true)
    },
  }
}
