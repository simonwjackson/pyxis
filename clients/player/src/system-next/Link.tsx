import "./base.css"
import "./Link.css"
export interface LinkProps {
  readonly href: string
  readonly label: string
  readonly emphasis?: "quiet" | "plain"
}
// A destination. Separate from Action because the difference is not decoration: this navigates
// and can be opened in a new tab, copied, or followed before scripting has run, and a button
// styled to look like it can do none of those.
//
// NavBar keeps its own anchors rather than composing this, because its links carry a current
// marker and a count beside the text, and an atom sealed to a single string label has nowhere
// to put either.
export function Link({ href, label, emphasis = "quiet" }: LinkProps) {
  return (
    <a className="px-link" href={href} data-emphasis={emphasis}>
      {label}
    </a>
  )
}
