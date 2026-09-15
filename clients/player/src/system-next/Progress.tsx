import type { NumericRange } from "./numeric-range.ts"
import "./base.css"
import "./Progress.css"
export interface ProgressProps {
  readonly label: string
  readonly percentage: NumericRange<0, 100, 1>
  /// A rule is the same reading drawn as a hairline, for a strip that has no width to spend on
  /// a control. It keeps the semantics of a progress element, so it is still announced.
  readonly size?: "regular" | "rule"
}
export function Progress({ label, percentage, size = "regular" }: ProgressProps) {
  return (
    <progress
      className="px-progress"
      data-size={size}
      aria-label={label}
      value={percentage}
      max={100}
    />
  )
}
