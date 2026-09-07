// Persistent playback presence, and the player it expands into.
//
// The bar is permanent, which makes "nothing playing" a designed state rather than an
// absence: it keeps its footprint so nothing below it moves, drops to a resting form, and
// offers the one action that resolves it.

import { duration, element, escape, runtime, sleeve, tintFrom } from "./common.js"
import { icon } from "./icons.js"
import { liveRoom, makeRooms, openRooms, playingCount } from "./rooms.js"

export function currentSession(library, state = "live") {
  const rooms = makeRooms(library, state)
  const room = liveRoom(rooms)
  if (!room?.album) return null
  const played = library.filter((album) => album.playCount > 0)
  return {
    album: room.album,
    room: room.name,
    rooms,
    others: playingCount(rooms) - 1,
    trackIndex: Math.min(2, room.album.tracks.length - 1),
    next: played[(38 * 37) % played.length],
  }
}

function lastPlayed(library) {
  return [...library]
    .filter((album) => album.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0]
}

export function mountNowPlaying(library, { state = "live" } = {}) {
  let session = currentSession(library, state)
  let playing = true
  const holder = element(`<div class="js-nowbar-holder"></div>`)
  document.body.append(holder)
  document.body.classList.add("has-nowbar")

  // Surfaces ask the bar to play something; the bar owns what is playing. One album sheet
  // and one search result and one history row all need the same verb, and none of them
  // should have to know how a session is shaped.
  document.addEventListener("pyxis:play", (event) => {
    const album = event.detail?.album
    if (!album) return
    const rooms = session?.rooms ?? makeRooms(library, state)
    const room = liveRoom(rooms) ?? rooms.find((entry) => entry.reachable) ?? rooms[0]
    if (room) {
      room.album = album
      room.playing = true
      room.touchedAt = Date.now()
    }
    const played = library.filter((entry) => entry.playCount > 0 && entry.id !== album.id)
    session = {
      album,
      room: room?.name ?? "This phone",
      rooms,
      others: playingCount(rooms) - 1,
      trackIndex: 0,
      next: played[(38 * 37) % Math.max(1, played.length)] ?? album,
    }
    playing = true
    draw()
  })

  function resting() {
    const resume = lastPlayed(library)
    const bar = element(`
      <div class="nowbar resting">
        <span class="nowbar-slot"></span>
        <span class="nowbar-text">
          <b>Nothing playing</b>
          <span class="truncate-1">${
            resume ? `Last played ${escape(resume.title)}` : "Add an album to get started"
          }</span>
        </span>
        ${resume ? `<button class="act inline">Resume</button>` : ""}
      </div>
    `)
    bar.querySelector("button")?.addEventListener("click", () => {
      session = {
        album: resume,
        room: "Kitchen",
        trackIndex: 0,
        next: library.find((album) => album.id !== resume.id) ?? resume,
      }
      playing = true
      draw()
    })
    return bar
  }

  function active() {
    const { album, room, rooms, others, trackIndex, next } = session
    const track = album.tracks[trackIndex]
    // With several rooms live, the bar follows the one you touched last and says so.
    const roomLabel = others > 0 ? `${escape(room)} +${others}` : escape(room)

    const bar = element(`
      <div class="nowbar">
        <button class="nowbar-open" aria-label="Open player">
          <span class="frame object">${sleeve(album)}</span>
          <span class="nowbar-text">
            <b class="truncate-1">${escape(album.title)}</b>
            <span class="truncate-1">${escape(album.artist)}</span>
          </span>
        </button>
        <button class="nowbar-room" aria-label="Rooms"><i></i>${roomLabel}</button>
        <button class="nowbar-toggle transport" aria-label="Pause"></button>
      </div>
    `)

    // The sheet: one large thing and everything else stepping back from it. The cover is an
    // object with an edge and a shadow, sitting in a pool of its own colour; the type does
    // hierarchy by size and weight, and nothing here is uppercase.
    const sheet = element(`
      <dialog class="player">
        <div class="player-head">
          <button class="player-close transport" aria-label="Close player">${icon.down}</button>
          <button class="player-room"><i></i>${roomLabel}</button>
        </div>
        <div class="player-stage">
          <span class="frame object player-art">${sleeve(album)}</span>
        </div>
        <h2 class="player-title">${escape(album.title)}</h2>
        <p class="player-artist">${escape(album.artist)}<span> · ${album.year ?? "—"} · ${runtime(album)}</span></p>
        <div class="player-bar"><div></div></div>
        <p class="player-position">
          <span class="truncate-1">${escape(track.title)}</span>
          <span>${trackIndex + 1} of ${album.tracks.length}</span>
          <span>1:12 <em>/ ${duration(track.durationMs)}</em></span>
        </p>
        <div class="player-controls">
          <button class="transport" aria-label="Previous track">${icon.prev}</button>
          <button class="transport big js-player-toggle" aria-label="Pause"></button>
          <button class="transport" aria-label="Next track">${icon.next}</button>
        </div>
        <label class="player-volume">
          <span class="transport small">${icon.sound}</span>
          <input type="range" value="62" aria-label="Volume" />
        </label>
        <div class="player-ends"></div>
      </dialog>
    `)

    const paint = () => {
      const state = playing ? icon.pause : icon.play
      const label = playing ? "Pause" : "Play"
      for (const toggle of [bar.querySelector(".nowbar-toggle"), sheet.querySelector(".js-player-toggle")]) {
        toggle.innerHTML = state
        toggle.setAttribute("aria-label", label)
      }
      bar.classList.toggle("paused", !playing)
    }

    // Colour from the cover, once it has arrived. The bar and the sheet share one album, so
    // they share one tint; when the cover cannot be read the properties are simply absent and
    // the stylesheet's fallbacks apply.
    const art = sheet.querySelector(".player-art img")
    const tint = () => {
      if (!art || !art.complete || art.naturalWidth === 0) return
      tintFrom(sheet, art)
      tintFrom(bar, art)
    }
    if (art) {
      art.loading = "eager"
      // Tint when the cover arrives, and again when the sheet is opened: the cover may have
      // been decoded before this handler attached, and `complete` alone does not say so.
      art.addEventListener("load", tint, { once: true })
      if (art.complete) art.decode().then(tint, () => {})
    }
    const flip = () => {
      playing = !playing
      paint()
    }

    // An album ending is an album ending. Playing something you did not choose is the habit
    // this product exists not to have, so silence is the default and continuing is a tap.
    // The choice is stated before the end arrives, because a decision offered during the last
    // fade is a decision made by whoever is nearest the phone.
    const ends = sheet.querySelector(".player-ends")
    let following = null

    const paintEnds = () => {
      ends.innerHTML = ""
      if (!following) {
        ends.append(
          element(`
            <p class="player-then">
              <span>When this ends, silence.</span>
              <button class="quiet-link">Continue in rotation</button>
            </p>
          `),
        )
        ends.querySelector("button").onclick = () => {
          following = next
          paintEnds()
        }
        return
      }
      ends.append(
        element(`
          <div class="player-next">
            <span class="frame object">${sleeve(following)}</span>
            <span class="t">
              <span>Then</span>
              <b class="truncate-1">${escape(following.title)}</b>
              <span class="truncate-1">${escape(following.artist)}</span>
            </span>
            <button class="quiet-link">Stop after this</button>
          </div>
        `),
      )
      ends.querySelector("button").onclick = () => {
        following = null
        paintEnds()
      }
    }
    paintEnds()

    const showRooms = () => openRooms(rooms, { onChange: () => draw() })
    bar.querySelector(".nowbar-room").onclick = showRooms
    sheet.querySelector(".player-room").onclick = showRooms
    bar.querySelector(".nowbar-toggle").onclick = flip
    sheet.querySelector(".js-player-toggle").onclick = flip
    bar.querySelector(".nowbar-open").onclick = () => {
      sheet.showModal()
      sheet.querySelector(".js-player-toggle").focus({ preventScroll: true })
      tint()
    }
    sheet.querySelector(".player-close").onclick = () => sheet.close()
    paint()

    const wrap = document.createDocumentFragment()
    wrap.append(bar, sheet)
    return wrap
  }

  function draw() {
    session = currentSessionFrom(session)
    holder.innerHTML = ""
    holder.append(session ? active() : resting())
  }

  // After a room move the house has changed, so re-derive which room the bar speaks for.
  function currentSessionFrom(previous) {
    if (!previous?.rooms) return previous
    const room = previous.rooms
      .filter((entry) => entry.album && entry.reachable)
      .sort((a, b) => b.touchedAt - a.touchedAt)[0]
    if (!room) return null
    return {
      ...previous,
      album: room.album,
      room: room.name,
      others: previous.rooms.filter((entry) => entry.playing && entry.reachable).length - 1,
      trackIndex: Math.min(previous.trackIndex, room.album.tracks.length - 1),
    }
  }

  draw()
}
