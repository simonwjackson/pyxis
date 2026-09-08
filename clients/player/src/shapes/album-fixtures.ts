import artworkUrl from "../preview/assets/get-color.jpg"
import type { AlbumSummary } from "./album.ts"
// Review fixtures. One real cover so colour and edge treatment can be judged, and the rest
// deliberately without artwork: the fallback and the availability marks are states the design
// has to survive, and a set where every cover loads hides both.
export const GET_COLOR: AlbumSummary = {
  id: "01M0KF63TW5WYM7HQ3127AG3Q1",
  title: "GET COLOR",
  artist: "HEALTH",
  year: 2009,
  availability: "available",
  artworkUrl,
}
export const REVIEW_ALBUMS: readonly AlbumSummary[] = [
  GET_COLOR,
  {
    id: "b",
    title: "All Hail West Texas",
    artist: "The Mountain Goats",
    year: 2002,
    availability: "available",
  },
  { id: "c", title: "Nevermind", artist: "Nirvana", year: 1991, availability: "downloading" },
  { id: "d", title: "Kid A", artist: "Radiohead", year: 2000, availability: "missing" },
  { id: "e", title: "Spiderland", artist: "Slint", year: 1991, availability: "unknown" },
  {
    id: "f",
    title: "Loveless",
    artist: "My Bloody Valentine",
    year: 1991,
    availability: "available",
  },
  { id: "g", title: "In Rainbows", artist: "Radiohead", year: 2007, availability: "missing" },
  { id: "h", title: "Rubber Soul", artist: "The Beatles", year: 1965, availability: "available" },
]
