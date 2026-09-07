import { Icon, type IconProps } from "./Icon.tsx"
import "./components.css"
export interface IconButtonProps {
  readonly label: string
  readonly icon: IconProps["name"]
  readonly emphasis?: "quiet" | "primary"
  readonly disabled?: boolean
  readonly onClick?: () => void
}
export function IconButton({
  label,
  icon,
  emphasis = "quiet",
  disabled = false,
  onClick,
}: IconButtonProps) {
  return (
    <button
      className="px-icon-button"
      data-emphasis={emphasis}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={emphasis === "primary" ? "large" : "regular"} />
    </button>
  )
}
