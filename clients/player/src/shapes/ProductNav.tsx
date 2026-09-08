import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { NavBar } from "../system-next/NavBar.tsx"
export interface ProductNavProps {
  readonly current: "stacks" | "discovery" | "search" | "history"
  readonly accountName: string
  readonly waiting?: number
  readonly onOpenAccount?: () => void
}
// The four places worth a permanent slot, and the one control that is about you rather than
// about music.
//
// Rooms is deliberately not here. It is consulted rarely and reached from the player's room
// control, and the slot is worth more to Search. Settings is not here either: everything that
// is configuration hangs off the account control, because four destinations is what the bottom
// of a phone can hold without lying about their relative importance.
//
// Discovery carries a count only when something is waiting in it. The count is handed over
// as it is, including zero: whether a zero is worth drawing is the nav bar's decision, and
// guarding it here as well would state the same rule in two files, where the two can drift
// and where removing either one silently changes nothing.
export function ProductNav({ current, accountName, waiting = 0, onOpenAccount }: ProductNavProps) {
  return (
    <NavBar
      label="Sections"
      current={current}
      items={[
        { id: "stacks", label: "Stacks", href: "/stacks" },
        { id: "discovery", label: "Discovery", href: "/discovery", count: waiting },
        { id: "search", label: "Search", href: "/search" },
        { id: "history", label: "History", href: "/history" },
      ]}
      trailing={
        <Action
          label={`Account: ${accountName}`}
          {...(onOpenAccount ? { onClick: onOpenAccount } : {})}
        >
          <Avatar
            label={`Account: ${accountName}`}
            initials={accountName.slice(0, 1).toUpperCase()}
            tone="self"
          />
        </Action>
      }
    />
  )
}
