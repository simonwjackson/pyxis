import { CoverButton } from "./CoverButton.tsx"
export const name = "CoverButton"

export default function CoverButtonPart() {
  return (
    <CoverButton
      label="All Hail West Texas by The Mountain Goats, downloaded on this device"
      treatment="object"
      availability="available"
      sounding={false}
    />
  )
}
