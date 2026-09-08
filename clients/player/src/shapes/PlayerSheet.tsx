import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { IconButton } from "../system-next/IconButton.tsx"
import { Lead } from "../system-next/Lead.tsx"
import type { NumericRange } from "../system-next/numeric-range.ts"
import { Progress } from "../system-next/Progress.tsx"
import { Sheet } from "../system-next/Sheet.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import { Text } from "../system-next/Text.tsx"
import type { AlbumSummary } from "./album.ts"
export interface PlayerSheetProps {
  readonly album: AlbumSummary
  readonly open: boolean
  readonly room: string
  readonly transport: "playing" | "paused" | "ended"
  readonly percentage: NumericRange<0, 100, 1>
  readonly elapsed: string
  readonly remaining: string
  readonly tint?: string
  readonly onClose: () => void
  readonly onToggle?: () => void
  readonly onPrevious?: () => void
  readonly onNext?: () => void
  readonly onOpenRooms?: () => void
  readonly onAddToCollection?: () => void
}
// Playback, given the whole surface.
//
// The sheet is headed "Now playing" rather than by the album, because the album is already the
// largest thing inside it and a title printed twice reads as two different things.
//
// "Ended" is a transport state, not an absence. An album that finishes stops, and the primary
// control becomes Continue: one tap to carry on, and silence until it is taken. Auto-advance
// would make the quiet decision for the room and is exactly what this design refuses.
//
// Adding to the collection is offered only when there is a handler for it. An album already in
// the library needs no button, and a disabled one would say "you cannot" where the truth is
// "you already have".
export function PlayerSheet({
  album,
  open,
  room,
  transport,
  percentage,
  elapsed,
  remaining,
  tint,
  onClose,
  onToggle,
  onPrevious,
  onNext,
  onOpenRooms,
  onAddToCollection,
}: PlayerSheetProps) {
  const playing = transport === "playing"
  const ended = transport === "ended"
  return (
    <Sheet
      title="Now playing"
      open={open}
      measure="wide"
      dismissLabel="Close player"
      onClose={onClose}
      {...(tint ? { tint } : {})}
    >
      <Lead
        title={album.title}
        credit={album.year ? `${album.artist} · ${album.year}` : album.artist}
        context={ended ? `Ended in ${room}` : playing ? `Playing in ${room}` : `Paused in ${room}`}
        media={
          <Artwork
            label={`${album.title} by ${album.artist}`}
            treatment="object"
            {...(album.artworkUrl ? { src: album.artworkUrl } : {})}
          />
        }
        {...(tint ? { tint } : {})}
        action={
          <Flow direction="column" gap="regular">
            <Progress
              label={`Position, ${elapsed} of ${remaining} remaining`}
              percentage={percentage}
            />
            <Flow direction="row" gap="small">
              <Text text={elapsed} size="small" tone="muted" />
              <Text text={remaining} size="small" tone="muted" />
            </Flow>
            <Flow direction="row" gap="regular">
              <IconButton
                label="Previous"
                icon="previous"
                {...(onPrevious ? { onClick: onPrevious } : {})}
              />
              <IconButton
                label={ended ? "Continue" : playing ? "Pause" : "Play"}
                icon={playing ? "pause" : "play"}
                emphasis="primary"
                {...(onToggle ? { onClick: onToggle } : {})}
              />
              <IconButton label="Next" icon="next" {...(onNext ? { onClick: onNext } : {})} />
            </Flow>
            {onAddToCollection ? (
              <Action label="Add to collection" onClick={onAddToCollection}>
                Add to collection
              </Action>
            ) : null}
          </Flow>
        }
      />
      <Action
        label={`Rooms, ${playing ? "playing" : "paused"} in ${room}`}
        {...(onOpenRooms ? { onClick: onOpenRooms } : {})}
      >
        <StatusMark
          label={playing ? "Playing" : "Not playing"}
          state={playing ? "active" : "ready"}
        />
        <Text text={room} size="small" weight="strong" />
      </Action>
    </Sheet>
  )
}
