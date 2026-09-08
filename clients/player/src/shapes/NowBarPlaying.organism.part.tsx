import { GET_COLOR } from "./album-fixtures.ts"
import { NowBarPlaying } from "./NowBarPlaying.tsx"
export const name = "Now bar, playing"
export default function NowBarPlayingPart() {
  return <NowBarPlaying album={GET_COLOR} room="Kitchen" otherRooms={2} transport="playing" />
}
