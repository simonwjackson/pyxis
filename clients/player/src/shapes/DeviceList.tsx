import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { Panel } from "../system-next/Panel.tsx"
import { Row } from "../system-next/Row.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import { Text } from "../system-next/Text.tsx"
import type { Device } from "./entities.ts"
export interface DeviceListProps {
  readonly devices: readonly Device[]
  readonly onRetry?: (deviceId: string) => void
}
// What can play, and which one you are holding.
//
// The device you are on says so in words rather than wearing a mark, because "this one" is a
// different kind of fact from "reachable" and giving them the same dot would flatten them.
//
// Unreachable is not removed from the list. A speaker that is off is still yours, and hiding
// it would turn a temporary silence into an apparent loss of equipment.
export function DeviceList({ devices, onRetry }: DeviceListProps) {
  return (
    <Panel title="Devices" count={devices.length}>
      {devices.map((device) => (
        <Row
          key={device.id}
          title={device.name}
          detail={device.state === "unreachable" ? `${device.detail} · Unreachable` : device.detail}
          leading={<Avatar label={device.name} initials={device.initials} />}
          actions={
            device.state === "this" ? (
              <Text text="This device" size="small" tone="muted" weight="strong" />
            ) : device.state === "reachable" ? (
              <StatusMark label="Reachable" state="ready" />
            ) : (
              <Action label={`Retry ${device.name}`} onClick={() => onRetry?.(device.id)}>
                Retry
              </Action>
            )
          }
        />
      ))}
    </Panel>
  )
}
