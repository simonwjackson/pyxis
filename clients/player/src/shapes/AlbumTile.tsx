import { CoverButton, type CoverButtonProps } from "../system-next/CoverButton.tsx"
export interface AlbumTileProps {
  readonly title: string
  readonly artist: string
  readonly artworkUrl?: string
  readonly availability: CoverButtonProps["availability"]
  readonly sounding?: boolean
  readonly onOpen?: () => void
}
export function AlbumTile({
  title,
  artist,
  artworkUrl,
  availability,
  sounding = false,
  onOpen,
}: AlbumTileProps) {
  const status =
    availability === "available"
      ? ", downloaded on this device"
      : availability === "downloading"
        ? ", downloading"
        : availability === "missing"
          ? ", not on this device"
          : ""
  return (
    <CoverButton
      label={`${title} by ${artist}${sounding ? ", playing now" : ""}${status}`}
      sounding={sounding}
      {...(availability ? { availability } : {})}
      {...(artworkUrl ? { src: artworkUrl } : {})}
      {...(onOpen ? { onClick: onOpen } : {})}
    />
  )
}
