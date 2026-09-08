import type { ReactNode } from "react"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Bar.css"
export interface BarProps {
  readonly title: string
  readonly detail: string
  readonly leading: ReactNode
  readonly trailing?: ReactNode
  readonly openLabel?: string
  readonly tone?: "normal" | "resting"
  readonly onOpen?: () => void
}
// A persistent strip: one thing, what it is, and the controls that act on it.
//
// It does not position itself. A bar that pinned itself to the bottom of the viewport could
// not be reviewed as an object, and where it sits is a decision the surface owns, not the
// component. Leading is drawn as a span rather than a control, because the cover and the
// copy are one tap target and a button inside a button is not a thing.
export function Bar({
  title,
  detail,
  leading,
  trailing,
  openLabel,
  tone = "normal",
  onOpen,
}: BarProps) {
  const copy = (
    <>
      {leading}
      <span className="px-bar-copy">
        <Text text={title} size="small" weight="strong" />
        <Text text={detail} size="small" tone="muted" />
      </span>
    </>
  )
  return (
    <div className="px-bar" data-tone={tone}>
      {onOpen ? (
        <button
          className="px-bar-open"
          type="button"
          aria-label={openLabel ?? title}
          onClick={onOpen}
        >
          {copy}
        </button>
      ) : (
        <div className="px-bar-open">{copy}</div>
      )}
      {trailing ? <div className="px-bar-trailing">{trailing}</div> : null}
    </div>
  )
}
