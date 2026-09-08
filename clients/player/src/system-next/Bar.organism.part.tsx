import { Artwork } from "./Artwork.tsx"
import { Bar } from "./Bar.tsx"
import { IconButton } from "./IconButton.tsx"
export const name = "Bar"
export default function BarPart() {
  return (
    <Bar
      title="GET COLOR"
      detail="HEALTH"
      openLabel="Open player"
      leading={<Artwork label="GET COLOR by HEALTH" treatment="object" />}
      trailing={<IconButton label="Pause" icon="pause" />}
      onOpen={() => {}}
    />
  )
}
