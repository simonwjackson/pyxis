import { BlankState } from "../system-next/BlankState.tsx"
import { AlbumWall } from "./AlbumWall.tsx"
import type { AlbumSummary } from "./album.ts"
export interface SearchResultsProps {
  readonly query: string
  readonly albums: readonly AlbumSummary[]
  readonly soundingAlbumId?: string
  readonly onOpen?: (id: string) => void
}
// What matched, as a wall of covers.
//
// Results are albums, so they are drawn the way albums are drawn everywhere else. A list of
// text rows would be a different kind of object for the same thing, and would make a search
// result harder to recognise than the same record on the shelf it came from.
//
// Nothing matched is a real answer and says so with the query in it. It is not the same as
// having asked nothing, which is a state this component is never in: a surface that has not
// searched yet renders no results at all rather than an empty one.
export function SearchResults({ query, albums, soundingAlbumId, onOpen }: SearchResultsProps) {
  if (albums.length === 0)
    return (
      <BlankState
        title={`Nothing matched ${query}`}
        message="Try a different spelling, or part of an artist's name."
      />
    )
  return (
    <AlbumWall
      label={`Results for ${query}`}
      albums={albums}
      {...(soundingAlbumId ? { soundingAlbumId } : {})}
      {...(onOpen ? { onOpen } : {})}
    />
  )
}
