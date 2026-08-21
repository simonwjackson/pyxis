import { createContext, useContext } from "react"
import type {
  RpcAuthGrant,
  RpcLibraryAlbum,
  RpcPlacement,
  RpcPlugin,
  RpcSearchTrack,
  RpcSession,
} from "../../../../contracts/generated/pyxis"

export interface ReferenceContextValue {
  readonly status: "booting" | "ready" | "busy" | "error"
  readonly grant?: RpcAuthGrant
  readonly plugins: readonly RpcPlugin[]
  readonly albums: readonly RpcLibraryAlbum[]
  readonly query: string
  readonly tracks: readonly RpcSearchTrack[]
  readonly searchHasNoSources: boolean
  readonly sourceFailures: readonly string[]
  readonly session?: RpcSession
  readonly audioUrl?: string
  readonly error?: string
  setQuery(value: string): void
  search(): Promise<void>
  enqueue(trackId: string): Promise<void>
  setAlbumPlacement(albumId: string, placement: RpcPlacement): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  clearQueue(): Promise<void>
  reportEnded(): Promise<void>
  attachAudio(element: HTMLAudioElement | null): void
}

export const ReferenceContext = createContext<ReferenceContextValue | null>(null)

export function useReference(): ReferenceContextValue {
  const context = useContext(ReferenceContext)
  if (context === null) throw new Error("useReference must be used within ReferenceApp")
  return context
}
