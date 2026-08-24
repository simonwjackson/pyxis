import { escapeXml, type SonosFetch, sendSoapAction, xmlTag } from "./soap"
import {
  coordinatorFor,
  discoverTopology,
  refreshKnownTopology,
  type SonosConfig,
  type SonosRoom,
  type SonosTopology,
  type TopologyEnvironment,
} from "./topology"

const AV_TRANSPORT = "AVTransport"
const AV_TRANSPORT_PATH = "/MediaRenderer/AVTransport/Control"
const GROUP_RENDERING_CONTROL = "GroupRenderingControl"
const GROUP_RENDERING_CONTROL_PATH = "/MediaRenderer/GroupRenderingControl/Control"

export class SonosInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SonosInputError"
  }
}

export class SonosTargetUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SonosTargetUnavailableError"
  }
}

export class SonosTopologyTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SonosTopologyTimeoutError"
  }
}

export interface SonosTrackMetadata {
  readonly title: string
  readonly artist?: string
  readonly album?: string
  readonly artworkUrl?: string
  readonly mimeType?: string
}

export interface SonosTransportState {
  readonly state: string
  readonly positionMs?: number
  readonly durationMs?: number
  readonly streamUrl?: string
}

export interface GroupAction {
  readonly type: "join" | "leave"
  readonly room: SonosRoom
  readonly coordinatorId?: string
}

export class SonosController {
  constructor(
    private readonly config: SonosConfig,
    private readonly environment: TopologyEnvironment,
  ) {}

  topology(): Promise<SonosTopology> {
    return discoverTopology(this.config, this.environment)
  }

