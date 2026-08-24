import { type SonosFetch, sendSoapAction, xmlAttributes, xmlTag } from "./soap"
import { type SsdpDiscovery, seedLocation, sonosLocation } from "./ssdp"

export interface SonosRoom {
  readonly id: string
  readonly name: string
  readonly model?: string
  readonly address: string
  readonly locationUrl: string
  readonly coordinator: boolean
}

export interface SonosGroup {
  readonly id: string
  readonly coordinatorId: string
  readonly coordinatorName: string
  readonly rooms: readonly SonosRoom[]
}

export interface SonosTopology {
  readonly groups: readonly SonosGroup[]
  readonly refreshedAt: number
  /// False only when descriptions were reachable but no room answered ZoneGroupTopology.
  readonly authoritative: boolean
}

export interface SonosConfig {
  readonly seedHosts: readonly string[]
  readonly discoveryTimeoutMs: number
  readonly requestTimeoutMs: number
}

export interface TopologyEnvironment {
  readonly ssdp: SsdpDiscovery
  readonly fetch: SonosFetch
  readonly now: () => number
  readonly sleep?: (milliseconds: number) => Promise<void>
}

interface SonosDevice {
  readonly id: string
  readonly name: string
  readonly model?: string
  readonly address: string
  readonly locationUrl: string
}

export async function discoverTopology(
  config: SonosConfig,
  environment: TopologyEnvironment,
): Promise<SonosTopology> {
  const discovered = await environment.ssdp.discover(config.discoveryTimeoutMs)
  const locations = new Set(discovered)
  for (const host of config.seedHosts) {
    const location = seedLocation(host)
    if (location !== undefined) locations.add(location)
  }

  const devices = new Map<string, SonosDevice>()
  await Promise.all(
    [...locations].map(async (location) => {
      const device = await fetchDescription(location, config.requestTimeoutMs, environment.fetch)
      if (device !== undefined) devices.set(device.id, device)
    }),
  )

  return queryKnownTopology(devices, config, environment, false)
}

export async function refreshKnownTopology(
  topology: SonosTopology,
  config: SonosConfig,
  environment: TopologyEnvironment,
): Promise<SonosTopology> {
  const devices = new Map<string, SonosDevice>()
  for (const room of topology.groups.flatMap((group) => group.rooms)) {
    const { coordinator: _coordinator, ...device } = room
    devices.set(device.id, device)
  }
  return queryKnownTopology(devices, config, environment, false)
}

async function queryKnownTopology(
  devices: Map<string, SonosDevice>,
  config: SonosConfig,
  environment: TopologyEnvironment,
  allowStandaloneFallback: boolean,
): Promise<SonosTopology> {
  for (const device of [...devices.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    try {
      const envelope = await sendSoapAction(
        device.locationUrl,
        "ZoneGroupTopology",
        "/ZoneGroupTopology/Control",
        "GetZoneGroupState",
        "",
        config.requestTimeoutMs,
        environment.fetch,
      )
      await addTopologyMembers(envelope, devices, config.requestTimeoutMs, environment.fetch)
      return {
        groups: parseZoneGroupState(envelope, devices),
        refreshedAt: environment.now(),
        authoritative: true,
      }
    } catch {
      // Try another reachable room. Any speaker can usually answer topology queries.
    }
  }

  if (!allowStandaloneFallback) throw new Error("no Sonos room answered topology refresh")
  return {
    groups: [...devices.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((device) => ({
        id: `standalone:${device.id}`,
        coordinatorId: device.id,
        coordinatorName: device.name,
        rooms: [{ ...device, coordinator: true }],
      })),
    refreshedAt: environment.now(),
    authoritative: false,
  }
}

async function addTopologyMembers(
  envelope: string,
  devices: Map<string, SonosDevice>,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<void> {
  const encoded = xmlTag(envelope, "ZoneGroupState") ?? envelope
  const locations = new Set<string>()
  const memberPattern = /<ZoneGroupMember\b([^>]*)\/?\s*>/giu
  for (const member of encoded.matchAll(memberPattern)) {
    const fields = xmlAttributes(member[1] ?? "")
    const id = normalizeId(fields.UUID ?? "")
    const location = sonosLocation(fields.Location ?? "")
    if (id.length > 0 && !devices.has(id) && location !== undefined) locations.add(location.href)
  }
  await Promise.all(
    [...locations].map(async (location) => {
      const device = await fetchDescription(location, timeoutMs, fetchImpl)
      if (device !== undefined) devices.set(device.id, device)
    }),
  )
}

export function parseDeviceDescription(value: string, locationUrl: string): SonosRoom | undefined {
  const location = sonosLocation(locationUrl)
  const id = normalizeId(xmlTag(value, "UDN") ?? "")
  const name = xmlTag(value, "roomName")?.trim()
  const model = xmlTag(value, "modelName")?.trim()
  if (location === undefined || id.length === 0 || name === undefined || name.length === 0) {
    return undefined
  }
  return {
    id,
    name,
    ...(model === undefined || model.length === 0 ? {} : { model }),
    address: location.hostname,
    locationUrl: location.href,
    coordinator: false,
  }
}

export function parseZoneGroupState(
  envelope: string,
  devices: ReadonlyMap<string, SonosDevice>,
): readonly SonosGroup[] {
  const encoded = xmlTag(envelope, "ZoneGroupState") ?? envelope
  const groups: SonosGroup[] = []
  const groupPattern = /<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/giu
  for (const match of encoded.matchAll(groupPattern)) {
    const attributes = xmlAttributes(match[1] ?? "")
    const coordinatorId = normalizeId(attributes.Coordinator ?? "")
    const groupId = attributes.ID?.trim()
    if (coordinatorId.length === 0 || groupId === undefined || groupId.length === 0) continue
    const rooms: SonosRoom[] = []
    const memberPattern = /<ZoneGroupMember\b([^>]*)\/?\s*>/giu
    for (const member of (match[2] ?? "").matchAll(memberPattern)) {
      const fields = xmlAttributes(member[1] ?? "")
      const id = normalizeId(fields.UUID ?? "")
      const known = devices.get(id)
      if (known === undefined || fields.Invisible === "1") continue
      rooms.push({ ...known, coordinator: id === coordinatorId })
    }
    const coordinator = rooms.find((room) => room.coordinator)
    if (coordinator === undefined) continue
    groups.push({
      id: groupId,
      coordinatorId,
      coordinatorName: coordinator.name,
      rooms: rooms.sort((left, right) => left.name.localeCompare(right.name)),
    })
  }
  return groups.sort((left, right) => left.coordinatorName.localeCompare(right.coordinatorName))
}

export function roomById(topology: SonosTopology, roomId: string): SonosRoom | undefined {
  return topology.groups.flatMap((group) => group.rooms).find((room) => room.id === roomId)
}

export function coordinatorFor(topology: SonosTopology, roomId: string): SonosRoom | undefined {
  const group = topology.groups.find((candidate) =>
    candidate.rooms.some((room) => room.id === roomId),
  )
  return group?.rooms.find((room) => room.id === group.coordinatorId)
}

async function fetchDescription(
  location: string,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<SonosDevice | undefined> {
  if (sonosLocation(location) === undefined) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(location, {
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    const parsed = parseDeviceDescription(await response.text(), location)
    if (parsed === undefined) return undefined
    const { coordinator: _coordinator, ...device } = parsed
    return device
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeId(value: string): string {
  return value
    .trim()
    .replace(/^uuid:/iu, "")
    .replace(/_MR$/iu, "")
}
