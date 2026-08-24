import {
  type CapabilityContext,
  definePlugin,
  PluginCapability,
  PluginOperationError,
  runPlugin,
} from "@pyxis/plugin-sdk"
import { SonosSoapError } from "./soap"
import { createSsdpDiscovery } from "./ssdp"
import type { SonosConfig, TopologyEnvironment } from "./topology"
import {
  SonosController,
  SonosInputError,
  SonosTargetUnavailableError,
  SonosTopologyTimeoutError,
  type SonosTrackMetadata,
} from "./transport"

export function createSonosPlugin(
  environment: TopologyEnvironment = {
    ssdp: createSsdpDiscovery(),
    fetch: globalThis.fetch.bind(globalThis),
    now: Date.now,
  },
) {
  const controller = (context: CapabilityContext): SonosController =>
    new SonosController(configOf(context.config), environment)

  return definePlugin({
    manifest: {
      id: "sonos",
      name: "Sonos",
      version: "1.0.0",
      capabilities: [PluginCapability.Output],
      configSchema: {
        type: "object",
        properties: {
          seedHosts: {
            type: "array",
            items: { type: "string" },
            description: "Private IPv4 Sonos hosts used when multicast discovery is unavailable",
          },
          discoveryTimeoutMs: { type: "integer", minimum: 100, maximum: 10_000 },
          requestTimeoutMs: { type: "integer", minimum: 100, maximum: 30_000 },
        },
      },
    },
    capabilities: {
      output: {
        discover: (_input, context) => providerCall(() => controller(context).topology()),
        "stream.profile": () => ({
          preferredFormats: ["m4a", "mp4", "mp3", "aac", "flac", "wav"],
        }),
        "transport.play": (input, context) => {
          const request = playInput(input)
          return providerCall(() => controller(context).play(request))
        },
        "transport.pause": (input, context) =>
          providerCall(async () => {
            await controller(context).pause(targetIdOf(input))
            return { targetId: targetIdOf(input), transport: "paused" }
          }),
        "transport.stop": (input, context) =>
          providerCall(async () => {
            await controller(context).stop(targetIdOf(input))
            return { targetId: targetIdOf(input), transport: "stopped" }
          }),
        "transport.state": (input, context) =>
          providerCall(() => controller(context).state(targetIdOf(input))),
        "volume.set": (input, context) => {
          const { targetId, volume } = volumeInput(input)
          return providerCall(async () => {
            await controller(context).setVolume(targetId, volume)
            return { targetId, volume }
          })
        },
        "group.set": (input, context) => {
          const { coordinatorId, memberIds } = groupInput(input)
          return providerCall(() => controller(context).setGroup(coordinatorId, memberIds))
        },
      },
    },
  })
}

if (import.meta.main) await runPlugin(createSonosPlugin())

function configOf(value: unknown): SonosConfig {
  if (value === null || value === undefined) {
    return { seedHosts: [], discoveryTimeoutMs: 2_500, requestTimeoutMs: 3_000 }
  }
  const record = object(value, "Sonos config must be an object")
  const seedHosts = record.seedHosts === undefined ? [] : stringArray(record.seedHosts, "seedHosts")
  return {
    seedHosts,
    discoveryTimeoutMs: boundedInteger(
      record.discoveryTimeoutMs,
      "discoveryTimeoutMs",
      2_500,
      100,
      10_000,
    ),
    requestTimeoutMs: boundedInteger(
      record.requestTimeoutMs,
      "requestTimeoutMs",
      3_000,
      100,
      30_000,
    ),
  }
}

function playInput(value: unknown): {
  readonly targetId: string
  readonly streamUrl: string
  readonly metadata: SonosTrackMetadata
  readonly positionMs?: number
} {
  const record = object(value, "transport.play input must be an object")
  const targetId = requiredString(record.targetId, "targetId")
  const streamUrl = requiredString(record.streamUrl, "streamUrl")
  const metadataRecord = object(record.metadata, "metadata must be an object")
  const title = requiredString(metadataRecord.title, "metadata.title")
  const positionMs = optionalNonNegativeInteger(record.positionMs, "positionMs")
  return {
    targetId,
    streamUrl,
    metadata: {
      title,
      ...optionalStringFields(metadataRecord, ["artist", "album", "artworkUrl", "mimeType"]),
    },
    ...(positionMs === undefined ? {} : { positionMs }),
  }
}

function targetIdOf(value: unknown): string {
  return requiredString(object(value, "output input must be an object").targetId, "targetId")
}

function volumeInput(value: unknown): { readonly targetId: string; readonly volume: number } {
  const record = object(value, "volume.set input must be an object")
  if (
    !Number.isSafeInteger(record.volume) ||
    (record.volume as number) < 0 ||
    (record.volume as number) > 100
  ) {
    invalid("volume must be an integer from 0 to 100")
  }
  return {
    targetId: requiredString(record.targetId, "targetId"),
    volume: record.volume as number,
  }
}

function groupInput(value: unknown): {
  readonly coordinatorId: string
  readonly memberIds: readonly string[]
} {
  const record = object(value, "group.set input must be an object")
  return {
    coordinatorId: requiredString(record.coordinatorId, "coordinatorId"),
    memberIds: stringArray(record.memberIds, "memberIds"),
  }
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(error)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid(`${field} is required`)
  return value.trim()
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) invalid(`${field} must be an array`)
  return value.map((entry) => requiredString(entry, field))
}

function optionalStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of fields) {
    const candidate = value[field]
    if (candidate === undefined) continue
    result[field] = requiredString(candidate, field)
  }
  return result
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${field} must be a non-negative integer`)
  }
  return value as number
}

function boundedInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalid(`${field} must be an integer from ${minimum} to ${maximum}`)
  }
  return value as number
}

function invalid(message: string): never {
  throw new PluginOperationError("capability.invalidInput", message, false)
}

async function providerCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    if (cause instanceof PluginOperationError) throw cause
    if (cause instanceof SonosSoapError) {
      throw new PluginOperationError(cause.code, cause.message, cause.retryable)
    }
    if (cause instanceof SonosInputError) {
      throw new PluginOperationError("capability.invalidInput", cause.message, false)
    }
    if (cause instanceof SonosTargetUnavailableError) {
      throw new PluginOperationError("sonos.targetUnavailable", cause.message, true)
    }
    if (cause instanceof SonosTopologyTimeoutError) {
      throw new PluginOperationError("sonos.topologyTimeout", cause.message, true)
    }
    throw new PluginOperationError(
      "sonos.unavailable",
      cause instanceof Error ? cause.message : "Sonos operation failed",
      true,
    )
  }
}
