import { REVIEW_SOURCES } from "./entity-fixtures.ts"
import { SourceList } from "./SourceList.tsx"
export const name = "Source list"
// Connected, expired and installable together. A list where every source is healthy would hide
// both of the states this component exists to handle.
export default function SourceListPart() {
  return <SourceList sources={REVIEW_SOURCES} onConnect={() => {}} onInstall={() => {}} />
}
