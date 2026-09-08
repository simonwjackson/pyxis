import { CoverButton } from "./CoverButton.tsx"
import { Shelf } from "./Shelf.tsx"
export const name = "Shelf"
export default function ShelfPart() {
  return (
    <Shelf title="Recently added" count={37}>
      <CoverButton label="First" availability="available" />
      <CoverButton label="Second" availability="available" />
      <CoverButton label="Third" availability="missing" />
      <CoverButton label="Fourth" availability="available" />
    </Shelf>
  )
}
