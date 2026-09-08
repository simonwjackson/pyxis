import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Bar } from "../system-next/Bar.tsx"
import { IconButton } from "../system-next/IconButton.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import { Text } from "../system-next/Text.tsx"
import type { AlbumSummary } from "./album.ts"
export interface NowBarPlayingProps {
  readonly album: AlbumSummary
  readonly room: string
  readonly transport: "playing" | "paused"
  readonly otherRooms?: number
  readonly onOpenPlayer?: () => void
  readonly onOpenRooms?: () => void
  readonly onToggle?: () => void
}
// Playback presence while something is loaded. A sibling of NowBarResting rather than the
// same component holding a flag: the two say different things, carry different controls and
// have different tap targets, and folding them together would put that difference inside a
// conditional instead of in the composition.
//
// With several rooms live the bar follows the one touched last and says "+n" rather than
// pretending one line can carry the whole house.
export function NowBarPlaying({
  album,
  room,
  transport,
  otherRooms = 0,
  onOpenPlayer,
  onOpenRooms,
  onToggle,
}: NowBarPlayingProps) {
  const roomLabel = otherRooms > 0 ? `${room} +${otherRooms}` : room
  const playing = transport === "playing"
  return (
    <Bar
      title={album.title}
      detail={album.artist}
      openLabel={`Open player, ${album.title} by ${album.artist}`}
      leading={
        <Artwork
          label={`${album.title} by ${album.artist}`}
          treatment="object"
          {...(album.artworkUrl ? { src: album.artworkUrl } : {})}
        />
      }
      trailing={
        <>
          <Action
            label={`Rooms, playing in ${roomLabel}`}
            {...(onOpenRooms ? { onClick: onOpenRooms } : {})}
          >
            <StatusMark
              label={playing ? "Playing" : "Paused"}
              state={playing ? "active" : "ready"}
            />
            <Text text={roomLabel} size="small" weight="strong" />
          </Action>
          <IconButton
            label={playing ? "Pause" : "Play"}
            icon={playing ? "pause" : "play"}
            {...(onToggle ? { onClick: onToggle } : {})}
          />
        </>
      }
      {...(onOpenPlayer ? { onOpen: onOpenPlayer } : {})}
    />
  )
}
