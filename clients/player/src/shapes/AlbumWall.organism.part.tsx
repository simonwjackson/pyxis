import { AlbumWall } from "./AlbumWall.tsx"
import { REVIEW_ALBUMS } from "./album-fixtures.ts"
export const name = "Album wall"
export default function AlbumWallPart() {
  return <AlbumWall label="All albums" albums={REVIEW_ALBUMS} soundingAlbumId="c" />
}
