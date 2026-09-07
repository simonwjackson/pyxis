import { Badge } from "./Badge.tsx"
import "./components.css"
export interface ChoiceChipProps {
  readonly label: string
  readonly count?: number
  readonly selected?: boolean
  readonly disabled?: boolean
  readonly onClick?: () => void
}
export function ChoiceChip({
  label,
  count,
  selected = false,
  disabled = false,
  onClick,
}: ChoiceChipProps) {
  return (
    <button
      className="px-chip"
      type="button"
      aria-label={count === undefined ? label : `${label} ${count}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {count === undefined ? null : <Badge count={count} />}
    </button>
  )
}
