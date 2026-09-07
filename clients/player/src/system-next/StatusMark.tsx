import "./base.css"
import "./StatusMark.css"
export interface StatusMarkProps {
  readonly label: string
  readonly state: "ready" | "pending" | "active" | "unavailable"
}
export function StatusMark({ label, state }: StatusMarkProps) {
  return <span className="px-status-mark" role="img" aria-label={label} data-state={state} />
}
