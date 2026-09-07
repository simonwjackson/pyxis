// Accounts, and the way into everything that is not listening.
//
// Settings gets no navigation slot for the same reason Rooms does not: four destinations is
// what the bottom of a phone can hold honestly, and a person changes account or reconnects a
// source a handful of times ever. It hangs off the account control instead, which is the one
// piece of chrome that is always about "me" rather than about music.

import { element } from "./common.js"

export const ACCOUNTS = [
  { id: "default", name: "Default", sources: 2, albums: 370, current: true },
  { id: "shared", name: "Shared", sources: 1, albums: 24 },
]

export function currentAccount(accounts = ACCOUNTS) {
  return accounts.find((account) => account.current) ?? accounts[0]
}

export function initial(account) {
  return account.name.slice(0, 1).toUpperCase()
}

// The control itself: an initial, not a photograph. There is no person to picture here, and a
// letter says "this is whose library you are looking at" without pretending otherwise.
export function accountControl(accounts = ACCOUNTS, { query = "" } = {}) {
  const account = currentAccount(accounts)
  const button = element(`
    <button class="avatar self tabs-account" aria-label="Account: ${account.name}" title="${account.name}">
      ${initial(account)}
    </button>
  `)
  button.onclick = () => openAccount(accounts, { query })
  return button
}

export function openAddAccount(accounts = ACCOUNTS, { query = "" } = {}) {
  const sheet = element(`
    <dialog class="sheet">
      <div class="sheet-head">
        <span class="label">Add account</span>
        <button class="js-cancel">Cancel</button>
      </div>
      <form method="dialog">
        <label class="field">
          <span>Name</span>
          <input name="name" autocomplete="off" spellcheck="false" />
        </label>
        <p class="prose">A separate library, with its own sources and history. Nothing is
        shared between accounts unless you play it in the same room.</p>
        <div class="field-actions"><button class="act primary" disabled>Add</button></div>
      </form>
    </dialog>
  `)

  const input = sheet.querySelector("input")
  const add = sheet.querySelector(".field-actions button")
  input.addEventListener("input", () => {
    add.disabled = input.value.trim().length === 0
  })
  sheet.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault()
    const name = input.value.trim()
    if (!name) return
    accounts.push({ id: name.toLowerCase(), name, sources: 0, albums: 0 })
    sheet.close()
    openAccount(accounts, { query })
  })

  sheet.querySelector(".js-cancel").onclick = () => sheet.close()
  sheet.addEventListener("close", () => sheet.remove())
  document.body.append(sheet)
  sheet.showModal()
  return sheet
}

export function openAccount(accounts = ACCOUNTS, { query = "" } = {}) {
  const sheet = element(`
    <dialog class="sheet">
      <div class="sheet-head"><span class="label">Account</span><button>Done</button></div>
    </dialog>
  `)

  for (const account of accounts) {
    const row = element(`
      <div class="row">
        <span class="avatar self">${initial(account)}</span>
        <span class="t">
          <b>${account.name}</b>
          <span>${account.sources} ${account.sources === 1 ? "source" : "sources"} · ${
            account.albums
          } albums</span>
        </span>
      </div>
    `)
    row.append(
      account.current
        ? element(`<span class="end meta">Current</span>`)
        : element(`<button class="act inline">Switch</button>`),
    )
    sheet.append(row)
  }

  // Everything that is configuration rather than listening lives behind this one control.
  sheet.append(
    element(`
      <div class="aside settings">
        <a class="act inline" href="./f-sources.html${query}">Sources</a>
        <a class="act inline" href="./g-devices.html${query}">Devices</a>
        <button class="act inline">Add account</button>
      </div>
    `),
  )

  // An account needs a name and nothing else. Sources, devices and history are all per
  // account, so asking for anything more here would be asking before there is a reason.
  sheet.querySelector(".settings button").onclick = () => {
    sheet.close()
    openAddAccount(accounts, { query })
  }

  sheet.querySelector(".sheet-head button").onclick = () => sheet.close()
  sheet.addEventListener("close", () => sheet.remove())
  document.body.append(sheet)
  sheet.showModal()
  return sheet
}
