import { describe, expect, test } from "vitest"
import { assertRpcRequest, assertRpcResponse } from "./validation"

describe("generated RPC schema validation", () => {
  test("accepts contract-shaped requests and responses", () => {
    expect(() => assertRpcRequest({ _tag: "plugin.list", payload: {} })).not.toThrow()
    expect(() =>
      assertRpcResponse({
        _tag: "plugin.list",
        outcome: { status: "ready", value: [] },
      }),
    ).not.toThrow()
  })

  test("rejects a response with a missing required field", () => {
    expect(() =>
      assertRpcResponse({
        _tag: "session.list",
        outcome: {
          status: "ready",
          value: [
            {
              id: "session-1",
              name: "Browser",
              hostDeviceId: "device-1",
              queue: [],
              transport: "stopped",
              positionMs: 0,
              volume: 100,
              reachable: true,
              revision: 1,
            },
          ],
        },
      }),
    ).toThrow("Invalid RPC response")
  })

  test("rejects unknown envelope tags", () => {
    expect(() =>
      assertRpcResponse({ _tag: "made.up", outcome: { status: "ready", value: {} } }),
    ).toThrow("Invalid RPC response")
  })
})
