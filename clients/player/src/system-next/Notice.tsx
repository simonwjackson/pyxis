import type { ReactNode } from "react"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Notice.css"
export interface NoticeProps {
  readonly message: string
  readonly tone?: "quiet" | "failure"
  readonly actions?: ReactNode
}
export function Notice({ message, tone = "quiet", actions }: NoticeProps) {
  return (
    <div className="px-notice" data-tone={tone} role={tone === "failure" ? "alert" : "status"}>
      <Text text={message} size="small" weight="strong" />
      {actions}
    </div>
  )
}
