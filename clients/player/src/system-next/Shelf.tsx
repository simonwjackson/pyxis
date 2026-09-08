import type { ReactNode } from "react"
import { Heading } from "./Heading.tsx"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Shelf.css"
export interface ShelfProps {
  readonly title: string
  readonly count: number
  readonly children: ReactNode
}
// A named run of items with its count. The count is given rather than derived from children,
// because a shelf usually shows fewer items than it has and the honest number is the total.
export function Shelf({ title, count, children }: ShelfProps) {
  return (
    <section className="px-shelf" aria-label={`${title}, ${count}`}>
      <div className="px-shelf-head">
        <Heading text={title} />
        <Text text={String(count)} size="small" tone="muted" weight="strong" />
      </div>
      <div className="px-shelf-rail">{children}</div>
    </section>
  )
}
