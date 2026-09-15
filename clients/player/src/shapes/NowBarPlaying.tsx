import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Bar } from "../system-next/Bar.tsx"
import { IconButton } from "../system-next/IconButton.tsx"
import type { NumericRange } from "../system-next/numeric-range.ts"
import { Progress } from "../system-next/Progress.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import { Text } from "../system-next/Text.tsx"
import type { AlbumSummary } from "./album.ts"
export interface NowBarPlayingProps {
  readonly album: AlbumSummary
  readonly room: string
  readonly transport: "playing" | "paused"
  readonly otherRooms?: number
  /// How far into the sounding track, when its length is known. Absent rather than zero when
  /// nobody knows the length: a rule at the start and a rule that cannot place itself are
  /// different statements, and only one of them is true.
  readonly percentage?: NumericRange<0, 100, 1>
  readonly onOpenPlayer?: () => void
  readonly onOpenRooms?: () => void
  readonly onToggle?: () => void
  /// Absent when there is nothing on that side of the queue, so the control is omitted
  /// rather than offered dead.
  readonly onPrevious?: () => void
  readonly onNext?: () => void
}
// Playback presence while something is loaded. A sibling of NowBarResting rather than the
// same component holding a flag: the two say different things, carry different controls and
// have different tap targets, and folding them together would put that difference inside a
// conditional instead of in the composition.
//
// What is playing is the loudest thing on the strip, so the title is drawn at body size and
// the room, which is where it is playing rather than what it is, is a muted second line behind
// the artist. The room becomes a control only when there is somewhere to take it: an action
// with no handler is a button that teaches nothing by refusing to work, which is the same
// reason the skip controls are offered only where they can act.
export function NowBarPlaying({
  album,
  room,
  transport,
  otherRooms = 0,
  percentage,
  onOpenPlayer,
  onOpenRooms,
  onPrevious,
  onNext,
  onToggle,
}: NowBarPlayingProps) {
  const roomLabel = otherRooms > 0 ? `${room} +${otherRooms}` : room
  const playing = transport === "playing"
  // First, so that a strip too narrow for both truncates the room rather than the artist.
  const detail = onOpenRooms === undefined ? `${album.artist} · ${roomLabel}` : album.artist
  return (
    <Bar
      title={album.title}
      detail={detail}
      openLabel={`Open player, ${album.title} by ${album.artist}`}
      {...(percentage === undefined
        ? {}
        : {
            position: (
              <Progress label={`Position in ${album.title}`} size="rule" percentage={percentage} />
            ),
          })}
      leading={
        <Artwork
          label={`${album.title} by ${album.artist}`}
          treatment="object"
          {...(album.artworkUrl ? { src: album.artworkUrl } : {})}
        />
      }
      trailing={
        <>
          {onOpenRooms ? (
            <Action label={`Rooms, playing in ${roomLabel}`} size="compact" onClick={onOpenRooms}>
              <StatusMark
                label={playing ? "Playing" : "Paused"}
                state={playing ? "active" : "ready"}
              />
              <Text text={roomLabel} size="small" weight="strong" />
            </Action>
          ) : null}
          {/* Offered only where there is somewhere to go. At the first or last track the
              control is absent rather than disabled, the same way the resting bar omits a
              resume it cannot honour: a dead button teaches nothing. */}
          {onPrevious ? (
            <IconButton label="Previous track" icon="previous" onClick={onPrevious} />
          ) : null}
          <IconButton
            label={playing ? "Pause" : "Play"}
            icon={playing ? "pause" : "play"}
            {...(onToggle ? { onClick: onToggle } : {})}
          />
          {onNext ? <IconButton label="Next track" icon="next" onClick={onNext} /> : null}
        </>
      }
      {...(onOpenPlayer ? { onOpen: onOpenPlayer } : {})}
    />
  )
}
