import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { Row } from "../system-next/Row.tsx"
import { Sheet } from "../system-next/Sheet.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import { Text } from "../system-next/Text.tsx"
import type { Room } from "./entities.ts"
export interface RoomsSheetProps {
  readonly rooms: readonly Room[]
  readonly open: boolean
  readonly movingRoomId?: string
  readonly tint?: string
  readonly onClose: () => void
  readonly onMove?: (roomId: string) => void
  readonly onRetry?: (roomId: string) => void
}
// The house. Not a destination but a layer, reached from the bar's room control, and its only
// job is the one a single line of bar structurally cannot do: say where the sound is, and
// move it.
//
// Moving is reported, never performed. The sheet renders the room it was told is moving and
// emits the request; it does not run a timer and then claim success, which is the prototype's
// one dishonest moment and the thing most worth not copying.
export function RoomsSheet({
  rooms,
  open,
  movingRoomId,
  tint,
  onClose,
  onMove,
  onRetry,
}: RoomsSheetProps) {
  const sounding = rooms.some((room) => room.album)
  return (
    <Sheet title="Rooms" open={open} onClose={onClose} {...(tint ? { tint } : {})}>
      {rooms.map((room) => (
        <Row
          key={room.id}
          title={room.name}
          tone={room.trouble ? "danger" : "normal"}
          detail={
            room.trouble ??
            (room.reachable
              ? room.album
                ? `${room.album.title} — ${room.album.artist}`
                : "Nothing playing"
              : "Unreachable")
          }
          leading={
            room.album ? (
              <Artwork
                label={`${room.album.title} by ${room.album.artist}`}
                treatment="object"
                {...(room.album.artworkUrl ? { src: room.album.artworkUrl } : {})}
              />
            ) : (
              <Avatar label={room.name} initials={room.name.slice(0, 1).toUpperCase()} />
            )
          }
          actions={
            <>
              {room.playing && room.reachable ? (
                <StatusMark label="Playing here" state="active" />
              ) : null}
              {movingRoomId === room.id ? (
                <Text text="Moving…" size="small" tone="muted" weight="strong" />
              ) : room.trouble ? (
                <Action label={`Try again, ${room.name}`} onClick={() => onMove?.(room.id)}>
                  Try again
                </Action>
              ) : !room.reachable ? (
                <Action label={`Retry ${room.name}`} onClick={() => onRetry?.(room.id)}>
                  Retry
                </Action>
              ) : !room.album && sounding ? (
                <Action label={`Move here, ${room.name}`} onClick={() => onMove?.(room.id)}>
                  Move here
                </Action>
              ) : null}
            </>
          }
        />
      ))}
      <Text
        text="Audio plays in one room at a time. Moving it hands the session to that device."
        size="small"
        tone="muted"
      />
    </Sheet>
  )
}
