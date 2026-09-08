/// Playback as a screen needs it.
///
/// Sessions are hosted by a device, not by the core, so two facts that look alike are kept
/// apart: what the transport is doing, and whether this client can reach the device doing
/// it. A paused session on an unreachable host is not the same as a paused session here,
/// and a transport control that pretends otherwise will silently do nothing.

import type { RpcSession } from "../../../../contracts/generated/pyxis"
import { RpcTransport } from "../../../../contracts/generated/pyxis"

/// `ended` is a real resting state, not a transient. An album finishing leaves silence and
/// waits to be continued, so it must survive in the model rather than collapsing to
/// `stopped` or auto-advancing.
export type Transport = "stopped" | "playing" | "paused" | "ended"

const TRANSPORTS: Record<RpcTransport, Transport> = {
  [RpcTransport.Stopped]: "stopped",
  [RpcTransport.Playing]: "playing",
  [RpcTransport.Paused]: "paused",
  [RpcTransport.Ended]: "ended",
}

export const readTransport = (transport: RpcTransport): Transport => TRANSPORTS[transport]

export interface PlaybackView {
  readonly sessionId: string
  readonly name: string
  readonly hostDeviceId: string
  readonly transport: Transport
  /// The host answered recently. False means every control here is inert, and the screen
  /// must say so rather than offering buttons that do nothing.
  readonly reachable: boolean
  readonly positionMs: number
  readonly durationMs?: number
  readonly volume: number
  readonly currentTrackId?: string
  readonly queueLength: number
  readonly cursor?: number
  readonly hasNext: boolean
  readonly hasPrevious: boolean
  readonly output?: { readonly pluginId: string; readonly targetId: string }
  /// The album finished and nothing is playing on purpose. The screen offers to continue;
  /// it does not continue by itself.
  readonly awaitingContinue: boolean
  /// True only when a command sent now could actually take effect.
  readonly controllable: boolean
}

export function readSession(session: RpcSession): PlaybackView {
  const transport = readTransport(session.transport)
  const cursor = session.cursor
  const queueLength = session.queue.length
  return {
    sessionId: session.id,
    name: session.name,
    hostDeviceId: session.hostDeviceId,
    transport,
    reachable: session.reachable,
    positionMs: session.positionMs,
    ...(session.durationMs === undefined ? {} : { durationMs: session.durationMs }),
    volume: session.volume,
    ...(session.currentTrackId === undefined ? {} : { currentTrackId: session.currentTrackId }),
    queueLength,
    ...(cursor === undefined ? {} : { cursor }),
    hasNext: cursor !== undefined && cursor + 1 < queueLength,
    hasPrevious: cursor !== undefined && cursor > 0,
    ...(session.output === undefined ? {} : { output: session.output }),
    awaitingContinue: transport === "ended",
    controllable: session.reachable,
  }
}

/// Fraction played, from 0 to 1.
///
/// Undefined when the duration is unknown or zero, so a progress bar cannot render a
/// confident 0% for a track whose length nobody knows.
export function playedFraction(playback: PlaybackView): number | undefined {
  const duration = playback.durationMs
  if (duration === undefined || duration <= 0) return undefined
  return Math.min(1, Math.max(0, playback.positionMs / duration))
}

/// Pick the session this device should show.
///
/// Prefers a session hosted here, because that is the one whose controls are guaranteed to
/// work. Falls back to a reachable session elsewhere, and finally to any known session so
/// an unreachable room is still visible rather than vanishing.
/// Which of this device's sessions is the one being rendered.
///
/// A device can host more than one, and in practice does: nothing prunes them, so they
/// accumulate across launches. Picking the first match in list order looked fine while there
/// was one, and became a coin toss once there were six -- every caller made its own choice,
/// they disagreed, and each incoming event flipped the answer. Several albums then took turns
/// loading and playing, which is what that sounds like from the outside.
///
/// So the rule is written once, here, and every caller uses it. A session that is playing
/// wins, because the one making sound is unarguably the one in use. Otherwise the most
/// recently touched wins, which is the one a person last did something with. Ties break on
/// id, so the answer is the same every time it is asked even when timestamps collide.
export function chooseLocalSession(
  sessions: readonly RpcSession[],
  deviceId?: string,
): RpcSession | undefined {
  if (deviceId === undefined) return undefined
  const mine = sessions.filter((session) => session.hostDeviceId === deviceId)
  return [...mine].sort(compareByUse)[0]
}

function compareByUse(left: RpcSession, right: RpcSession): number {
  const sounding = (session: RpcSession) => (session.transport === RpcTransport.Playing ? 0 : 1)
  if (sounding(left) !== sounding(right)) return sounding(left) - sounding(right)
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1
  return left.id < right.id ? 1 : -1
}

export function currentPlayback(
  sessions: readonly RpcSession[],
  deviceId?: string,
): PlaybackView | undefined {
  if (sessions.length === 0) return undefined
  const local = chooseLocalSession(sessions, deviceId)
  const chosen = local ?? sessions.find((session) => session.reachable) ?? sessions[0]
  return chosen === undefined ? undefined : readSession(chosen)
}
