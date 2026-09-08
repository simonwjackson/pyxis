import { useState } from "react"
import { Action } from "./Action.tsx"
import { Row } from "./Row.tsx"
import { Sheet } from "./Sheet.tsx"
import { Text } from "./Text.tsx"
export const name = "Sheet"
// The part opens on a trigger rather than on mount. A modal shown immediately would take the
// top layer the moment it was placed and cover the whole review board, including the controls
// for the part itself -- a specimen that hides the workshop cannot be reviewed in it.
//
// The trigger is also the honest specimen: focus return and inertness only mean anything when
// something opened the sheet, so the review needs a real opener to judge them.
export default function SheetPart() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Action label="Open the sheet" emphasis="primary" onClick={() => setOpen(true)} />
      <Sheet title="Rooms" open={open} onClose={() => setOpen(false)}>
        <Row title="Kitchen" detail="GET COLOR — HEALTH" />
        <Row title="Desk" detail="Nothing playing" actions={<Action label="Move here" />} />
        <Text
          text="Audio plays in one room at a time. Moving it hands the session to that device."
          size="small"
          tone="muted"
        />
      </Sheet>
    </>
  )
}
