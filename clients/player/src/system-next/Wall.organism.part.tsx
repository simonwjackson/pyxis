import { CoverButton } from "./CoverButton.tsx"
import { Wall } from "./Wall.tsx"
export const name = "Wall"
export default function WallPart() {
  return (
    <Wall label="Items, 4">
      <CoverButton label="First" availability="available" />
      <CoverButton label="Second" availability="downloading" />
      <CoverButton label="Third" availability="missing" />
      <CoverButton label="Fourth" availability="unknown" />
    </Wall>
  )
}
