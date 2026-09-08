import { useState } from "react"
import { Action } from "../system-next/Action.tsx"
import { AlbumSheet } from "./AlbumSheet.tsx"
import { GET_COLOR } from "./album-fixtures.ts"
export const name = "Album sheet"
// A trigger, so the modal does not cover the board it is reviewed on.
//
// Shown with a real tracklist, because the whole point of this surface is that the tracks are
// demoted below the sleeve, and a sheet with no tracks cannot demonstrate that.
export default function AlbumSheetPart() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Action label="Open album" emphasis="primary" onClick={() => setOpen(true)}>
        Open album
      </Action>
      <AlbumSheet
        album={GET_COLOR}
        open={open}
        onClose={() => setOpen(false)}
        onPlay={() => {}}
        onAddToCollection={() => {}}
        tracks={[
          { id: "1", title: "In Heat", duration: "3:12" },
          { id: "2", title: "Die Slow", duration: "3:01" },
          { id: "3", title: "Nice Girls", duration: "3:44" },
          { id: "4", title: "Death+", duration: "2:28" },
          { id: "5", title: "Before Tigers", duration: "4:06" },
        ]}
      />
    </>
  )
}
