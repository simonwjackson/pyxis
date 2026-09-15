import type { ReactNode } from "react"
import "./base.css"
import "./Action.css"
export interface ActionProps {
  readonly label: string
  readonly children?: ReactNode
  readonly emphasis?: "quiet" | "primary"
  /// A bar-sized action: still a full 44px target, drawn as a label rather than a plate. Used
  /// where the action sits beside something it must not outrank, such as the title of a strip.
  readonly size?: "regular" | "compact"
  readonly disabled?: boolean
  readonly type?: "button" | "submit"
  readonly onClick?: () => void
}
export function Action({
  label,
  children,
  emphasis = "quiet",
  size = "regular",
  disabled = false,
  type = "button",
  onClick,
}: ActionProps) {
  return (
    <button
      className="px-action"
      data-emphasis={emphasis}
      data-size={size}
      type={type}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  )
}
