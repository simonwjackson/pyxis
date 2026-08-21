import type {
  PluginCapability,
  PluginRequest,
  PluginRequestEnvelope,
} from "../../../contracts/generated/pyxis"
import type { PluginDefinition } from "./capabilities.ts"
import { createPluginRuntime, PLUGIN_PROTOCOL_VERSION } from "./protocol.ts"

export interface ConformanceCase {
  readonly capability: PluginCapability
  readonly operation: string
  readonly input: unknown
}

export type ConformanceReport =
  | { readonly passed: true; readonly checks: number }
  | { readonly passed: false; readonly checks: number; readonly failures: readonly string[] }

export async function verifyPlugin(
  definition: PluginDefinition,
  cases: readonly ConformanceCase[],
): Promise<ConformanceReport> {
  const runtime = createPluginRuntime(definition)
  const failures: string[] = []
  let checks = 0

  const handshake = await runtime.handleLine(
    envelope({
      _tag: "plugin.handshake",
      payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
    }),
  )
  checks += 1
  if (
    handshake._tag !== "response" ||
    handshake.envelope.response._tag !== "plugin.handshake" ||
    handshake.envelope.response.outcome.status !== "ready"
  ) {
    failures.push("handshake did not return ready")
  }

  checks += 1
  if (
    handshake._tag === "response" &&
    handshake.envelope.response._tag === "plugin.handshake" &&
    handshake.envelope.response.outcome.status === "ready"
  ) {
    const actual = [...handshake.envelope.response.outcome.value.capabilities].sort()
    const expected = [...definition.manifest.capabilities].sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push("handshake capabilities differ from the manifest")
    }
  } else {
    failures.push("manifest could not be inspected because handshake failed")
  }

  const malformed = await runtime.handleLine("{not JSON")
  const recovered = await runtime.handleLine(
    envelope({
      _tag: "plugin.handshake",
      payload: { protocolVersion: PLUGIN_PROTOCOL_VERSION },
    }),
  )
  checks += 1
  if (malformed._tag !== "rejected" || recovered._tag !== "response") {
    failures.push("malformed input poisoned the runtime")
  }

  for (const testCase of cases) {
    const result = await runtime.handleLine(
      envelope({
        _tag: "capability.call",
        payload: {
          capability: testCase.capability,
          operation: testCase.operation,
          input: testCase.input,
        },
      }),
    )
    checks += 1
    if (
      result._tag !== "response" ||
      result.envelope.response._tag !== "capability.call" ||
      result.envelope.response.outcome.status !== "ready"
    ) {
      failures.push(`${testCase.capability}.${testCase.operation} did not return ready`)
    }
  }

  return failures.length === 0 ? { passed: true, checks } : { passed: false, checks, failures }
}

function envelope(request: PluginRequest): string {
  return JSON.stringify({ id: "conformance", request } satisfies PluginRequestEnvelope)
}
