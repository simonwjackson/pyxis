import type { ReactNode } from "react"
import "./base.css"
import "./Wall.css"
export interface WallProps {
  readonly label: string
  readonly children: ReactNode
}
// A flat field of equal items. It is named as a region rather than a list because the items
// are already buttons: announcing "list, 370 items" over 370 buttons adds a layer to walk
// through without adding a fact. The label carries the count the eye gets from the texture.
export function Wall({ label, children }: WallProps) {
  return (
    <section className="px-wall" aria-label={label}>
      {children}
    </section>
  )
}
