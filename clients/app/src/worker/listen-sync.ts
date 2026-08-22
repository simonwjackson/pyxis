/// Batched listening history.
///
/// Listen events are append-only and idempotent by id, so replaying a batch is safe and is
/// the intended path after a reconnect.
///
/// The server accepts or rejects a whole batch. When it rejects one permanently, the
/// client cannot be told which event was at fault, so a single malformed event would
/// otherwise block every later listen forever. Splitting the batch isolates it.

import type { ListenTrackEventInput } from "../../../../contracts/generated/pyxis"
import { RpcError, type WorkerRpc } from "../rpc/client"

/// Large enough that a long offline session drains quickly, small enough that one rejected
/// batch does not take many rounds to bisect.
export const LISTEN_BATCH_SIZE = 50

export interface ListenSubmission {
  readonly accepted: readonly string[]
  readonly duplicates: number
  /// Events the server rejected permanently. Dropped from the queue, never retried.
  readonly rejected: readonly { readonly id: string; readonly reason: string }[]
  /// Events that could not be sent yet. Still queued.
  readonly deferred: readonly string[]
}

interface Pending {
  readonly id: string
  readonly event: ListenTrackEventInput
}

export async function submitListens(
  rpc: WorkerRpc,
  pending: readonly Pending[],
): Promise<ListenSubmission> {
  const accepted: string[] = []
  const rejected: { id: string; reason: string }[] = []
  const deferred: string[] = []
  let duplicates = 0

  for (let index = 0; index < pending.length; index += LISTEN_BATCH_SIZE) {
    const batch = pending.slice(index, index + LISTEN_BATCH_SIZE)
    const result = await send(rpc, batch)
    accepted.push(...result.accepted)
    rejected.push(...result.rejected)
    duplicates += result.duplicates
    if (result.deferred.length > 0) {
      // The network went away. Everything from here stays queued, in order.
      deferred.push(...result.deferred)
      for (const later of pending.slice(index + LISTEN_BATCH_SIZE)) deferred.push(later.id)
      break
    }
  }

  return { accepted, duplicates, rejected, deferred }
}

async function send(rpc: WorkerRpc, batch: readonly Pending[]): Promise<ListenSubmission> {
  if (batch.length === 0) {
    return { accepted: [], duplicates: 0, rejected: [], deferred: [] }
  }
  try {
    const result = await rpc.appendListen(batch.map((entry) => entry.event))
    return {
      accepted: batch.map((entry) => entry.id),
      duplicates: result.duplicates,
      rejected: [],
      deferred: [],
    }
  } catch (cause) {
    const error = cause instanceof RpcError ? cause : new RpcError(String(cause), false)
    // An auth failure is about the credentials, not the events. Bisecting would issue a
    // hundred doomed requests and then delete a person's entire listening history because
    // a token expired.
    if (error.retryable || error.auth) {
      return { accepted: [], duplicates: 0, rejected: [], deferred: batch.map((e) => e.id) }
    }
    if (batch.length === 1) {
      const only = batch[0]
      // Nothing left to split. This event is the poison one.
      return {
        accepted: [],
        duplicates: 0,
        rejected: only === undefined ? [] : [{ id: only.id, reason: error.message }],
        deferred: [],
      }
    }
    // Bisect to find the event the server will not take, so the rest still lands.
    const middle = Math.floor(batch.length / 2)
    const left = await send(rpc, batch.slice(0, middle))
    const right = await send(rpc, batch.slice(middle))
    return {
      accepted: [...left.accepted, ...right.accepted],
      duplicates: left.duplicates + right.duplicates,
      rejected: [...left.rejected, ...right.rejected],
      deferred: [...left.deferred, ...right.deferred],
    }
  }
}
