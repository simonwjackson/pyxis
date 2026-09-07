import "./components.css"
export interface BadgeProps {
  readonly count: number
  readonly tone?: "muted" | "signal"
}
export function Badge({ count, tone = "muted" }: BadgeProps) {
  return (
    <span className="px-badge" data-tone={tone}>
      {count}
    </span>
  )
}
