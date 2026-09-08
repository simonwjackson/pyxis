import { GET_COLOR, REVIEW_ALBUMS } from "./album-fixtures.ts"
import type { AccountStanding, Device, PlayDay, Room, Source } from "./entities.ts"
// Review fixtures for everything that is not an album. Each set deliberately carries its
// awkward cases, because a list where every row is healthy proves only that the happy path
// draws: a room that cannot be reached, a source whose session expired, a device that is this
// one, and a move that failed.
export const REVIEW_ROOMS: readonly Room[] = [
  { id: "kitchen", name: "Kitchen", playing: true, reachable: true, album: GET_COLOR },
  { id: "desk", name: "Desk", playing: false, reachable: true },
  { id: "phone", name: "This phone", playing: false, reachable: true },
  { id: "living", name: "Living room", playing: false, reachable: false },
]
export const TROUBLED_ROOMS: readonly Room[] = [
  { id: "kitchen", name: "Kitchen", playing: true, reachable: true, album: GET_COLOR },
  {
    id: "living",
    name: "Living room",
    playing: false,
    reachable: true,
    trouble: "Could not move here — still playing in Kitchen",
  },
]
export const REVIEW_SOURCES: readonly Source[] = [
  {
    id: "ytmusic",
    name: "YouTube Music",
    initials: "YT",
    detail: "Streaming and library",
    albums: 366,
    status: "connected",
  },
  {
    id: "pandora",
    name: "Pandora",
    initials: "PA",
    detail: "Stations, for discovery",
    albums: 4,
    status: "expired",
  },
  {
    id: "soulseek",
    name: "Soulseek",
    initials: "SL",
    detail: "Library only, never uploads",
    albums: 0,
    status: "available",
  },
]
export const REVIEW_DEVICES: readonly Device[] = [
  { id: "phone", name: "This phone", initials: "TP", detail: "Signed in now", state: "this" },
  { id: "kitchen", name: "Kitchen", initials: "KI", detail: "Speaker", state: "reachable" },
  {
    id: "living",
    name: "Living room",
    initials: "LR",
    detail: "Last seen yesterday",
    state: "unreachable",
  },
]
// The ordinary state: this device holds a credential on the one account there is.
export const REVIEW_ACCOUNT_PAIRED: AccountStanding = {
  state: "paired",
  accountName: "Default",
  deviceName: "Firefox on Linux",
}
// Refused, but a person can fix it. This is the case the surface exists for.
export const REVIEW_ACCOUNT_UNPAIRED: AccountStanding = {
  state: "unpaired",
  deviceName: "Firefox on Linux",
  trouble: "Your library refused this device. Pair it to let it read your albums.",
  canRetry: true,
}
// Refused for good. Carried as a fixture because a surface that only ever shows recoverable
// trouble is a surface nobody has checked for the case where the button must not appear.
export const REVIEW_ACCOUNT_REFUSED: AccountStanding = {
  state: "unpaired",
  deviceName: "Firefox on Linux",
  trouble: "unsupported: claims are disabled on this server.",
  canRetry: false,
}
export const REVIEW_HISTORY: readonly PlayDay[] = [
  {
    id: "today",
    label: "Today",
    plays: [
      { id: "p1", album: GET_COLOR, room: "Kitchen" },
      { id: "p2", album: REVIEW_ALBUMS[3] as (typeof REVIEW_ALBUMS)[number], room: "Desk" },
    ],
  },
  {
    id: "yesterday",
    label: "Yesterday",
    plays: [{ id: "p3", album: REVIEW_ALBUMS[5] as (typeof REVIEW_ALBUMS)[number] }],
  },
]
