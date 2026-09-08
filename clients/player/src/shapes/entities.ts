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
// What this device can say about the account it belongs to.
//
// One account, and no list. The core creates a default account on first boot and this device
// claims onto it. There is nothing to switch between, no account id to thread through the
// product, and no second account to add — so this describes a standing, not a roster.
export type AccountStanding =
  // The core granted this device a credential, so both names are known.
  | { readonly state: "paired"; readonly accountName: string; readonly deviceName: string }
  // No credential. The account's name is genuinely unknown in this case rather than merely
  // omitted: a name is only ever learned from a grant, and this device never received one.
  | {
      readonly state: "unpaired"
      readonly deviceName: string
      readonly trouble: string
      // Whether asking again could help. A refusal that can never succeed is not retryable,
      // and a button that cannot work is worse than no button.
      readonly canRetry: boolean
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
