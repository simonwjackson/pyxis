import { useState } from "react"
import { Action } from "../system-next/Action.tsx"
import { AccountSheet } from "./AccountSheet.tsx"
import { REVIEW_ACCOUNTS } from "./entity-fixtures.ts"
export const name = "Account sheet"
// Two accounts, so the current one and a switchable one are both visible: the difference
// between them is the entire design of this row.
export default function AccountSheetPart() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Action label="Open account" emphasis="primary" onClick={() => setOpen(true)}>
        Open account
      </Action>
      <AccountSheet
        accounts={REVIEW_ACCOUNTS}
        open={open}
        onClose={() => setOpen(false)}
        onSwitch={() => {}}
        onAddAccount={() => {}}
      />
    </>
  )
}
