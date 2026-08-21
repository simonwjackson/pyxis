import { describe, expect, test } from "bun:test"
import { PluginCapability, type PluginRequestEnvelope } from "../../../contracts/generated/pyxis"
import {
  createPluginRuntime,
  definePlugin,
  PLUGIN_PROTOCOL_VERSION,
  PluginOperationError,
} from "./index"
import { verifyPlugin } from "./testing"

const request = (request: PluginRequestEnvelope["request"]): string =>
  JSON.stringify({ id: "request-1", request } satisfies PluginRequestEnvelope)

const reference = definePlugin({
  manifest: {
    id: "reference",
    name: "Reference",
    version: "1.0.0",
    capabilities: [PluginCapability.Source, PluginCapability.Enricher],
    configSchema: {},
  },
  capabilities: {
    source: {
      search: async (input) => ({ plugin: "reference", input }),
      context: async (_input, context) => context,
      fail: async () => {
        throw new PluginOperationError("source.unavailable", "source is offline", true)
      },
      defect: async () => {
        throw new Error("programmer mistake")
      },
    },
    enricher: {
      enrich: async (input) => input,
    },
  },
})

describe("plugin runtime", () => {
  test("completes a handshake and injects the protocol version", async () => {
    const runtime = createPluginRuntime(reference)

    const result = await runtime.handleLine(
      request({
        _tag: "plugin.handshake",
        payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
      }),
    )

    expect(result._tag).toBe("response")
    if (result._tag !== "response") return
    expect(result.envelope.response).toEqual({
      _tag: "plugin.handshake",
      outcome: {
        status: "ready",
        value: {
          ...reference.manifest,
          protocolVersion: PLUGIN_PROTOCOL_VERSION,
        },
      },
    })
  })

  test("declares several capability classes and dispatches each independently", async () => {
    const runtime = createPluginRuntime(reference)

    const source = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "search",
          input: { query: "Bowie" },
        },
      }),
    )
    const enricher = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Enricher,
          operation: "enrich",
          input: { title: "Heroes" },
        },
      }),
    )

    expect(source).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
    expect(enricher).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
  })

  test("passes account id and decrypted config only to the operation context", async () => {
    const runtime = createPluginRuntime(reference)

    const result = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "context",
          input: {},
          accountId: "account-a",
          config: { username: "user", password: "secret" },
        },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: {
              accountId: "account-a",
              config: { username: "user", password: "secret" },
            },
          },
        },
      },
    })
  })

  test("maps declared operation failures without killing the runtime", async () => {
    const runtime = createPluginRuntime(reference)

    const failed = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "fail",
          input: {},
        },
      }),
    )
    const next = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "search",
          input: {},
        },
      }),
    )

    expect(failed).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "source.unavailable", retryable: true },
          },
        },
      },
    })
    expect(next).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
  })

  test("maps unexpected defects to a permanent typed failure", async () => {
    const runtime = createPluginRuntime(reference)

    const result = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "defect",
          input: {},
        },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "plugin.defect", retryable: false },
          },
        },
      },
    })
  })

  test("rejects malformed input without poisoning the next request", async () => {
    const runtime = createPluginRuntime(reference)

    const malformed = await runtime.handleLine("{not JSON")
    const next = await runtime.handleLine(
      request({
        _tag: "plugin.handshake",
        payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
      }),
    )

    expect(malformed).toMatchObject({
      _tag: "rejected",
      failure: { code: "protocol.malformed", retryable: false },
    })
    expect(next._tag).toBe("response")
  })

  test("rejects unknown operations as typed permanent failures", async () => {
    const runtime = createPluginRuntime(reference)

    const result = await runtime.handleLine(
      request({
        _tag: "capability.call",
        payload: {
          capability: PluginCapability.Source,
          operation: "does-not-exist",
          input: {},
        },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.unknownOperation", retryable: false },
          },
        },
      },
    })
  })
})

test("conformance harness validates the reference plugin without a core", async () => {
  const report = await verifyPlugin(reference, [
    {
      capability: PluginCapability.Source,
      operation: "search",
      input: { query: "Bowie" },
    },
    {
      capability: PluginCapability.Enricher,
      operation: "enrich",
      input: { title: "Heroes" },
    },
  ])

  expect(report).toEqual({ passed: true, checks: 5 })
})
