import { Shelf } from "../system-next/Shelf.tsx"
import { AlbumTile } from "./AlbumTile.tsx"
import type { AlbumSummary } from "./album.ts"
export interface AlbumShelfProps {
  readonly title: string
  readonly albums: readonly AlbumSummary[]
  readonly limit?: number
  readonly soundingAlbumId?: string
  readonly onOpen?: (id: string) => void
}
// A named run of albums. Nothing is rendered when there is nothing on it: a shelf with no
// records is not an empty shelf, it is an absent one, and drawing the heading anyway invents
// a category the library does not have.
//
// The count reports everything on the shelf, not the slice shown, so the number stays true
// when the rail is cut short.
export function AlbumShelf({
  title,
  albums,
  limit = 20,
  soundingAlbumId,
  onOpen,
}: AlbumShelfProps) {
  if (albums.length === 0) return null
  return (
    <Shelf title={title} count={albums.length}>
      {albums.slice(0, limit).map((album) => (
        <AlbumTile
          key={album.id}
          title={album.title}
          artist={album.artist}
          availability={album.availability}
          sounding={album.id === soundingAlbumId}
          {...(album.artworkUrl ? { artworkUrl: album.artworkUrl } : {})}
          {...(onOpen ? { onOpen: () => onOpen(album.id) } : {})}
        />
      ))}
    </Shelf>
  )
}
