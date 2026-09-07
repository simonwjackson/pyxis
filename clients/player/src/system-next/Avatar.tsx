import "./components.css"
export interface AvatarProps {
  readonly label: string
  readonly initials: string
  readonly tone?: "quiet" | "self"
}
export function Avatar({ label, initials, tone = "quiet" }: AvatarProps) {
  return (
    <span className="px-avatar" role="img" aria-label={label} data-tone={tone}>
      {initials}
    </span>
  )
}
