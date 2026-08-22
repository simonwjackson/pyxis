/// Offline replay must be idempotent.
///
/// The queue is the only data that exists nowhere else, so the interesting question is not
/// whether one sequence works. It is whether *any* sequence of offline writes, interrupted
/// and resumed at any point, converges on the same server state as draining it once.

import { describe, expect, test } from "vitest"
import {
  type ListenTrackEventInput,
  type RpcLibraryAlbum,
  RpcPlacement,
} from "../../../../contracts/generated/pyxis"
import { RpcError, type WorkerRpc } from "../rpc/client"
import type { WorkerOutboxEntry } from "./contract"
import { createMemoryEngine, openWorkerDatabase } from "./database"
import { sync } from "./sync"

const PLACEMENTS = [
  RpcPlacement.Discovery,
  RpcPlacement.Collection,
  RpcPlacement.Archive,
  RpcPlacement.Dismissed,
] as const

/// Deterministic generator, so a failure can be reproduced from its seed alone.
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

interface Scenario {
  readonly entries: readonly WorkerOutboxEntry[]
  readonly albums: readonly RpcLibraryAlbum[]
}

function scenario(seed: number): Scenario {
  const next = random(seed)
  const albumCount = 1 + Math.floor(next() * 3)
  const albums: RpcLibraryAlbum[] = []
  for (let index = 0; index < albumCount; index += 1) {
    albums.push({
      id: `album-${index}`,
      title: `Album ${index}`,
      artist: "David Bowie",
      placement: RpcPlacement.Discovery,
      placementUpdatedAt: "2026-01-01",
      addedAt: "2026-01-01",
      revision: 1,
      tracks: [],
    })
  }

  const entries: WorkerOutboxEntry[] = []
  const writeCount = 1 + Math.floor(next() * 8)
  for (let index = 0; index < writeCount; index += 1) {
    // ULIDs sort in creation order; a padded counter has the same property.
    const id = `01${String(index).padStart(4, "0")}`
    const createdAt = `2026-06-${String(index + 1).padStart(2, "0")}`
    if (next() < 0.5) {
      const album = albums[Math.floor(next() * albums.length)]
      if (album === undefined) continue
      entries.push({
        id,
        createdAt,
        attempts: 0,
        kind: "album.placement",
        albumId: album.id,
        placement: PLACEMENTS[Math.floor(next() * PLACEMENTS.length)] ?? RpcPlacement.Collection,
        baseRevision: 1,
        basePlacement: RpcPlacement.Discovery,
      })
    } else {
      const event: ListenTrackEventInput = {
        id,
        trackId: `track-${index}`,
        deviceId: "device-1",
        listenedAt: `2026-06-01T00:00:${String(index).padStart(2, "0")}Z`,
        completed: true,
        context: "queue",
      }
      entries.push({ id, createdAt, attempts: 0, kind: "listen.append", event })
    }
  }
  return { entries, albums }
}

interface Server {
  rpc: WorkerRpc
  readonly albums: Map<string, RpcLibraryAlbum>
  readonly listens: Map<string, ListenTrackEventInput>
  offline: boolean
  /// Cuts the connection after this many writes have landed. This is what makes a run
  /// genuinely partial: some writes are applied, the rest stay queued.
  failWritesAfter: number
  writes: number
  duplicatesSeen: number
}

function server(initial: readonly RpcLibraryAlbum[]): Server {
  const albums = new Map(initial.map((entry) => [entry.id, { ...entry }]))
  const listens = new Map<string, ListenTrackEventInput>()
  const state: Server = {
    albums,
    listens,
    offline: false,
    failWritesAfter: Number.POSITIVE_INFINITY,
    writes: 0,
    duplicatesSeen: 0,
    rpc: undefined as unknown as WorkerRpc,
  }
  const guard = () => {
    if (state.offline) throw new RpcError("offline", true)
  }
  const guardWrite = () => {
    guard()
    state.writes += 1
    if (state.writes > state.failWritesAfter) throw new RpcError("connection lost", true)
  }
  state.rpc = {
    async listAlbums() {
      guard()
      return [...albums.values()]
    },
    async setPlacement(albumId, placement) {
      guardWrite()
      const existing = albums.get(albumId)
      if (existing === undefined) return undefined
      const updated = {
        ...existing,
        placement,
        revision: existing.revision + 1,
        // Stamped from the write that is landing, so ordering follows the generated
        // sequence rather than a fixed future date that always wins a conflict.
        placementUpdatedAt: `2026-06-${String(Math.min(28, state.writes)).padStart(2, "0")}`,
      }
      albums.set(albumId, updated)
      return updated
    },
    async appendListen(events) {
      guardWrite()
      let accepted = 0
      let duplicates = 0
      for (const event of events) {
        if (listens.has(event.id)) duplicates += 1
        else {
          listens.set(event.id, event)
          accepted += 1
        }
      }
      state.duplicatesSeen += duplicates
      return { accepted, duplicates }
    },
  }
  return state
}

