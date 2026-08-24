// Prototype state switcher.
//
// Every state the data layer can be in needs a designed appearance, but a prototype has no
// real data layer to put into those states. `?state=` forces one, and the picker in the
// proto bar makes them all reachable for review.

export const STATES = {
  live: "Live",
  silent: "Nothing playing",
  offline: "Offline",
  empty: "Empty library",
  nosources: "No sources",
  loading: "Loading",
}

export function currentState() {
  const requested = new URLSearchParams(location.search).get("state")
  return requested in STATES ? requested : "live"
}

export function mountStatePicker() {
  const nav = document.querySelector("nav.proto")
  if (!nav) return
  const select = document.createElement("select")
  select.className = "state"
  select.setAttribute("aria-label", "Prototype state")
  for (const [value, label] of Object.entries(STATES)) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    select.append(option)
  }
  select.value = currentState()
  select.onchange = () => {
    const url = new URL(location.href)
    if (select.value === "live") url.searchParams.delete("state")
    else url.searchParams.set("state", select.value)
    location.href = url.toString()
  }
  nav.append(select)
}
