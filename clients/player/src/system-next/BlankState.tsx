import type { ReactNode } from "react"
import { Heading } from "./Heading.tsx"
import { Text } from "./Text.tsx"
import "./base.css"
import "./BlankState.css"
export interface BlankStateProps {
  readonly title: string
  readonly message: string
  readonly actions?: ReactNode
}
// An empty surface with the way out of it. The recovery is the part that differs between one
// emptiness and another — first run and a filter that matched nothing look identical until
// you read what they offer — so actions are composed by the caller rather than configured.
export function BlankState({ title, message, actions }: BlankStateProps) {
  return (
    <section className="px-blank-state">
      <Heading text={title} />
      <Text text={message} tone="muted" />
      {actions ? <div className="px-blank-state-acts">{actions}</div> : null}
    </section>
  )
}
