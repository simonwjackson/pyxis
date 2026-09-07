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

/// The address bar is the prototype's only real state source, so it is read in exactly one
/// module. Everything else is told. A unit that reads its own state cannot be shown in two
/// states on one screen, which is the whole reason previews exist.
export function currentQuery() {
  return location.search
}

export function isLive() {
  return new URLSearchParams(location.search).get("live") === "1"
}

export function currentState() {
  const requested = new URLSearchParams(location.search).get("state")
  return requested in STATES ? requested : "live"
}
