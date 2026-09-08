import { useState } from "react"
import { Action } from "../system-next/Action.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { AccountSheet } from "./AccountSheet.tsx"
import type { AccountStanding } from "./entities.ts"
import {
  REVIEW_ACCOUNT_PAIRED,
  REVIEW_ACCOUNT_REFUSED,
  REVIEW_ACCOUNT_UNPAIRED,
} from "./entity-fixtures.ts"
export const name = "Account sheet"
// Three openings rather than one, because the difference between them is the whole design:
// a paired device says who it belongs to and offers nothing, a refused device says why and
// offers the fix, and a device refused for good says why and offers nothing. The last is the
// one worth looking at, since it is the case where the button must be absent.
export default function AccountSheetPart() {
  const [standing, setStanding] = useState<AccountStanding | undefined>(undefined)
  return (
    <>
      <Flow direction="row" gap="small">
        <Action
          label="Open account, paired"
          emphasis="primary"
          onClick={() => setStanding(REVIEW_ACCOUNT_PAIRED)}
        >
          Paired
        </Action>
        <Action
          label="Open account, not paired"
          onClick={() => setStanding(REVIEW_ACCOUNT_UNPAIRED)}
        >
          Not paired
        </Action>
        <Action label="Open account, refused" onClick={() => setStanding(REVIEW_ACCOUNT_REFUSED)}>
          Refused
        </Action>
      </Flow>
      <AccountSheet
        standing={standing ?? REVIEW_ACCOUNT_PAIRED}
        open={standing !== undefined}
        onClose={() => setStanding(undefined)}
        onPair={() => {}}
      />
    </>
  )
}
