import type { AlbumSummary } from "./album.ts"
// The things that are not albums: where sound comes out, where it comes from, and whose
// library it is. Each carries only what a surface has to draw, and every one of them is given
// rather than derived, because the truth about a room or a source lives at the edge.
export interface Room {
  readonly id: string
  readonly name: string
  readonly playing: boolean
  readonly reachable: boolean
  readonly album?: AlbumSummary
  // A move that failed is a fact about this room. Silence that reads as success sends someone
  // hunting for a device that was never playing.
  readonly trouble?: string
}
export interface Source {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly detail: string
  readonly albums: number
  readonly status: "connected" | "disconnected" | "expired" | "available"
}
export interface Device {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly detail: string
  readonly state: "this" | "reachable" | "unreachable"
}
export interface Account {
  readonly id: string
  readonly name: string
  readonly sources: number
  readonly albums: number
  readonly current: boolean
}
export interface Play {
  readonly id: string
  readonly album: AlbumSummary
  readonly room?: string
}
// Days arrive already named. "Today" depends on a clock and a timezone, and a component that
// decided it would be guessing at something the edge knows.
export interface PlayDay {
  readonly id: string
  readonly label: string
  readonly plays: readonly Play[]
}
