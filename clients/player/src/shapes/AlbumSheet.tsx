import { Action } from "../system-next/Action.tsx"
import { Artwork } from "../system-next/Artwork.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { Lead } from "../system-next/Lead.tsx"
import { Panel } from "../system-next/Panel.tsx"
import { Row } from "../system-next/Row.tsx"
import { Sheet } from "../system-next/Sheet.tsx"
import { Text } from "../system-next/Text.tsx"
import type { AlbumSummary } from "./album.ts"
export interface AlbumTrack {
  readonly id: string
  readonly title: string
  readonly duration: string
}
export interface AlbumSheetProps {
  readonly album: AlbumSummary
  readonly open: boolean
  readonly tracks?: readonly AlbumTrack[]
  readonly tint?: string
  readonly onClose: () => void
  readonly onPlay?: () => void
  readonly onAddToCollection?: () => void
}
// One album, given a surface of its own.
//
// The record is the subject and the tracklist is reference material, so the sleeve and its
// credit take the top at full size and the titles sit underneath in a named group. Leading
// with eleven rows of text would make every album in the library look like every other one;
// the cover is the thing a person actually recognises.
//
// A missing tracklist is not an empty one. When no tracks are given the group is absent
// entirely, because "Tracks, 0" asserts that this album has none.
export function AlbumSheet({
  album,
  open,
  tracks,
  tint,
  onClose,
  onPlay,
  onAddToCollection,
}: AlbumSheetProps) {
  const availability =
    album.availability === "available"
      ? "Downloaded on this device"
      : album.availability === "downloading"
        ? "Downloading"
        : album.availability === "missing"
          ? "Not on this device"
          : "Availability unknown"
  return (
    <Sheet title="Album" open={open} measure="wide" onClose={onClose} {...(tint ? { tint } : {})}>
      <Lead
        title={album.title}
        credit={album.year ? `${album.artist} · ${album.year}` : album.artist}
        context={availability}
        media={
          <Artwork
            label={`${album.title} by ${album.artist}`}
            treatment="object"
            {...(album.artworkUrl ? { src: album.artworkUrl } : {})}
          />
        }
        {...(tint ? { tint } : {})}
        action={
          <Flow direction="row" gap="small">
            {onPlay ? (
              <Action label={`Play ${album.title}`} emphasis="primary" onClick={onPlay}>
                Play
              </Action>
            ) : null}
            {onAddToCollection ? (
              <Action label="Add to collection" onClick={onAddToCollection}>
                Add to collection
              </Action>
            ) : null}
          </Flow>
        }
      />
      {tracks ? (
        <Panel title="Tracks" count={tracks.length}>
          {tracks.map((track) => (
            <Row key={track.id} title={track.title} detail={track.duration} />
          ))}
        </Panel>
      ) : (
        <Text text="Track listing not loaded." size="small" tone="muted" />
      )}
    </Sheet>
  )
}
