import type { ReactNode } from "react"
import { Flow } from "../system-next/Flow.tsx"
import { Notice } from "../system-next/Notice.tsx"
import { AlbumLead } from "./AlbumLead.tsx"
import { AlbumShelf } from "./AlbumShelf.tsx"
import type { AlbumSummary } from "./album.ts"
import { SurfaceStatus } from "./SurfaceStatus.tsx"
import type { SurfaceState } from "./surface.ts"

export interface StacksShelf {
  readonly id: string
  readonly title: string
  readonly albums: readonly AlbumSummary[]
}

export interface StacksContent {
  /// The one album given the top of the surface. Absent when the library is too small for a
  /// lead to mean anything, in which case the shelves carry the surface alone.
  readonly lead?: AlbumSummary
  readonly leadContext?: string
  readonly leadTint?: string
  readonly shelves: readonly StacksShelf[]
}

export interface StacksPageProps {
  readonly library: SurfaceState<StacksContent>
  readonly emptyAction?: ReactNode
  readonly onRetry?: () => void
}

// Home. It answers one question — what should I put on — and the answer is an album, so an
// album gets the top of the surface and the rest are runs beneath it.
//
// Every edge state is drawn here rather than upstream, so that each one can be placed on a
// board and looked at. A screen whose loading and failure states only exist inside a binding
// is a screen nobody has ever seen fail.
export function StacksPage({ library, emptyAction, onRetry }: StacksPageProps) {
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

  const { lead, leadContext, leadTint, shelves } = library.value
  return (
    <Flow gap="large">
      {library.reason ? <Notice message={library.reason} tone="failure" /> : null}
      {library.reason === undefined && library.freshness === "local" ? (
        <Notice message="Not checked with your library yet" />
      ) : null}
      {library.reason === undefined && library.freshness === "stale" ? (
        <Notice message="Showing what this device already had" />
      ) : null}
      {lead ? (
        <AlbumLead
          album={lead}
          {...(leadContext ? { context: leadContext } : {})}
          {...(leadTint ? { tint: leadTint } : {})}
        />
      ) : null}
      {shelves.map((shelf) => (
        <AlbumShelf key={shelf.id} title={shelf.title} albums={shelf.albums} />
      ))}
    </Flow>
  )
}
