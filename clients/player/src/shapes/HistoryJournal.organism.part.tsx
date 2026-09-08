import { REVIEW_HISTORY } from "./entity-fixtures.ts"
import { HistoryJournal } from "./HistoryJournal.tsx"
export const name = "History journal"
export default function HistoryJournalPart() {
  return <HistoryJournal days={REVIEW_HISTORY} onOpen={() => {}} />
}
