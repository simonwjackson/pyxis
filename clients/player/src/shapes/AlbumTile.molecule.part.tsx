import { AlbumTile } from "./AlbumTile.tsx"
export const name = "Album tile"
export default function AlbumTilePart() {
  return (
    <AlbumTile
      title="All Hail West Texas"
      artist="The Mountain Goats"
      availability="available"
      sounding={false}
    />
  )
}
