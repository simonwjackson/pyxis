import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { Link } from "../system-next/Link.tsx"
import { Row } from "../system-next/Row.tsx"
import { Sheet } from "../system-next/Sheet.tsx"
import { Text } from "../system-next/Text.tsx"
import type { Account } from "./entities.ts"
export interface AccountSheetProps {
  readonly accounts: readonly Account[]
  readonly open: boolean
  readonly onClose: () => void
  readonly onSwitch?: (accountId: string) => void
  readonly onAddAccount?: () => void
}
// Whose library this is, and the way into everything that is not listening.
//
// The current account gets a word rather than a button. A control that switches you to where
// you already are is a control that can only disappoint, and its absence is what makes the
// other rows obviously switchable.
//
// Sources and Devices are links, not buttons, because they are places. Add account is a
// button, because it is an act.
export function AccountSheet({
  accounts,
  open,
  onClose,
  onSwitch,
  onAddAccount,
}: AccountSheetProps) {
  return (
    <Sheet title="Account" open={open} onClose={onClose}>
      {accounts.map((account) => (
        <Row
          key={account.id}
          title={account.name}
          detail={`${account.sources} ${account.sources === 1 ? "source" : "sources"} · ${account.albums} albums`}
          leading={
            <Avatar
              label={account.name}
              initials={account.name.slice(0, 1).toUpperCase()}
              tone={account.current ? "self" : "quiet"}
            />
          }
          actions={
            account.current ? (
              <Text text="Current" size="small" tone="muted" weight="strong" />
            ) : (
              <Action label={`Switch to ${account.name}`} onClick={() => onSwitch?.(account.id)}>
                Switch
              </Action>
            )
          }
        />
      ))}
      <Flow direction="row" gap="regular">
        <Link href="/sources" label="Sources" />
        <Link href="/devices" label="Devices" />
        {onAddAccount ? (
          <Action label="Add account" onClick={onAddAccount}>
            Add account
          </Action>
        ) : null}
      </Flow>
    </Sheet>
  )
}