async function drainOnce(plan: Scenario): Promise<Server> {
  const remote = server(plan.albums)
  const store = await openWorkerDatabase({ engine: createMemoryEngine() })
  await store.writeSettings({ deviceId: "device-1" })
  for (const album of plan.albums) await store.putAlbum({ ...album, id: album.id })
  for (const entry of plan.entries) await store.enqueue(entry)
  await sync(store, remote.rpc)
  return remote
}

/// Drain while the connection drops *during* the queue, not only between attempts.
///
/// This is the case that matters: some writes have landed, the rest are still queued, and
/// the next attempt must neither lose them nor apply the earlier ones a second time.
async function drainWithInterruptions(plan: Scenario, seed: number): Promise<Server> {
  const next = random(seed)
  const remote = server(plan.albums)
  const store = await openWorkerDatabase({ engine: createMemoryEngine() })
  await store.writeSettings({ deviceId: "device-1" })
  for (const album of plan.albums) await store.putAlbum({ ...album, id: album.id })
  for (const entry of plan.entries) await store.enqueue(entry)

  for (let attempt = 0; attempt < 16; attempt += 1) {
    remote.offline = next() < 0.25
    remote.writes = 0
    remote.failWritesAfter = next() < 0.6 ? Math.floor(next() * 4) : Number.POSITIVE_INFINITY
    await sync(store, remote.rpc)
    if (!remote.offline && (await store.outbox()).length === 0) break
  }

  remote.offline = false
  remote.writes = 0
  remote.failWritesAfter = Number.POSITIVE_INFINITY
  await sync(store, remote.rpc)
  return remote
}

/// Final placement is the visible outcome, and revision counts how many writes actually
/// landed. Comparing placement alone would let an implementation that pushed every write
/// twice look identical to one that pushed each once.
function snapshot(remote: Server): string {
  return JSON.stringify({
    albums: [...remote.albums.values()]
      .map((album) => `${album.id}:${album.placement}:${album.revision}`)
      .sort(),
    listens: [...remote.listens.keys()].sort(),
  })
}

describe("offline replay", () => {
  test("converges on the same server state however often it is interrupted", async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const plan = scenario(seed)
      const once = await drainOnce(plan)
      const interrupted = await drainWithInterruptions(plan, seed * 7919)

      expect(snapshot(interrupted), `seed ${seed}`).toBe(snapshot(once))
    }
  })

  test("never applies the same write twice, however often it is interrupted", async () => {
    for (let seed = 200; seed <= 240; seed += 1) {
      const plan = scenario(seed)
      const remote = await drainWithInterruptions(plan, seed * 31)
      const placements = plan.entries.filter((entry) => entry.kind === "album.placement")

      // Retries are expected. Landing the same change twice is not: revision counts what
      // actually landed, so it can never exceed the number of writes that were queued.
      const applied = [...remote.albums.values()].reduce(
        (total, album) => total + album.revision - 1,
        0,
      )
      expect(applied, `seed ${seed}`).toBeLessThanOrEqual(placements.length)
      expect(remote.duplicatesSeen, `seed ${seed}`).toBe(0)
    }
  })

  test("never loses a queued write, whatever the interruption pattern", async () => {
    for (let seed = 100; seed <= 140; seed += 1) {
      const plan = scenario(seed)
      const remote = await drainWithInterruptions(plan, seed)
      const expectedListens = plan.entries.filter((entry) => entry.kind === "listen.append")

      expect(remote.listens.size, `seed ${seed}`).toBe(
        new Set(expectedListens.map((e) => e.id)).size,
      )
    }
  })
})
