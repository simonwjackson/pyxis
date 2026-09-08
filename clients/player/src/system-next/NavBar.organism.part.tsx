import { Avatar } from "./Avatar.tsx"
import { NavBar } from "./NavBar.tsx"
export const name = "Nav bar"
// Four destinations with one carrying a count, which is the only arrangement worth reviewing:
// it shows the current item, a plain item, and a counted item side by side.
export default function NavBarPart() {
  return (
    <NavBar
      label="Sections"
      current="stacks"
      items={[
        { id: "stacks", label: "Stacks", href: "#stacks" },
        { id: "discovery", label: "Discovery", href: "#discovery", count: 3 },
        { id: "search", label: "Search", href: "#search" },
        { id: "history", label: "History", href: "#history" },
      ]}
      trailing={<Avatar label="Account: Default" initials="D" tone="self" />}
    />
  )
}
