import type { NumericRange } from "./numeric-range.ts"
import "./components.css"
export interface ProgressProps {
  readonly label: string
  readonly percentage: NumericRange<0, 100, 1>
}
export function Progress({ label, percentage }: ProgressProps) {
  return <progress className="px-progress" aria-label={label} value={percentage} max={100} />
}
