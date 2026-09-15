import type { ReactNode } from "react"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Bar.css"
export interface BarProps {
  readonly title: string
  readonly detail: string
  readonly leading: ReactNode
  readonly trailing?: ReactNode
  /// How far through the thing in the bar is, drawn as a hairline along the bar's top edge.
  /// A slot rather than a number, because a strip is not the only place a position can be
  /// drawn and the bar should not learn what a track is. Absent when the length is unknown:
  /// a rule at zero claims a definite answer nobody has.
  readonly position?: ReactNode
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
//
// Two things about it are deliberate. The title is drawn at body size rather than the smallest
// step, because on this strip the title is the loudest fact and everything else defers to it.
// And the row stacks rather than answering a narrow container by shortening the title to a
// stub while a readout keeps its width: no width can remove a control, and none should remove
// the name of the thing being played.
export function Bar({
  title,
  detail,
  leading,
  trailing,
  position,
  openLabel,
  tone = "normal",
  onOpen,
}: BarProps) {
  const copy = (
    <>
      {leading}
      {/* Named where it is drawn, so a title too long for the strip is still readable in full
          without opening anything. A readout is allowed to truncate, never to disappear. */}
      <span className="px-bar-copy" title={`${title} — ${detail}`}>
        <Text text={title} weight="strong" />
        <Text text={detail} size="small" tone="muted" />
      </span>
    </>
  )
  return (
    <div className="px-bar" data-tone={tone}>
      {position ? <div className="px-bar-position">{position}</div> : null}
      <div className="px-bar-row">
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
    </div>
  )
}
