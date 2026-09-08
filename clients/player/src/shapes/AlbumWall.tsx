import { Wall } from "../system-next/Wall.tsx"
import { AlbumTile } from "./AlbumTile.tsx"
import type { AlbumSummary } from "./album.ts"
export interface AlbumWallProps {
  readonly label: string
  readonly albums: readonly AlbumSummary[]
  readonly soundingAlbumId?: string
  readonly onOpen?: (id: string) => void
}
// Covers at one size, read as a field. Captions belong to the surface rather than the tile:
// two hundred titles under two hundred covers is a table, and a table is not a wall.
export function AlbumWall({ label, albums, soundingAlbumId, onOpen }: AlbumWallProps) {
  return (
    <Wall label={`${label}, ${albums.length}`}>
      {albums.map((album) => (
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
    </Wall>
  )
}
