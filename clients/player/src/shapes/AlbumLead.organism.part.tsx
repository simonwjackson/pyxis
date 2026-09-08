import { AlbumLead } from "./AlbumLead.tsx"
import { GET_COLOR } from "./album-fixtures.ts"
export const name = "Album lead"
export default function AlbumLeadPart() {
  return <AlbumLead album={GET_COLOR} context="Where you left off" />
}
