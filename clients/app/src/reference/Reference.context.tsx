import { createContext, useContext } from "react"
import type {
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcOutputTopology,
  RpcPlacement,
  RpcPlugin,
  RpcSearchTrack,
  RpcSession,
} from "../../../../contracts/generated/pyxis"
import type { OfflineOverview, WorkerOpenReport, WorkerSyncNotice } from "../worker/contract.ts"
import type { SyncReport } from "../worker/sync.ts"

export type ConsoleCommand = "play" | "pause" | "stop"

/// What the device knows without the network. Absent until the local store has opened.
export interface LocalState {
  readonly report: WorkerOpenReport
  readonly deviceId?: string
  readonly albumCount: number
  readonly lastSync?: SyncReport
  readonly notices: readonly WorkerSyncNotice[]
}

export interface ReferenceContextValue {
  readonly status: "booting" | "ready" | "busy" | "error"
  readonly grant?: RpcAuthGrant
  readonly plugins: readonly RpcPlugin[]
  readonly albums: readonly RpcLibraryAlbum[]
  readonly outputs: readonly RpcOutputTopology[]
  readonly query: string
  readonly tracks: readonly RpcSearchTrack[]
  readonly searchHasNoSources: boolean
  readonly sourceFailures: readonly string[]
  readonly session?: RpcSession
  /// Other devices on this account that can be driven right now.
  readonly remoteSessions: readonly RpcSession[]
  readonly local?: LocalState
  readonly offline?: OfflineOverview
  /// The server is serving a newer build than this page is running.
  readonly updateAvailable: boolean
  readonly audioUrl?: string
  readonly error?: string
  setQuery(value: string): void
  search(): Promise<void>
  enqueue(trackId: string): Promise<void>
  /// Queue every track of a library album, in album order.
  enqueueAlbum(albumId: string): Promise<void>
  enqueueAlbumOnSession(sessionId: string, albumId: string): Promise<void>
  clearOutputQueue(sessionId: string): Promise<void>
  discoverOutput(pluginId: string): Promise<void>
  createOutputSession(pluginId: string, targetId: string, name: string): Promise<void>
  setOutputGroup(
    pluginId: string,
    coordinatorId: string,
    memberIds: readonly string[],
  ): Promise<void>
  setAlbumPlacement(albumId: string, placement: RpcPlacement): Promise<void>
  pinAlbum(albumId: string): Promise<void>
  unpinAlbum(albumId: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  clearQueue(): Promise<void>
  reportEnded(): Promise<void>
  applyUpdate(): void
  driveRemote(sessionId: string, command: ConsoleCommand): Promise<void>
  handOffTo(targetSessionId: string): Promise<void>
  attachAudio(element: HTMLAudioElement | null): void
}

export const ReferenceContext = createContext<ReferenceContextValue | null>(null)

export function useReference(): ReferenceContextValue {
  const context = useContext(ReferenceContext)
  if (context === null) throw new Error("useReference must be used within ReferenceApp")
  return context
}
