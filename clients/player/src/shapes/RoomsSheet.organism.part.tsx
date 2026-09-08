import { useState } from "react"
import { Action } from "../system-next/Action.tsx"
import { REVIEW_ROOMS } from "./entity-fixtures.ts"
import { RoomsSheet } from "./RoomsSheet.tsx"
export const name = "Rooms sheet"
// Opened by a trigger, never on mount: a modal that took the top layer as soon as it was
// placed would cover the board it is being reviewed on.
//
// The fixture carries a playing room, two idle rooms that can therefore be moved to, and one
// that cannot be reached, so all four row treatments are on screen at once.
export default function RoomsSheetPart() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Action label="Open rooms" emphasis="primary" onClick={() => setOpen(true)}>
        Open rooms
      </Action>
      <RoomsSheet rooms={REVIEW_ROOMS} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
