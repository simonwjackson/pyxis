/// Pure device-hosted session command application.
///
/// The worker uses this while offline. The core applies the same command again on reconnect
/// under an idempotency key, then its returned session replaces this optimistic snapshot.

import {
  type RpcSession,
  type RpcSessionCommand,
  RpcTransport,
} from "../../../../contracts/generated/pyxis"

export function applySessionCommand(
  session: RpcSession,
  command: RpcSessionCommand,
  updatedAt = new Date().toISOString(),
): RpcSession {
  let queue = [...session.queue]
  let cursor = session.cursor
  let transport = session.transport
  let positionMs = session.positionMs
  let durationMs = session.durationMs
  let volume = session.volume

  switch (command._tag) {
    case "queue.add":
      queue.push(...command.payload.trackIds)
      if (cursor === undefined && queue.length > 0) cursor = 0
      break
    case "queue.remove": {
      const { index } = command.payload
      if (index < 0 || index >= queue.length) throw new Error("queue index is outside the queue")
      const wasCurrent = cursor === index
      queue.splice(index, 1)
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
      cursor = undefined
      transport = RpcTransport.Stopped
      positionMs = 0
      durationMs = undefined
      break
    case "queue.shuffle": {
      // The core owns the final random order. Reverse the future suffix locally so the
      // offline action is visible without moving the current track.
      const start = cursor === undefined ? 0 : cursor + 1
      queue = [...queue.slice(0, start), ...queue.slice(start).reverse()]
      break
    }
    case "cursor.jump":
      if (command.payload.index < 0 || command.payload.index >= queue.length) {
        throw new Error("queue index is outside the queue")
      }
      cursor = command.payload.index
      transport = RpcTransport.Stopped
      positionMs = 0
      durationMs = undefined
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
    case "transport.trackEnded":
      if (transport !== RpcTransport.Playing) throw new Error("cannot end unless playing")
      transport = RpcTransport.Ended
      break
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
