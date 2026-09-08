import type { ReactNode } from "react"
import "./base.css"
import "./AppFrame.css"
export interface AppFrameProps {
  readonly nav: ReactNode
  /// The routed surface. Everything here is replaced on navigation.
  readonly children: ReactNode
  /// Playback presence. Rendered as a sibling of the outlet rather than inside it, which is
  /// the whole reason this template exists: put the bar in the outlet and it is destroyed
  /// and rebuilt on every navigation, taking any playback state with it.
  readonly bar: ReactNode
}
// Where things sit, and nothing else. This template holds no domain vocabulary and makes no
// decision about what is on screen — it decides that the nav stays at the top, the surface
// scrolls between, and the bar is pinned at the bottom without ever moving the surface.
//
// Bar deliberately does not position itself, so that it can be reviewed as an object in
// isolation. This is the file that takes that decision instead.
export function AppFrame({ nav, children, bar }: AppFrameProps) {
  return (
    <div className="px-frame">
      <header className="px-frame-nav">{nav}</header>
      <main className="px-frame-outlet">{children}</main>
      <div className="px-frame-bar">{bar}</div>
    </div>
  )
}
