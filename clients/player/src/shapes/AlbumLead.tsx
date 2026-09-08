import { Action } from "../system-next/Action.tsx"
import { CoverButton } from "../system-next/CoverButton.tsx"
import { Lead } from "../system-next/Lead.tsx"
import type { AlbumSummary } from "./album.ts"
export interface AlbumLeadProps {
  readonly album: AlbumSummary
  readonly context?: string
  readonly tint?: string
  readonly onOpen?: () => void
  readonly onPlay?: () => void
}
// The record on the turntable. The cover is treated as an object here rather than a flat tile,
// because it is on its own: the flat treatment is right on the wall, where covers are texture.
export function AlbumLead({ album, context, tint, onOpen, onPlay }: AlbumLeadProps) {
  const credit = album.year ? `${album.artist} · ${album.year}` : album.artist
  return (
    <Lead
      title={album.title}
      credit={credit}
      {...(tint ? { tint } : {})}
      {...(context ? { context } : {})}
      {...(onPlay ? { action: <Action label="Play" emphasis="primary" onClick={onPlay} /> } : {})}
      media={
        <CoverButton
          label={`${album.title} by ${album.artist}`}
          treatment="object"
          availability={album.availability}
          {...(album.artworkUrl ? { src: album.artworkUrl } : {})}
          {...(onOpen ? { onClick: onOpen } : {})}
        />
      }
    />
  )
}
