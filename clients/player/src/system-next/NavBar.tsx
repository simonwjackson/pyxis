import type { ReactNode } from "react"
import { Badge } from "./Badge.tsx"
import "./base.css"
import "./NavBar.css"
export interface NavBarItem {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly count?: number
}
export interface NavBarProps {
  readonly label: string
  readonly items: readonly NavBarItem[]
  readonly current: string
  readonly trailing?: ReactNode
}
// Destinations, and one slot at the end for whoever is looking at them.
//
// The links are real anchors, so the destination is visible in the status bar, openable in a
// new tab and reachable without JavaScript having run. A row of buttons calling a router would
// look the same and be none of those things.
//
// A count rides on a destination only when it has one. Rendering a zero would turn "nothing is
// waiting" into a small permanent alarm.
export function NavBar({ label, items, current, trailing }: NavBarProps) {
  return (
    <nav className="px-nav-bar" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.id}
          className="px-nav-bar-link"
          href={item.href}
          {...(item.id === current ? { "aria-current": "page" as const } : {})}
        >
          {item.label}
          {item.count ? <Badge count={item.count} tone="signal" /> : null}
        </a>
      ))}
      {trailing ? <span className="px-nav-bar-trailing">{trailing}</span> : null}
    </nav>
  )
}
