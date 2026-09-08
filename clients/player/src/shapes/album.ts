// The album as the shapes need to draw one. Deliberately smaller than whatever the edge
// returns: a tile needs a name, a cover and whether the bytes are here, and nothing else.
// Availability is a fact about this device, not a preference — "wanted offline" and "actually
// has the bytes" are different states and are not collapsed here.
export interface AlbumSummary {
  readonly id: string
  readonly title: string
  readonly artist: string
  readonly availability: "unknown" | "missing" | "downloading" | "available"
  readonly artworkUrl?: string
  readonly year?: number
}
