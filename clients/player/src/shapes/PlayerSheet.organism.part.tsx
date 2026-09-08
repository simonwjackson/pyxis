import { useState } from "react"
import { Action } from "../system-next/Action.tsx"
import { GET_COLOR } from "./album-fixtures.ts"
import { PlayerSheet } from "./PlayerSheet.tsx"
export const name = "Player sheet"
// A trigger rather than an open-on-mount modal, so the specimen does not cover the board.
//
// Shown mid-album and playing, which is the state the transport, the progress and the room
// control all have something to say in.
export default function PlayerSheetPart() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Action label="Open player" emphasis="primary" onClick={() => setOpen(true)}>
        Open player
      </Action>
      <PlayerSheet
        album={GET_COLOR}
        open={open}
        room="Kitchen"
        transport="playing"
        percentage={38}
        elapsed="2:41"
        remaining="-4:22"
        onClose={() => setOpen(false)}
        onToggle={() => {}}
        onOpenRooms={() => {}}
        onAddToCollection={() => {}}
      />
    </>
  )
}
