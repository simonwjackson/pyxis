import type { CSSProperties, ReactNode } from "react"
import { Heading } from "./Heading.tsx"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Lead.css"
export interface LeadProps {
  readonly title: string
  readonly credit: string
  readonly media: ReactNode
  readonly context?: string
  readonly action?: ReactNode
  readonly tint?: string
}
// One item given the top of a surface. A field of equal covers is a texture, and a texture has
// no lead; this is the thing most worth resuming, so it gets the largest area and its own
// colour. Everything below it is smaller by choice, which is what makes it read as a lead
// rather than as the first of many.
//
// The tint arrives as a prop. Reading colour out of a cover needs pixel access, which is an
// edge concern; a component that samples its own artwork would be deciding something it
// cannot see from here.
export function Lead({ title, credit, media, context, action, tint }: LeadProps) {
  return (
    <section
      className="px-lead"
      {...(tint ? { style: { "--px-tint": tint } as CSSProperties } : {})}
    >
      <div className="px-lead-art">{media}</div>
      <div className="px-lead-say">
        {context ? <Text text={context} size="small" weight="strong" tone="muted" /> : null}
        <Heading text={title} level={1} scale="display" />
        <Text text={credit} weight="strong" tone="muted" />
        {action}
      </div>
    </section>
  )
}
