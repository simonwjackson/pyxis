// Named states the reference pages can be viewed in.
//
// Every state the data layer can reach needs a designed appearance. A reference page has no
// real data layer, so `?state=` forces one. The index links to each.

export const STATES = {
  live: "Live",
  silent: "Nothing playing",
  offline: "Offline",
  multiroom: "Two rooms playing",
  unreachable: "Room unreachable",
  handofffailed: "Handoff failed",
  writefailed: "A change was not saved",
  empty: "Empty library",
  nosources: "No sources",
  firstrun: "First run",
  authexpired: "Source needs signing in",
  loading: "Loading",
}

export function currentState() {
  const requested = new URLSearchParams(location.search).get("state")
  return requested in STATES ? requested : "live"
}
