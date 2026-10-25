/// Pure device-hosted session command application.
///
/// The worker uses this while offline. The core applies the same command again on reconnect
/// under an idempotency key, then its returned session replaces this optimistic snapshot.

import {
  RpcRepeatMode,
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"

export function applySessionCommand(
  session: RpcSession,
  command: RpcSessionCommand,
  updatedAt = new Date().toISOString(),
): RpcSession {
  session = normalizeSessionModes(session)
  let repeat = session.repeat
  let shuffle = session.shuffle
  let order = [...(session.queueOrder ?? session.queue.map((_, index) => index))]
  let queue = [...session.queue]
  validateOrder(queue, order)
  const reorder = (enabled: boolean) => {
    const current = cursor === undefined ? undefined : order[cursor]
    const entries = queue.map((track, index) => ({ track, id: order[index] ?? index }))
    const start = enabled ? (cursor === undefined ? 0 : cursor + 1) : 0
    const seed = queueSeed(session.id)
    const suffix = entries
      .slice(start)
      .sort((left, right) =>
        enabled
          ? queueRank(left.id ^ seed) - queueRank(right.id ^ seed) || left.id - right.id
          : left.id - right.id,
      )
    const sorted = [...entries.slice(0, start), ...suffix]
    queue = sorted.map((entry) => entry.track)
    order = sorted.map((entry) => entry.id)
    cursor = current === undefined ? undefined : order.indexOf(current)
  }
  let cursor = session.cursor
  let transport = session.transport
  let positionMs = session.positionMs
  let durationMs = session.durationMs
  let volume = session.volume

  switch (command._tag) {
    case "queue.add": {
      const start =
        order.length === 0 ? 0 : order.reduce((maximum, id) => Math.max(maximum, id), -1) + 1
      if (start + command.payload.trackIds.length > 0xffff_ffff)
        throw new Error("queue occurrence order exhausted")
      for (const [index, track] of command.payload.trackIds.entries()) {
        order.push(start + index)
        queue.push(track)
      }
      if (cursor === undefined && queue.length > 0) cursor = 0
      if (shuffle) reorder(true)
      break
    }
    case "queue.remove": {
      const { index } = command.payload
      if (index < 0 || index >= queue.length) throw new Error("queue index is outside the queue")
      const wasCurrent = cursor === index
      queue.splice(index, 1)
      order.splice(index, 1)
      if (queue.length === 0) cursor = undefined
      else if (cursor !== undefined && index < cursor) cursor -= 1
      else if (cursor !== undefined && cursor >= queue.length) cursor = queue.length - 1
      if (wasCurrent) {
        transport = RpcTransport.Stopped
        positionMs = 0
        durationMs = undefined
      }
      break
    }
    case "queue.clear":
      queue = []
      order = []
      cursor = undefined
      transport = RpcTransport.Stopped
      positionMs = 0
      durationMs = undefined
      break
    case "repeat.set":
      repeat = command.payload.mode
      break
    case "shuffle.set":
      if (shuffle !== command.payload.enabled) {
        reorder(command.payload.enabled)
        shuffle = command.payload.enabled
      }
      break
    case "cursor.jump":
      if (command.payload.index < 0 || command.payload.index >= queue.length) {
        throw new Error("queue index is outside the queue")
      }
      cursor = command.payload.index
      transport = RpcTransport.Stopped
      positionMs = 0
      durationMs = undefined
      break
    case "transport.seek":
      if (
        session.currentTrackId === undefined ||
        durationMs === undefined ||
        !Number.isSafeInteger(command.payload.positionMs) ||
        command.payload.positionMs < 0 ||
        durationMs <= 0 ||
        command.payload.positionMs > durationMs
      ) {
        throw new Error("seek requires a known track, duration and bounded position")
      }
      positionMs = command.payload.positionMs
      break
    case "transport.play":
      if (queue.length === 0) throw new Error("cannot play an empty queue")
      if (transport === RpcTransport.Ended) positionMs = 0
      transport = RpcTransport.Playing
      break
    case "transport.pause":
      if (transport !== RpcTransport.Playing) throw new Error("cannot pause unless playing")
      transport = RpcTransport.Paused
      break
    case "transport.stop":
      transport = RpcTransport.Stopped
      positionMs = 0
      break
    case "transport.trackEnded": {
      if (transport !== RpcTransport.Playing) throw new Error("cannot end unless playing")
      // Mirrors the core session command application, including repeat policy.
      // Silence belongs at the end of a record, not between its tracks: the cursor moves
      // while the queue still has something on it, and only an exhausted queue ends.
      //
      // This projection is what the interface actually renders -- `queueSessionCommand`
      // returns it rather than waiting for the core -- so a copy that ends every track ends
      // every album after one song, whatever the core decides on reconnect.
      positionMs = 0
      const next = cursor === undefined ? undefined : cursor + 1
      if (repeat === RpcRepeatMode.One) {
        // Replaying this occurrence preserves its identity and duration.
      } else if (next !== undefined && next < queue.length) {
        cursor = next
        durationMs = undefined
      } else if (repeat === RpcRepeatMode.All && queue.length > 0) {
        cursor = 0
        durationMs = undefined
      } else {
        transport = RpcTransport.Ended
      }
      break
    }
    case "position.report":
      positionMs = command.payload.positionMs
      if (command.payload.durationMs !== undefined) durationMs = command.payload.durationMs
      break
    case "volume.set":
      if (command.payload.volume < 0 || command.payload.volume > 100) {
        throw new Error("volume is outside 0..=100")
      }
      volume = command.payload.volume
      break
    default:
      throw new Error("unsupported session command; pending intent must be retained")
  }

  const currentTrackId = cursor === undefined ? undefined : queue[cursor]
  const {
    cursor: _cursor,
    currentTrackId: _currentTrackId,
    streamPath: _streamPath,
    durationMs: _durationMs,
    ...required
  } = session
  return {
    ...required,
    repeat,
    shuffle,
    queueOrder: order,
    queue,
    ...(cursor === undefined ? {} : { cursor }),
    ...(currentTrackId === undefined ? {} : { currentTrackId }),
    ...(currentTrackId === undefined ? {} : { streamPath: `/stream/${currentTrackId}` }),
    transport,
    positionMs,
    ...(durationMs === undefined ? {} : { durationMs }),
    volume,
    revision: session.revision + 1,
    updatedAt,
  }
}

/// Only persisted current-rewrite sessions receive defaults. Network validators still
/// require explicit modes, and a retired command is never converted into a mode command.
export function normalizeSessionModes(session: RpcSession): RpcSession {
  return {
    ...session,
    repeat: session.repeat ?? RpcRepeatMode.Off,
    shuffle: session.shuffle ?? false,
  }
}

function validateOrder(queue: readonly string[], order: readonly number[]): void {
  if (
    queue.length !== order.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !Number.isSafeInteger(id) || id < 0 || id > 0xffff_ffff)
  )
    throw new Error("invalid queue occurrence order")
}

function queueSeed(id: string): number {
  let seed = 2166136261
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0
  return seed
}

function queueRank(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
}
