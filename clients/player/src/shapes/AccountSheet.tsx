import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { Notice } from "../system-next/Notice.tsx"
import { Row } from "../system-next/Row.tsx"
import { Sheet } from "../system-next/Sheet.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import type { AccountStanding } from "./entities.ts"
export interface AccountSheetProps {
  readonly standing: AccountStanding
  readonly open: boolean
  readonly onClose: () => void
  // Ask the core for a credential again. Absent when there is nothing worth asking.
  readonly onPair?: () => void
}
// Whose library this is, and whether this device is allowed to read it.
//
// There is one account and no switcher. The core creates a default account on first boot and
// this device claims onto it, so a list would be a list of one and a switch would move you to
// where you already are. When multi-account exists this surface changes; until then it says
// what is true rather than sketching a product that has not been built.
//
// Pairing is the only act here, and it appears only when it could work. A device the core has
// refused for good gets the reason and no button, because a control that cannot succeed spends
// someone's attention teaching them it is useless.
//
// Sources and devices are places, and the approved arrangement hangs them off this control
// rather than giving them navigation slots. They are absent because this client has no route
// for either yet, and a link that silently returns you to Stacks is a worse answer than none.
export function AccountSheet({ standing, open, onClose, onPair }: AccountSheetProps) {
  return (
    <Sheet title="Account" open={open} onClose={onClose}>
      {standing.state === "paired" ? (
        <Row
          title={standing.accountName}
          detail={`This device is ${standing.deviceName}`}
          leading={
            <Avatar
              label={standing.accountName}
              initials={standing.accountName.slice(0, 1).toUpperCase()}
              tone="self"
            />
          }
          actions={<StatusMark label="Paired" state="ready" />}
        />
      ) : (
        <Row
          title={standing.deviceName}
          detail="Not paired with an account"
          leading={
            <Avatar
              label={standing.deviceName}
              initials={standing.deviceName.slice(0, 1).toUpperCase()}
            />
          }
          actions={<StatusMark label="Not paired" state="unavailable" />}
        />
      )}
      {standing.state === "unpaired" ? (
        <Notice
          message={standing.trouble}
          tone="failure"
          actions={
            standing.canRetry && onPair ? (
              <Action label="Pair this device" emphasis="primary" onClick={onPair}>
                Pair this device
              </Action>
            ) : null
          }
        />
      ) : null}
    </Sheet>
  )
}
