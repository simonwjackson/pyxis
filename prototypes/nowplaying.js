// Persistent playback presence, and the player it expands into.
//
// The bar is permanent, which makes "nothing playing" a designed state rather than an
// absence: it keeps its footprint so nothing below it moves, drops to a resting form, and
// offers the one action that resolves it.

import { duration, element, escape, runtime, sleeve } from "./common.js"

const SILENT = new Set(["silent", "empty", "nosources"])

export function currentSession(library, state = "live") {
  if (SILENT.has(state)) return null
  const played = library.filter((album) => album.playCount > 0)
  const album = played[37 % played.length]
  if (!album) return null
  return {
    album,
    room: "Kitchen",
    trackIndex: Math.min(2, album.tracks.length - 1),
    next: played[(38 * 37) % played.length],
  }
}

function lastPlayed(library) {
  return [...library]
    .filter((album) => album.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0]
}

export function mountNowPlaying(library, { state = "live", roomsHref = "./c-console.html" } = {}) {
  let session = currentSession(library, state)
  let playing = true
  const holder = element(`<div class="nowbar-holder"></div>`)
  document.body.append(holder)
  document.body.classList.add("has-nowbar")

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
        ${resume ? `<button class="act">Resume</button>` : ""}
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
    const { album, room, trackIndex, next } = session
    const track = album.tracks[trackIndex]

    const bar = element(`
      <div class="nowbar">
        <button class="nowbar-open" aria-label="Open player">
          <span class="frame">${sleeve(album)}</span>
          <span class="nowbar-text">
            <b class="truncate-1">${escape(album.title)}</b>
            <span class="truncate-1">${escape(album.artist)}</span>
          </span>
        </button>
        <span class="nowbar-room"><i></i>${escape(room)}</span>
        <button class="nowbar-toggle" aria-label="Pause">❚❚</button>
      </div>
    `)

    const sheet = element(`
      <dialog class="player">
        <div class="player-head">
          <button class="player-close" aria-label="Close player">Close</button>
          <a class="player-room" href="${roomsHref}"><i></i>${escape(room)}</a>
        </div>
        <span class="frame player-art">${sleeve(album)}</span>
        <h2 class="player-title">${escape(album.title)}</h2>
        <p class="player-artist">${escape(album.artist)} · ${album.year ?? "—"} · ${runtime(album)}</p>
        <p class="player-position">
          ${escape(track.title)} · ${trackIndex + 1} of ${album.tracks.length} · 1:12 / ${duration(track.durationMs)}
        </p>
        <div class="player-bar"><div></div></div>
        <div class="player-controls">
          <button class="act" aria-label="Previous track">◀◀</button>
          <button class="act primary player-toggle">Pause</button>
          <button class="act" aria-label="Next track">▶▶</button>
          <input type="range" value="62" aria-label="Volume" />
        </div>
        <div class="player-next">
          <span class="frame">${sleeve(next)}</span>
          <span class="t">
            <span class="label">Next</span>
            <b class="truncate-1">${escape(next.title)}</b>
            <span class="truncate-1">${escape(next.artist)}</span>
          </span>
        </div>
      </dialog>
    `)

    const paint = () => {
      const toggle = bar.querySelector(".nowbar-toggle")
      toggle.textContent = playing ? "❚❚" : "▶"
      toggle.setAttribute("aria-label", playing ? "Pause" : "Play")
      bar.classList.toggle("paused", !playing)
      sheet.querySelector(".player-toggle").textContent = playing ? "Pause" : "Play"
    }
    const flip = () => {
      playing = !playing
      paint()
    }

    bar.querySelector(".nowbar-toggle").onclick = flip
    sheet.querySelector(".player-toggle").onclick = flip
    bar.querySelector(".nowbar-open").onclick = () => sheet.showModal()
    sheet.querySelector(".player-close").onclick = () => sheet.close()
    paint()

    const wrap = document.createDocumentFragment()
    wrap.append(bar, sheet)
    return wrap
  }

  function draw() {
    holder.innerHTML = ""
    holder.append(session ? active() : resting())
  }

  draw()
}
