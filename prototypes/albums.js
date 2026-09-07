// The shared feature layer: units that know what an album is.
//
// Deliberately separate from parts.js, which must survive having the domain removed. These
// cannot — an album tile is about albums — but they are still shared, because "only one page
// uses it" is a statement about today. The row molecule was three copies by the time anyone
// looked.

import { availability, element, escape, sleeve, tintFrom } from "./common.js"

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

// One album, large, at the top of a surface.
//
// A wall of covers at one size is a texture, and a texture has no lead. This is the record on
// the turntable: the thing you are most likely to want, given the largest area on the page and
// its own colour taken from its own art. Everything below it is smaller by choice, which is
// what makes it read as a lead rather than as the first of many.
export function albumLead(album, { context, onOpen, onPlay } = {}) {
  const node = element(`
    <section class="lead">
      <button class="lead-art frame object" aria-label="${escape(album.title)} by ${escape(
        album.artist,
      )}">${sleeve(album)}</button>
      <div class="lead-say">
        <p class="lead-context">${escape(context ?? "")}</p>
        <h1 class="lead-title">${escape(album.title)}</h1>
        <p class="lead-artist">${escape(album.artist)}${
          album.year ? ` \u00b7 ${album.year}` : ""
        }</p>
      </div>
    </section>
  `)

  if (onOpen) node.querySelector(".lead-art").onclick = () => onOpen(album)
  if (onPlay) {
    const play = element(`<button class="act primary lead-play">Play</button>`)
    play.onclick = () => onPlay(album)
    node.querySelector(".lead-say").append(play)
  }

  // The lead carries the album's colour, the same way the player does.
  const art = node.querySelector("img.sleeve")
  if (art) {
    const tint = () => tintFrom(node, art)
    art.loading = "eager"
    art.addEventListener("load", tint, { once: true })
    if (art.complete) art.decode().then(tint, tint)
  }
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
