import { GET_COLOR } from "./album-fixtures.ts"
import { NowBarPlaying } from "./NowBarPlaying.tsx"
export const name = "Now bar, playing"
// Mid-album with a length known, so the position rule, the transport and the room readout all
// have something to say. `otherRooms` is stated because a bar that says only "Kitchen" when
// three rooms are live is telling a half-truth.
export default function NowBarPlayingPart() {
  return (
    <NowBarPlaying
      album={GET_COLOR}
      room="Kitchen"
      otherRooms={2}
      transport="playing"
      percentage={38}
    />
  )
}
