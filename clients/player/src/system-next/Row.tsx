import type { ReactNode } from "react"
import { Text } from "./Text.tsx"
import "./components.css"
export interface RowProps {
  readonly title: string
  readonly detail: string
  readonly leading?: ReactNode
  readonly actions?: ReactNode
  readonly tone?: "normal" | "danger"
}
export function Row({ title, detail, leading, actions, tone = "normal" }: RowProps) {
  return (
    <div className="px-row">
      {leading}
      <div className="px-row-copy">
        <Text text={title} weight="strong" />
        <Text text={detail} size="small" tone={tone === "danger" ? "danger" : "muted"} />
      </div>
      {actions ? <div className="px-row-actions">{actions}</div> : null}
    </div>
  )
}