  async play(input: {
    readonly targetId: string
    readonly streamUrl: string
    readonly metadata: SonosTrackMetadata
    readonly positionMs?: number
  }): Promise<{ readonly targetId: string; readonly coordinatorId: string }> {
    assertStreamUrl(input.streamUrl)
    if (input.positionMs !== undefined) validatePosition(input.positionMs)
    const topology = await this.topology()
    const target = requiredCoordinator(topology, input.targetId)
    await setTransportUri(
      target,
      input.streamUrl,
      input.metadata,
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
    if (input.positionMs !== undefined && input.positionMs > 0) {
      await seek(target, input.positionMs, this.config.requestTimeoutMs, this.environment.fetch)
    }
    await transportAction(
      target,
      "Play",
      "<InstanceID>0</InstanceID><Speed>1</Speed>",
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
    return { targetId: input.targetId, coordinatorId: target.id }
  }

  async pause(targetId: string): Promise<void> {
    const target = requiredCoordinator(await this.topology(), targetId)
    await transportAction(
      target,
      "Pause",
      "<InstanceID>0</InstanceID>",
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
  }

  async stop(targetId: string): Promise<void> {
    const target = requiredCoordinator(await this.topology(), targetId)
    await transportAction(
      target,
      "Stop",
      "<InstanceID>0</InstanceID>",
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
  }

  async setVolume(targetId: string, volume: number): Promise<void> {
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
      throw new SonosInputError("Sonos volume must be an integer from 0 to 100")
    }
    const target = requiredCoordinator(await this.topology(), targetId)
    await sendSoapAction(
      target.locationUrl,
      GROUP_RENDERING_CONTROL,
      GROUP_RENDERING_CONTROL_PATH,
      "SetGroupVolume",
      `<InstanceID>0</InstanceID><DesiredVolume>${volume}</DesiredVolume>`,
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
  }

  async state(targetId: string): Promise<SonosTransportState> {
    const target = requiredCoordinator(await this.topology(), targetId)
    const transport = await transportAction(
      target,
      "GetTransportInfo",
      "<InstanceID>0</InstanceID>",
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
    const position = await transportAction(
      target,
      "GetPositionInfo",
      "<InstanceID>0</InstanceID>",
      this.config.requestTimeoutMs,
      this.environment.fetch,
    )
    const positionMs = parseTime(xmlTag(position, "RelTime"))
    const durationMs = parseTime(xmlTag(position, "TrackDuration"))
    const streamUrl = xmlTag(position, "TrackURI")
    return {
      state: xmlTag(transport, "CurrentTransportState") ?? "UNKNOWN",
      ...(positionMs === undefined ? {} : { positionMs }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(streamUrl === undefined || streamUrl.length === 0 ? {} : { streamUrl }),
    }
  }

  async setGroup(coordinatorId: string, memberIds: readonly string[]): Promise<SonosTopology> {
    validateGroupShape(coordinatorId, memberIds)
    let topology = await this.topology()
    if (!topology.authoritative) {
      throw new SonosTopologyTimeoutError("Sonos grouping requires authoritative topology")
    }
    for (const action of planGroupUpdate(topology, coordinatorId, memberIds)) {
      if (action.type === "leave") {
        await transportAction(
          action.room,
          "BecomeCoordinatorOfStandaloneGroup",
          "<InstanceID>0</InstanceID>",
          this.config.requestTimeoutMs,
          this.environment.fetch,
        )
      } else {
        await transportAction(
          action.room,
          "SetAVTransportURI",
          `<InstanceID>0</InstanceID><CurrentURI>${escapeXml(`x-rincon:${action.coordinatorId}`)}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`,
          this.config.requestTimeoutMs,
          this.environment.fetch,
        )
      }
      topology = await this.waitForGroupAction(topology, action)
    }
    return topology
  }

  private async waitForGroupAction(
    previous: SonosTopology,
    action: GroupAction,
  ): Promise<SonosTopology> {
    let topology = previous
    const sleep =
      this.environment.sleep ??
      ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
    for (let attempt = 0; attempt < 10; attempt += 1) {
      topology = await refreshKnownTopology(topology, this.config, this.environment)
      const group = topology.groups.find((candidate) =>
        candidate.rooms.some((room) => room.id === action.room.id),
      )
      const converged =
        action.type === "join"
          ? group?.coordinatorId === action.coordinatorId
          : group?.coordinatorId === action.room.id && group.rooms.length === 1
      if (converged) return topology
      if (attempt < 9) await sleep(100)
    }
    throw new SonosTopologyTimeoutError(
      `Sonos topology did not converge after ${action.type} for '${action.room.id}'`,
    )
  }
}

export function planGroupUpdate(
  topology: SonosTopology,
  coordinatorId: string,
  memberIds: readonly string[],
): readonly GroupAction[] {
  validateGroupShape(coordinatorId, memberIds)
  const desired = new Set(memberIds)
  const allRooms = new Map(
    topology.groups.flatMap((group) => group.rooms).map((room) => [room.id, room]),
  )
  const coordinator = allRooms.get(coordinatorId)
  if (coordinator === undefined) {
    throw new SonosTargetUnavailableError(`Sonos room '${coordinatorId}' is unavailable`)
  }
  for (const id of desired) {
    if (!allRooms.has(id)) {
      throw new SonosTargetUnavailableError(`Sonos room '${id}' is unavailable`)
    }
  }

  const actions: GroupAction[] = []
  const leaving = new Set<string>()
  const leave = (room: SonosRoom) => {
    if (leaving.has(room.id)) return
    leaving.add(room.id)
    actions.push({ type: "leave", room })
  }
  const current = topology.groups.find((group) =>
    group.rooms.some((room) => room.id === coordinatorId),
  )
  if (current !== undefined && current.coordinatorId !== coordinatorId) leave(coordinator)
  if (current?.coordinatorId === coordinatorId) {
    for (const room of current.rooms) {
      if (room.id !== coordinatorId && !desired.has(room.id)) leave(room)
    }
  }
  // Joining a coordinator can drag its whole existing group with it. Make every companion
  // standalone first; desired companions are joined explicitly below in the requested order.
  for (const id of desired) {
    if (id === coordinatorId) continue
    const group = topology.groups.find((candidate) =>
      candidate.rooms.some((room) => room.id === id),
    )
    if (group !== undefined && group.coordinatorId !== coordinatorId) {
      if (group.coordinatorId === id) {
        for (const room of group.rooms) {
          if (room.id !== id) leave(room)
        }
      } else if (allRooms.get(id) !== undefined) {
        leave(allRooms.get(id) as SonosRoom)
      }
    }
  }
  for (const id of desired) {
    if (id === coordinatorId) continue
    const alreadyMember =
      current?.coordinatorId === coordinatorId && current.rooms.some((room) => room.id === id)
    if (!alreadyMember) {
      actions.push({ type: "join", room: allRooms.get(id) as SonosRoom, coordinatorId })
    }
  }
  return actions
}

async function setTransportUri(
  room: SonosRoom,
  streamUrl: string,
  metadata: SonosTrackMetadata,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<void> {
  const didl = didlMetadata(streamUrl, metadata)
  await transportAction(
    room,
    "SetAVTransportURI",
    `<InstanceID>0</InstanceID><CurrentURI>${escapeXml(streamUrl)}</CurrentURI><CurrentURIMetaData>${escapeXml(didl)}</CurrentURIMetaData>`,
    timeoutMs,
    fetchImpl,
  )
}

async function seek(
  room: SonosRoom,
  positionMs: number,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<void> {
  validatePosition(positionMs)
  await transportAction(
    room,
    "Seek",
    `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${formatTime(positionMs)}</Target>`,
    timeoutMs,
    fetchImpl,
  )
}

function transportAction(
  room: SonosRoom,
  action: string,
  body: string,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<string> {
  return sendSoapAction(
    room.locationUrl,
    AV_TRANSPORT,
    AV_TRANSPORT_PATH,
    action,
    body,
    timeoutMs,
    fetchImpl,
  )
}

function requiredCoordinator(topology: SonosTopology, targetId: string): SonosRoom {
  const target = coordinatorFor(topology, targetId)
  if (target === undefined) {
    throw new SonosTargetUnavailableError(`Sonos room '${targetId}' is unavailable`)
  }
  return target
}

function didlMetadata(streamUrl: string, metadata: SonosTrackMetadata): string {
  const element = (name: string, value: string | undefined): string =>
    value === undefined || value.length === 0 ? "" : `<${name}>${escapeXml(value)}</${name}>`
  const mimeType = metadata.mimeType?.trim() || "audio/mpeg"
  return [
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ',
    'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ',
    'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">',
    '<item id="-1" parentID="-1" restricted="true">',
    `<dc:title>${escapeXml(metadata.title)}</dc:title>`,
    element("dc:creator", metadata.artist),
    element("upnp:album", metadata.album),
    element("upnp:albumArtURI", metadata.artworkUrl),
    "<upnp:class>object.item.audioItem.musicTrack</upnp:class>",
    `<res protocolInfo="http-get:*:${escapeXml(mimeType)}:*">${escapeXml(streamUrl)}</res>`,
    "</item></DIDL-Lite>",
  ].join("")
}

function validateGroupShape(coordinatorId: string, memberIds: readonly string[]): void {
  const desired = new Set(memberIds)
  if (!desired.has(coordinatorId)) {
    throw new SonosInputError("coordinator must be included in members")
  }
  if (desired.size !== memberIds.length) {
    throw new SonosInputError("group members must be unique")
  }
}

function validatePosition(positionMs: number): void {
  if (!Number.isSafeInteger(positionMs) || positionMs < 0) {
    throw new SonosInputError("Sonos positionMs must be a non-negative integer")
  }
}

function assertStreamUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SonosInputError("Sonos streamUrl must be an absolute URL")
  }
  if (url.protocol !== "http:") {
    throw new SonosInputError("Sonos streamUrl must use LAN HTTP")
  }
}

function formatTime(milliseconds: number): string {
  const total = Math.floor(milliseconds / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function parseTime(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d+):(\d{2}):(\d{2})$/u)
  if (match == null) return undefined
  const hours = Number.parseInt(match[1] ?? "", 10)
  const minutes = Number.parseInt(match[2] ?? "", 10)
  const seconds = Number.parseInt(match[3] ?? "", 10)
  if (minutes > 59 || seconds > 59) return undefined
  const result = (hours * 3600 + minutes * 60 + seconds) * 1000
  return Number.isSafeInteger(result) ? result : undefined
}
