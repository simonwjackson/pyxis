import { Action } from "../system-next/Action.tsx"
import { Notice } from "../system-next/Notice.tsx"

export interface UpdateNoticeProps {
  readonly onApply: () => void
}

// A newer Pyxis is being served and this page is still on the old one. The sentence names
// the consequence rather than the mechanism, and the control is the whole remedy: nothing
// here reloads by itself, because that would end a track for the sake of a version number.
export function UpdateNotice({ onApply }: UpdateNoticeProps) {
  return (
    <Notice
      message="A newer Pyxis is ready. Reload when you are between records."
      actions={<Action label="Reload now" emphasis="primary" onClick={onApply} />}
    />
  )
}
