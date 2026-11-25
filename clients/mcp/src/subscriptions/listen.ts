import {
  createMcpHandler,
  InMemoryServerEventBus,
  isSpecType,
  type McpServerFactory,
  readRequestBody,
} from "@modelcontextprotocol/server"
import { PyxisError } from "../pyxis-client"
import { nowPlaying } from "../resources/register"
import { watchSessions } from "./realtime"

// SDK buses broadcast to every stream on a handler. Give each listen its own bus:
// even two listeners requesting the same URI can belong to different accounts.
export function subscriptionHandler(factory: McpServerFactory, base: URL) {
  const shutdown = new AbortController()
  let active = 0
  return {
    close: () => shutdown.abort(),
    async fetch(request: Request, bearerToken: string) {
      const bus = new InMemoryServerEventBus()
      const detached = new AbortController()
      const handler = createMcpHandler(factory, {
        legacy: "reject",
        bus: {
          publish: (event) => bus.publish(event),
          subscribe: (listener) => {
            const off = bus.subscribe(listener)
            return () => {
              off()
              detached.abort()
            }
          },
        },
      })
      const raw = await readRequestBody(request.clone())
      let body: unknown
      if (!raw.tooLarge)
        try {
          body = JSON.parse(raw.text)
        } catch {
          /* Let the SDK return the protocol error. */
        }
      if (!isSpecType.SubscriptionsListenRequest(body) || !isSpecType.JSONRPCRequest(body))
        return handler.fetch(request)
      const requested = body.params.notifications.resourceSubscriptions?.includes(nowPlaying)
      const parsedBody = {
        ...body,
        params: {
          ...body.params,
          notifications: requested ? { resourceSubscriptions: [nowPlaying] } : {},
        },
      }
      const response = await handler.fetch(request, { parsedBody })
      if (!bus.listenerCount) return response // SDK rejection, or empty acknowledged filter
      const error = (message: string, data?: unknown) =>
        Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message, data } })
      if (active >= 1024) {
        await handler.close()
        return error("Subscription limit reached")
      }
      active++
      detached.signal.addEventListener(
        "abort",
        () => {
          active--
        },
        { once: true },
      )
      try {
        await watchSessions(
          base,
          bearerToken,
          AbortSignal.any([detached.signal, request.signal, shutdown.signal]),
          (id, revision) =>
            bus.publish({
              kind: "resource_updated",
              uri: nowPlaying,
              params: { _meta: { "pyxis.dev/sessionId": id, "pyxis.dev/revision": revision } },
            }),
          () => {
            void handler.close()
          },
        )
        return response
      } catch (e) {
        await handler.close()
        return error(
          e instanceof PyxisError ? e.message : "Pyxis realtime unavailable",
          e instanceof PyxisError ? e.failure : undefined,
        )
      }
    },
  }
}
