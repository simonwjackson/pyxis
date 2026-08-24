// Product navigation.
//
// Stacks is home. Discovery carries a count only when it has something in it. Rooms is
// deliberately absent: it is reached from the player's room control, not from navigation,
// because it is consulted rarely and the slot is worth more to Search and History.

import { element } from "./common.js"

const DESTINATIONS = [
  { id: "stacks", label: "Stacks", href: "./b-shelves.html" },
  { id: "discovery", label: "Discovery", href: "./a-inbox.html" },
  { id: "search", label: "Search", href: "./d-search.html" },
  { id: "history", label: "History", href: "./e-history.html" },
]

export function productNav(current, { waiting = 0 } = {}) {
  const nav = element(`<nav class="tabs"></nav>`)
  const query = location.search
  for (const destination of DESTINATIONS) {
    const badge =
      destination.id === "discovery" && waiting > 0 ? ` <i class="badge">${waiting}</i>` : ""
    nav.append(
      element(`
        <a href="${destination.href}${query}"${
          destination.id === current ? ' aria-current="page"' : ""
        }>${destination.label}${badge}</a>
      `),
    )
  }
  return nav
}
