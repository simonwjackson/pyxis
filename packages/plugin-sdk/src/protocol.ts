import { createInterface } from "node:readline"
import {
  PluginCapability,
  type PluginFailure,
  type PluginRequest,
  type PluginRequestEnvelope,
  type PluginResponse,
  type PluginResponseEnvelope,
} from "../../../contracts/generated/pyxis"
import { dispatchCapability, type PluginDefinition } from "./capabilities.ts"

export const PLUGIN_PROTOCOL_VERSION = 1

export type RuntimeResult =
  | { readonly _tag: "response"; readonly envelope: PluginResponseEnvelope }
  | { readonly _tag: "rejected"; readonly failure: PluginFailure }

type RejectedResult = Extract<RuntimeResult, { readonly _tag: "rejected" }>
type ParsedResult = { readonly _tag: "parsed"; readonly envelope: PluginRequestEnvelope }

export interface PluginRuntime {
  handleLine(line: string): Promise<RuntimeResult>
}

export function createPluginRuntime(definition: PluginDefinition): PluginRuntime {
  return {
    async handleLine(line) {
      const parsed = parseEnvelope(line)
      if (parsed._tag === "rejected") return parsed
      const { id, request } = parsed.envelope

      let response: PluginResponse
      if (request._tag === "plugin.handshake") {
        response = {
          _tag: "plugin.handshake",
          outcome:
            request.payload.protocolVersion === PLUGIN_PROTOCOL_VERSION
              ? {
                  status: "ready",
                  value: {
                    ...definition.manifest,
                    protocolVersion: PLUGIN_PROTOCOL_VERSION,
                  },
                }
              : {
                  status: "rejected",
                  value: {
                    code: "protocol.versionMismatch",
                    message: `core requested protocol ${request.payload.protocolVersion}; plugin supports ${PLUGIN_PROTOCOL_VERSION}`,
                    retryable: false,
                  },
                },
        }
      } else {
        response = {
          _tag: "capability.call",
          outcome: await dispatchCapability(
            definition,
            request.payload.capability,
            request.payload.operation,
            request.payload.input,
          ),
        }
      }

      return { _tag: "response", envelope: { id, response } }
    },
  }
}

export async function runPlugin(definition: PluginDefinition): Promise<void> {
  const runtime = createPluginRuntime(definition)
  const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })

  for await (const line of lines) {
    const result = await runtime.handleLine(line)
    if (result._tag === "response") {
      process.stdout.write(`${JSON.stringify(result.envelope)}\n`)
    } else {
      // Stdout is protocol-only. Input failures cannot be correlated safely, so diagnostics
      // go to stderr and the process stays alive for the next well-formed request.
      process.stderr.write(
        `${JSON.stringify({ _tag: "plugin.input.rejected", failure: result.failure })}\n`,
      )
    }
  }
}

function parseEnvelope(line: string): RejectedResult | ParsedResult {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch (error) {
    return rejected(
      "protocol.malformed",
      error instanceof Error ? error.message : "input is not valid JSON",
    )
  }

  if (!isRecord(value) || !hasExactKeys(value, ["id", "request"])) {
    return rejected("protocol.invalidEnvelope", "envelope must contain only id and request")
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return rejected("protocol.invalidEnvelope", "envelope id must be a non-empty string")
  }
  const request = parseRequest(value.request)
  if (request === undefined) {
    return rejected("protocol.invalidRequest", "request does not match the plugin contract")
  }
  return { _tag: "parsed", envelope: { id: value.id, request } }
}

function parseRequest(value: unknown): PluginRequest | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["_tag", "payload"]) || !isRecord(value.payload)) {
    return undefined
  }
  if (value._tag === "plugin.handshake") {
    if (
      !hasExactKeys(value.payload, ["protocolVersion"]) ||
      !Number.isSafeInteger(value.payload.protocolVersion) ||
      (value.payload.protocolVersion as number) < 0
    ) {
      return undefined
    }
    return {
      _tag: "plugin.handshake",
      payload: { protocolVersion: value.payload.protocolVersion as number },
    }
  }
  if (value._tag === "capability.call") {
    if (
      !hasExactKeys(value.payload, ["capability", "operation", "input"]) ||
      !isPluginCapability(value.payload.capability) ||
      typeof value.payload.operation !== "string" ||
      value.payload.operation.length === 0
    ) {
      return undefined
    }
    return {
      _tag: "capability.call",
      payload: {
        capability: value.payload.capability,
        operation: value.payload.operation,
        input: value.payload.input,
      },
    }
  }
  return undefined
}

function rejected(code: string, message: string): RejectedResult {
  return {
    _tag: "rejected",
    failure: { code, message, retryable: false },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function isPluginCapability(value: unknown): value is PluginCapability {
  return Object.values(PluginCapability).includes(value as PluginCapability)
}
