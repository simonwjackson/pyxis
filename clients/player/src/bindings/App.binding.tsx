/// The shell: the one state reader for the whole client.
///
/// Route and library are read here and nowhere else, and everything below receives plain
/// values. Both live in one binding on purpose. The two surfaces show the same library, so
/// a binding per screen would tear the library down and re-read it on every navigation —
/// the person would watch their albums disappear and come back for the crime of pressing a
/// tab. One reader, two surfaces.

import { useCallback, useMemo } from "react"
import type { AlbumView } from "../model/album"
import type { EdgeReason, Remote } from "../model/edge"
import { byRecentlyAdded, downloaded, inPlacement } from "../model/library"
import { ROUTES, routeTitle, sameRoute } from "../router/route.ts"
import type { AlbumSummary } from "../shapes/album.ts"
import { LibraryPage } from "../shapes/LibraryPage.tsx"
import { NowBarResting } from "../shapes/NowBarResting.tsx"
import { type StacksContent, StacksPage, type StacksShelf } from "../shapes/StacksPage.tsx"
import type { SurfaceState } from "../shapes/surface.ts"
import { AppFrame } from "../system-next/AppFrame.tsx"
import { ChoiceChip } from "../system-next/ChoiceChip.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { type LibraryEdge, useLibrary } from "./useLibrary.binding.tsx"
import { useRoute } from "./useRoute.binding.tsx"

/// Narrow an edge album to what a cover needs. The surfaces never see the richer view, so
/// they cannot start depending on fields the edge might stop sending.
const summarise = (album: AlbumView): AlbumSummary => ({
  id: album.id,
  title: album.title,
  artist: album.artist,
  availability: album.availability,
  ...(album.artworkUrl === undefined ? {} : { artworkUrl: album.artworkUrl }),
  ...(album.year === undefined ? {} : { year: album.year }),
})

/// Turn a reason into something worth reading. Each one implies a different next move, so
/// none of them collapses into "something went wrong".
const reasonText = (reason: EdgeReason): string => {
  if (reason.kind === "offline") return "This device is offline. Showing what it already has."
  if (reason.kind === "auth-required")
    return "This device needs to be paired again before it can reconcile."
  return `Could not reach your library: ${reason.message}`
}

/// The single translation from edge vocabulary to surface vocabulary.
///
/// The awkward case is the last one: a failure that still has data. Blanking the screen
/// there would be the easy branch and the wrong one, so the data is shown and the reason is
/// carried alongside it.
function toSurface<T>(
  remote: Remote<readonly AlbumView[]>,
  build: (albums: readonly AlbumView[]) => T,
): SurfaceState<T> {
  if (remote.state === "unknown" || remote.state === "loading") return { state: "pending" }
  if (remote.state === "ready")
    return remote.value.length === 0
      ? { state: "empty" }
      : { state: "shown", value: build(remote.value), freshness: remote.freshness }
  const reason = reasonText(remote.reason)
  // Nothing kept from before: this is the only case with genuinely nothing to draw.
  if (remote.last === undefined) return { state: "blocked", reason }
  // Kept an answer, and the answer was nothing. Both facts are true and both are said.
  if (remote.last.length === 0) return { state: "empty", reason }
  return { state: "shown", value: build(remote.last), freshness: "stale", reason }
}

function buildStacks(albums: readonly AlbumView[]): StacksContent {
  const recent = byRecentlyAdded(albums)
  const lead = recent[0]
  const shelves: readonly StacksShelf[] = [
    { id: "recent", title: "Recently added", albums: recent.slice(1).map(summarise) },
    {
      id: "collection",
      title: "In your collection",
      albums: inPlacement(albums, "collection").map(summarise),
    },
    {
      id: "discovery",
      title: "Waiting in discovery",
      albums: inPlacement(albums, "discovery").map(summarise),
    },
    { id: "downloaded", title: "On this device", albums: downloaded(albums).map(summarise) },
  ]
  // The lead is the most recently added album, because that is the only "what should I put
  // on" signal this client can honestly compute today. Play counts and neglect would make
  // better shelves, and the core records the history for them, but nothing reads it yet —
  // so those shelves are absent rather than faked.
  return {
    ...(lead === undefined ? {} : { lead: summarise(lead), leadContext: "Most recently added" }),
    shelves,
  }
}

export interface AppProps {
  /// Injected by the composition root so this binding is testable without a browser
  /// database, and so the client cannot quietly widen what it asks the worker for.
  readonly edge: LibraryEdge
}

export function App({ edge }: AppProps) {
  const { route, go } = useRoute()
  const library = useLibrary(edge)
  const { albums, refresh } = library

  const stacks = useMemo(() => toSurface(albums, buildStacks), [albums])
  const everything = useMemo(() => toSurface(albums, (found) => found.map(summarise)), [albums])
  const total = albums.state === "ready" ? albums.value.length : undefined
  const onRetry = useCallback(() => refresh(), [refresh])

  return (
    <AppFrame
      nav={
        <Flow direction="row" gap="small">
          {ROUTES.map((candidate) => (
            <ChoiceChip
              key={candidate.name}
              label={routeTitle(candidate)}
              selected={sameRoute(candidate, route)}
              {...(candidate.name === "library" && total !== undefined ? { count: total } : {})}
              onClick={() => go(candidate)}
            />
          ))}
        </Flow>
      }
      // Outside the outlet. Navigating replaces the surface above and leaves this alone,
      // which is the entire reason the router exists rather than a conditional render.
      bar={<NowBarResting />}
    >
      {route.name === "stacks" ? (
        <StacksPage library={stacks} onRetry={onRetry} />
      ) : (
        <LibraryPage library={everything} onRetry={onRetry} />
      )}
    </AppFrame>
  )
}
