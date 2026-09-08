import { AlbumShelf } from "./AlbumShelf.tsx"
import { REVIEW_ALBUMS } from "./album-fixtures.ts"
export const name = "Album shelf"
export default function AlbumShelfPart() {
  // The count says 8 while the rail shows 4: the shelf reports what it holds, not what fits.
  return <AlbumShelf title="Recently added" albums={REVIEW_ALBUMS} limit={4} />
}
