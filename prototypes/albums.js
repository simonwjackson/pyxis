// The shared feature layer: units that know what an album is.
//
// Deliberately separate from parts.js, which must survive having the domain removed. These
// cannot — an album tile is about albums — but they are still shared, because "only one page
// uses it" is a statement about today. The row molecule was three copies by the time anyone
// looked.

import { availability, element, escape, sleeve } from "./common.js"

// An album as a cover: the art, what state it is in, and nothing else. Captions belong to the
// surface, not to the tile, because the wall reads as art and the shelves read as art.
export function albumTile(album, { sounding = false, offline = false, onOpen } = {}) {
  const state = availability(album)
  const marks = [sounding ? "sounding" : "", state].join(" ").trim()

  // The label carries what the marks say visually, since a screen reader gets no art.
  const name = `${escape(album.title)} by ${escape(album.artist)}${
    sounding ? ", playing now" : ""
  }${offline && state !== "available" ? ", not on this device" : ""}`

  const node = element(`
    <button class="item" aria-label="${name}" title="${name}">
      <span class="frame ${marks}">${sleeve(album)}</span>
    </button>
  `)
  if (onOpen) node.onclick = () => onOpen(album)
  return node
}

// A named run of albums with its count. Returns null when empty: a shelf with nothing on it
// is not an empty shelf, it is an absent one.
export function albumShelf(title, albums, { limit = 20, tile } = {}) {
  if (albums.length === 0) return null

  const node = element(`
    <section class="shelf">
      <h2><b>${title}</b> <i>${albums.length}</i></h2>
      <div class="rail"></div>
    </section>
  `)

  const rail = node.querySelector(".rail")
  for (const album of albums.slice(0, limit)) rail.append(tile(album))
  return node
}
