// Sources: what they are, what they need to connect, and what breaks when one signs out.
//
// This is shared rather than owned by the Sources page because a signed-out source is not a
// fact about a settings screen. It is a fact about the album you just tapped, so the wall and
// the album sheet have to be able to ask.

import { element, escape } from "./common.js"

// What a source needs before it can do anything is the plugin's business, not ours. The core
// asks a plugin for a config schema and the plugin answers; an empty answer means it needs
// nothing. Pandora wants an account. YouTube Music wants nothing at all, so asking would be
// theatre — the honest connect flow there is no flow.
export const SOURCES = [
  {
    id: "ytmusic",
    glyph: "YT",
    name: "YouTube Music",
    detail: "Streaming and library",
    fields: [],
    albums: 366,
  },
  {
    id: "pandora",
    glyph: "PA",
    name: "Pandora",
    detail: "Stations, for discovery",
    fields: [
      { key: "username", label: "Email", type: "email" },
      { key: "password", label: "Password", type: "password" },
    ],
    albums: 4,
  },
  {
    id: "soulseek",
    glyph: "SL",
    name: "Soulseek",
    detail: "Library only, never uploads",
    fields: [],
    albums: 0,
    installable: true,
  },
]

// A source is working, working on it, or asking for something. Only the third needs a verb.
export function sourceStates(mode) {
  const firstRun = mode === "firstrun" || mode === "nosources"
  return SOURCES.map((source) => ({
    ...source,
    status: source.installable
      ? "available"
      : firstRun
        ? "disconnected"
        : source.id === "pandora" && mode === "authexpired"
          ? "expired"
          : "connected",
  }))
}

export function expiredSource(mode) {
  return sourceStates(mode).find((source) => source.status === "expired") ?? null
}

// The sheet that asks for credentials, built from the plugin's fields. One field or two, the
// shape is the same; no fields means this never opens.
export function openConnect(source, { onDone } = {}) {
  const sheet = element(`
    <dialog class="sheet js-connect">
      <div class="sheet-head">
        <span class="label">Connect ${escape(source.name)}</span>
        <button class="js-sheet-cancel">Cancel</button>
      </div>
      <form method="dialog"></form>
    </dialog>
  `)
  const form = sheet.querySelector("form")

  for (const field of source.fields) {
    form.append(
      element(`
        <label class="field">
          <span>${escape(field.label)}</span>
          <input name="${field.key}" type="${field.type}" autocomplete="off" spellcheck="false" />
        </label>
      `),
    )
  }

  // Credentials leave the device to be checked and are then stored encrypted. Saying so here
  // costs one line and answers the question a password box always raises.
  form.append(
    element(`
      <p class="field-note">Stored encrypted on this device. Pyxis signs in as you; it never
      re-shares your account.</p>
    `),
  )
  form.append(
    element(`
      <div class="field-actions">
        <button class="act primary" value="save">Connect</button>
      </div>
    `),
  )

  const fail = (message) => {
    form.querySelector(".field-error")?.remove()
    // The wrong password is a fact about the password box, so it is said there and not in a
    // banner at the top that leaves you to work out which field it meant.
    const box = form.querySelector(`[name="password"]`) ?? form.querySelector("input")
    box?.closest(".field")?.classList.add("bad")
    box?.closest(".field")?.after(element(`<p class="field-error trouble">${escape(message)}</p>`))
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const values = new FormData(form)
    const button = form.querySelector("button")
    button.disabled = true
    button.textContent = "Connecting…"

    setTimeout(() => {
      button.disabled = false
      button.textContent = "Connect"
      // Anything but the demo password fails, so the failure is reachable by hand rather than
      // only by argument.
      if (values.get("password") && values.get("password") !== "hunter2") {
        form.querySelector(".field.bad")?.classList.remove("bad")
        fail("That email and password did not work.")
        return
      }
      sheet.close()
      onDone?.()
    }, 900)
  })

  sheet.querySelector(".js-sheet-cancel").onclick = () => sheet.close()
  sheet.addEventListener("close", () => sheet.remove())
  document.body.append(sheet)
  sheet.showModal()
  return sheet
}
