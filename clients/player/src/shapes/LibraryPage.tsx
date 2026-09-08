import type { ReactNode } from "react"
import { Flow } from "../system-next/Flow.tsx"
import { Notice } from "../system-next/Notice.tsx"
import { AlbumWall } from "./AlbumWall.tsx"
import type { AlbumSummary } from "./album.ts"
import { SurfaceStatus } from "./SurfaceStatus.tsx"
import type { SurfaceState } from "./surface.ts"

export interface LibraryPageProps {
  readonly library: SurfaceState<readonly AlbumSummary[]>
  readonly emptyAction?: ReactNode
  readonly onRetry?: () => void
  /// Choosing an album. Without this every cover renders as a control that does nothing,
  /// which is worse than a cover that is plainly not a control.
  readonly onOpenAlbum?: (albumId: string) => void
}

// Everything, at one size, as a field to scan rather than a list to read. This is the
// surface for "I know it is in here somewhere", which is a different question from the one
// Stacks answers, and so it is a different surface rather than a mode of the same one.
export function LibraryPage({ library, emptyAction, onRetry, onOpenAlbum }: LibraryPageProps) {
  if (library.state !== "shown")
    return (
      <SurfaceStatus
        state={library.state}
        emptyTitle="No albums yet"
        emptyMessage="Albums you add to your library will collect here."
        {...(library.state !== "pending" && library.reason ? { reason: library.reason } : {})}
        {...(emptyAction ? { emptyAction } : {})}
        {...(onRetry ? { onRetry } : {})}
      />
    )

  return (
    <Flow gap="large">
      {library.reason ? <Notice message={library.reason} tone="failure" /> : null}
      {library.reason === undefined && library.freshness === "local" ? (
        <Notice message="Not checked with your library yet" />
      ) : null}
      {library.reason === undefined && library.freshness === "stale" ? (
        <Notice message="Showing what this device already had" />
      ) : null}
      <AlbumWall
        label="All albums"
        albums={library.value}
        {...(onOpenAlbum ? { onOpen: onOpenAlbum } : {})}
      />
    </Flow>
  )
}
