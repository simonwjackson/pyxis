import type {
  PluginCallOutcome,
  PluginCapability,
  PluginManifest,
} from "../../../contracts/generated/pyxis"

export type CapabilityHandler = (input: unknown) => unknown | Promise<unknown>

export type CapabilityHandlers = Partial<
  Record<PluginCapability, Readonly<Record<string, CapabilityHandler>>>
>

export type PluginManifestInput = Omit<PluginManifest, "protocolVersion">

export interface PluginDefinition {
  readonly manifest: PluginManifestInput
  readonly capabilities: CapabilityHandlers
}

export class PluginOperationError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = "PluginOperationError"
    this.code = code
    this.retryable = retryable
  }
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(definition.manifest.id)) {
    throw new Error("plugin id must be lowercase kebab-case")
  }
  const declared = new Set(definition.manifest.capabilities)
  if (declared.size !== definition.manifest.capabilities.length) {
    throw new Error("plugin manifest contains duplicate capabilities")
  }
  for (const capability of declared) {
    const handlers = definition.capabilities[capability]
    if (handlers === undefined || Object.keys(handlers).length === 0) {
      throw new Error(`plugin declares '${capability}' but implements no operations for it`)
    }
  }
  for (const capability of Object.keys(definition.capabilities) as PluginCapability[]) {
    if (!declared.has(capability)) {
      throw new Error(`plugin implements undeclared capability '${capability}'`)
    }
  }
  return definition
}

export async function dispatchCapability(
  definition: PluginDefinition,
  capability: PluginCapability,
  operation: string,
  input: unknown,
): Promise<PluginCallOutcome> {
  const handler = definition.capabilities[capability]?.[operation]
  if (handler === undefined) {
    return {
      status: "unavailable",
      value: {
        code: "capability.unknownOperation",
        message: `capability '${capability}' does not implement '${operation}'`,
        retryable: false,
      },
    }
  }

  try {
    return { status: "ready", value: await handler(input) }
  } catch (error) {
    if (error instanceof PluginOperationError) {
      return {
        status: "unavailable",
        value: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      }
    }
    return {
      status: "unavailable",
      value: {
        code: "plugin.defect",
        message:
          error instanceof Error ? error.message : "plugin operation threw a non-Error value",
        retryable: false,
      },
    }
  }
}
