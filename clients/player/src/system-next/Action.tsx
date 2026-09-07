import type { ReactNode } from "react"
import "./base.css"
import "./Action.css"
export interface ActionProps {
  readonly label: string
  readonly children?: ReactNode
  readonly emphasis?: "quiet" | "primary"
  readonly disabled?: boolean
  readonly type?: "button" | "submit"
  readonly onClick?: () => void
}
export function Action({
  label,
  children,
  emphasis = "quiet",
  disabled = false,
  type = "button",
  onClick,
}: ActionProps) {
  return (
    <button
      className="px-action"
      data-emphasis={emphasis}
      type={type}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  )
}
