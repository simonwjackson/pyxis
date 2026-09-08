import { Action } from "./Action.tsx"
import { CoverButton } from "./CoverButton.tsx"
import { Lead } from "./Lead.tsx"
export const name = "Lead"
export default function LeadPart() {
  return (
    <Lead
      context="Where you left off"
      title="GET COLOR"
      credit="HEALTH · 2009"
      media={
        <CoverButton label="GET COLOR by HEALTH" treatment="object" availability="available" />
      }
      action={<Action label="Play" emphasis="primary" />}
    />
  )
}
