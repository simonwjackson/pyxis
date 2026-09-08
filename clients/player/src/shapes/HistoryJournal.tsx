import { BlankState } from "../system-next/BlankState.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { AlbumShelf } from "./AlbumShelf.tsx"
import type { PlayDay } from "./entities.ts"
export interface HistoryJournalProps {
  readonly days: readonly PlayDay[]
  readonly soundingAlbumId?: string
  readonly onOpen?: (id: string) => void
}
// What you played, in the order you played it, as records rather than as a log.
//
// Each day is a shelf of the covers from that day, so history reads like the crate you have
// been pulling from. A timestamped table would be a more precise account of the same events
// and a much worse way to recognise any of them.
//
// Days arrive already named and already ordered. Deciding what "Today" means needs a clock and
// a timezone, and neither is visible from here.
export function HistoryJournal({ days, soundingAlbumId, onOpen }: HistoryJournalProps) {
  if (days.length === 0)
    return (
      <BlankState
        title="Nothing played yet"
        message="Albums you play will collect here, newest first."
      />
    )
  return (
    <Flow direction="column" gap="large">
      {days.map((day) => (
        <AlbumShelf
          key={day.id}
          title={day.label}
          albums={day.plays.map((play) => play.album)}
          {...(soundingAlbumId ? { soundingAlbumId } : {})}
          {...(onOpen ? { onOpen } : {})}
        />
      ))}
    </Flow>
  )
}
