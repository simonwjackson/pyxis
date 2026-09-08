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
  // Which build this page is running, and whether the server has moved on. Somewhere to
  // look when you wonder whether a change reached you, rather than a permanent banner: the
  // notice already interrupts when it matters, and this answers the question the rest of
  // the time.
  readonly build?: string
  readonly updateAvailable?: boolean
  // Give the app the whole screen, or hand it back. Absent where the browser has no
  // Fullscreen API, so the row is not offered rather than offered and inert.
  readonly onToggleFullscreen?: () => void
  readonly fullscreen?: boolean
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
export function AccountSheet({
  standing,
  open,
  onClose,
  onPair,
  build,
  updateAvailable = false,
  onToggleFullscreen,
  fullscreen = false,
}: AccountSheetProps) {
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
      {onToggleFullscreen === undefined ? null : (
        <Row
          title={fullscreen ? "Full screen" : "Use the whole screen"}
          detail={
            fullscreen
              ? "Covers the system bars until you leave it"
              : "Hides the browser and system bars"
          }
          actions={
            <Action
              label={fullscreen ? "Leave full screen" : "Enter full screen"}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? "Leave" : "Enter"}
            </Action>
          }
        />
      )}
      {build === undefined ? null : (
        <Row
          title={updateAvailable ? "A newer Pyxis is ready" : "Up to date"}
          detail={`Running ${build}`}
          actions={
            <StatusMark
              label={updateAvailable ? "Update ready" : "Current"}
              state={updateAvailable ? "active" : "ready"}
            />
          }
        />
      )}
    </Sheet>
  )
}
