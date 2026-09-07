import type { ReactNode } from "react"
import "./base.css"
import "./Flow.css"
export interface FlowProps {
  readonly children: ReactNode
  readonly direction?: "row" | "column"
  readonly gap?: "small" | "regular" | "large"
}
export function Flow({ children, direction = "column", gap = "regular" }: FlowProps) {
  return (
    <div className="px-flow" data-direction={direction} data-gap={gap}>
      {children}
    </div>
  )
}
