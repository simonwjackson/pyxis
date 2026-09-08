import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Bar } from "../system-next/Bar.tsx"
export interface NowBarRestingProps {
  readonly resumeTitle?: string
  readonly onResume?: () => void
}
// Nothing playing, drawn deliberately rather than left absent. The bar keeps its footprint so
// the surface above it does not move when sound starts or stops, drops to a quieter form, and
// offers the single action that resolves the state.
//
// With nothing to resume there is nothing to offer, so the control is absent instead of
// disabled: a dead button is a worse answer than no button.
export function NowBarResting({ resumeTitle, onResume }: NowBarRestingProps) {
  return (
    <Bar
      tone="resting"
      title="Nothing playing"
      detail={resumeTitle ? `Last played ${resumeTitle}` : "Add an album to get started"}
      leading={<Artwork label="No album loaded" />}
      {...(resumeTitle && onResume
        ? { trailing: <Action label={`Resume ${resumeTitle}`} onClick={onResume} /> }
        : {})}
    />
  )
}
