// The house.
//
// Rooms is not a destination: it is reached from the player's room control. Its only job is
// the one the bar structurally cannot do — say where the sound is and move it.
//
// When several rooms are playing, the bar follows the room you touched last. That is a
// deliberate trade: one line can only carry one session, and recency is the cheapest
// honest guess.

import { element, escape, sleeve } from "./common.js"

export function makeRooms(library, mode = "live") {
  const played = library.filter((album) => album.playCount > 0)
  const pick = (offset) => played[(offset * 37) % played.length] ?? null
  const silent = mode === "silent" || mode === "empty" || mode === "nosources"

  const rooms = [
    { id: "kitchen", name: "Kitchen", album: null, playing: false, touchedAt: 0, reachable: true },
    { id: "desk", name: "Desk", album: null, playing: false, touchedAt: 0, reachable: true },
    { id: "phone", name: "This phone", album: null, playing: false, touchedAt: 0, reachable: true },
    { id: "living", name: "Living room", album: null, playing: false, touchedAt: 0, reachable: true },
  ]
  const byId = (id) => rooms.find((room) => room.id === id)

  if (!silent) {
    Object.assign(byId("kitchen"), { album: pick(1), playing: true, touchedAt: 2 })
  }
  if (mode === "multiroom") {
    Object.assign(byId("living"), { album: pick(4), playing: true, touchedAt: 3 })
    Object.assign(byId("desk"), { album: pick(6), playing: false, touchedAt: 1 })
  }
  if (mode === "unreachable") {
    Object.assign(byId("kitchen"), { reachable: false })
  }
  return rooms
}

/// The room the bar speaks for: most recently touched among those that are playing.
export function liveRoom(rooms) {
  return (
    [...rooms]
      .filter((room) => room.album && room.reachable)
      .sort((a, b) => b.touchedAt - a.touchedAt)[0] ?? null
  )
}

export function playingCount(rooms) {
  return rooms.filter((room) => room.playing && room.reachable).length
}

export function roomsPanel(rooms, { onChange, moving = null } = {}) {
  const panel = element(`<div class="rooms-panel"></div>`)
  const active = rooms.find((room) => room.album)

  for (const room of rooms) {
    const art = room.album
      ? `<span class="frame">${sleeve(room.album)}</span>`
      : `<span class="blank-slot"></span>`
    const status = !room.reachable
      ? "Unreachable"
      : room.album
        ? `${escape(room.album.title)} — ${escape(room.album.artist)}`
        : "Nothing playing"

    const row = element(`
      <div class="room ${room.reachable ? "" : "gone"}">
        ${art}
        <span class="t">
          <b><span class="dot ${room.playing && room.reachable ? "live" : ""}"></span>${escape(room.name)}</b>
          <span class="truncate-1">${status}</span>
        </span>
      </div>
    `)

    if (moving === room.id) {
      row.append(element(`<span class="pending">Moving…</span>`))
    } else if (!room.reachable) {
      const retry = element(`<button class="act">Retry</button>`)
      retry.onclick = () => onChange?.({ type: "retry", room })
      row.append(retry)
    } else if (!room.album && active) {
      const move = element(`<button class="act">Move here</button>`)
      move.onclick = () => onChange?.({ type: "move", room })
      row.append(move)
    }
    panel.append(row)
  }
  return panel
}

export function openRooms(rooms, { onChange } = {}) {
  const sheet = element(`
    <dialog class="sheet rooms-sheet">
      <div class="sheet-head"><span class="label">Rooms</span><button>Done</button></div>
    </dialog>
  `)
  sheet.querySelector("button").onclick = () => sheet.close()

  const draw = (moving = null) => {
    for (const old of sheet.querySelectorAll(".rooms-panel, .note")) old.remove()
    sheet.append(
      roomsPanel(rooms, {
        moving,
        onChange: (event) => {
          if (event.type === "move") {
            draw(event.room.id)
            setTimeout(() => {
              const from = rooms.find((room) => room.album)
              const album = from?.album ?? null
              for (const room of rooms) {
                if (room.id === event.room.id) {
                  Object.assign(room, { album, playing: true, touchedAt: Date.now() })
                } else {
                  Object.assign(room, { album: null, playing: false })
                }
              }
              draw()
              onChange?.(event)
            }, 900)
            return
          }
          if (event.type === "retry") {
            event.room.reachable = true
            draw()
            onChange?.(event)
          }
        },
      }),
    )
    sheet.append(
      element(
        `<p class="note">Audio plays in one room at a time. Moving it hands the session to that device.</p>`,
      ),
    )
  }

  draw()
  sheet.addEventListener("close", () => sheet.remove())
  document.body.append(sheet)
  sheet.showModal()
  return sheet
}
