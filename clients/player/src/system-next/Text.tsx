import "./components.css"
export interface TextProps {
  readonly text: string
  readonly tone?: "normal" | "muted" | "danger"
  readonly size?: "small" | "body"
  readonly weight?: "normal" | "strong"
}
export function Text({ text, tone = "normal", size = "body", weight = "normal" }: TextProps) {
  return (
    <span className="px-text" data-tone={tone} data-size={size} data-weight={weight}>
      {text}
    </span>
  )
}
