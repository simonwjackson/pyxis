import type { ReactNode } from "react"
import { Heading } from "./Heading.tsx"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Panel.css"
export interface PanelProps {
  readonly title: string
  readonly count: number
  readonly children: ReactNode
  readonly note?: string
}
// A named vertical group of rows: the shelf's sibling for things that are read one line at a
// time rather than browsed as objects. Sources, devices and accounts are entities with a state
// and a verb, and a cover-sized tile has nowhere to put either.
//
// The note sits under the rows rather than above them, because it explains a consequence of
// the list and is worth nothing until the list has been read.
export function Panel({ title, count, children, note }: PanelProps) {
  return (
    <section className="px-panel" aria-label={`${title}, ${count}`}>
      <div className="px-panel-head">
        <Heading text={title} />
        <Text text={String(count)} size="small" tone="muted" weight="strong" />
      </div>
      <div className="px-panel-rows">{children}</div>
      {note ? <Text text={note} size="small" tone="muted" /> : null}
    </section>
  )
}
