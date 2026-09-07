import "./components.css"
export interface HeadingProps {
  readonly text: string
  readonly level?: 1 | 2 | 3
  readonly scale?: "section" | "title" | "display"
}
export function Heading({ text, level = 2, scale = "section" }: HeadingProps) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3"
  return (
    <Tag className="px-heading" data-scale={scale}>
      {text}
    </Tag>
  )
}
