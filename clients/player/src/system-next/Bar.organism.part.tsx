import { Artwork } from "./Artwork.tsx"
import { Bar } from "./Bar.tsx"
import { IconButton } from "./IconButton.tsx"
import { Progress } from "./Progress.tsx"
export const name = "Bar"
export default function BarPart() {
  return (
    <Bar
      title="GET COLOR"
      detail="HEALTH · Kitchen"
      openLabel="Open player"
      position={<Progress label="Position in GET COLOR" size="rule" percentage={38} />}
      leading={<Artwork label="GET COLOR by HEALTH" treatment="object" />}
      trailing={<IconButton label="Pause" icon="pause" />}
      onOpen={() => {}}
    />
  )
}
