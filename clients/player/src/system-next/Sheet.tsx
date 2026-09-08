import { type CSSProperties, type ReactNode, useEffect, useRef } from "react"
import { Action } from "./Action.tsx"
import { Heading } from "./Heading.tsx"
import "./base.css"
import "./Sheet.css"
export interface SheetProps {
  readonly title: string
  readonly open: boolean
  readonly children: ReactNode
  readonly dismissLabel?: string
  readonly measure?: "regular" | "wide"
  readonly tint?: string
  readonly onClose: () => void
}
// A modal surface. One decision, several uses: rooms, the player, an album, an account.
//
// This is a real <dialog> driven by showModal() rather than a positioned div, because the
// platform already owns the hard parts and they are hard to get right by hand: the top layer
// so nothing can paint over it, inertness so a screen reader cannot wander into the page
// behind, an Escape binding, and focus returned to whatever opened it. Rebuilding those in
// component code would be writing a worse copy of the browser.
//
// Every route out of the sheet goes through the dialog's own close(), and onClose is raised
// only by the resulting close event. Calling the prop directly from the button as well would
// fire it twice for one dismissal -- once from the click and once from the platform -- and a
// caller counting dismissals would be wrong.
export function Sheet({
  title,
  open,
  children,
  dismissLabel = "Done",
  measure = "regular",
  tint,
  onClose,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  const dismiss = () => ref.current?.close()
  return (
    // The keyboard route out of a modal dialog is Escape, which the platform binds itself and
    // which no handler here can be seen to provide. Adding a key handler to satisfy the rule
    // would duplicate a native binding, and this click exists only to catch the backdrop --
    // a target a keyboard user has no way to hit and therefore no way to miss.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is the native keyboard dismissal.
    <dialog
      className="px-sheet"
      ref={ref}
      data-measure={measure}
      aria-label={title}
      onClose={onClose}
      // The backdrop is the dialog's own box. It can only be the click target when the
      // pointer misses the content, which is why the element carries no padding of its own.
      onClick={(event) => {
        if (event.target === ref.current) dismiss()
      }}
      {...(tint ? { style: { "--px-tint": tint } as CSSProperties } : {})}
    >
      <div className="px-sheet-head">
        <Heading text={title} />
        <Action label={dismissLabel} onClick={dismiss} />
      </div>
      <div className="px-sheet-body">{children}</div>
    </dialog>
  )
}
