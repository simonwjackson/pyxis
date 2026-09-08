import { Action } from "../system-next/Action.tsx"
import { Avatar } from "../system-next/Avatar.tsx"
import { Panel } from "../system-next/Panel.tsx"
import { Row } from "../system-next/Row.tsx"
import { StatusMark } from "../system-next/StatusMark.tsx"
import type { Source } from "./entities.ts"
export interface SourceListProps {
  readonly sources: readonly Source[]
  readonly onConnect?: (sourceId: string) => void
  readonly onInstall?: (sourceId: string) => void
}
// Where music comes from, what each one needs, and what breaks when one signs out.
//
// A working source gets a mark and no verb. Only the ones asking for something get a button,
// which is what lets the eye find the row that needs attention without reading any of them.
//
// An expired session is stated on the row where the fix is rather than in a banner at the top
// that leaves you to work out which source it meant.
export function SourceList({ sources, onConnect, onInstall }: SourceListProps) {
  return (
    <Panel
      title="Sources"
      count={sources.length}
      note="A source that is signed out keeps its albums in your library, but cannot play them."
    >
      {sources.map((source) => (
        <Row
          key={source.id}
          title={source.name}
          tone={source.status === "expired" ? "danger" : "normal"}
          detail={
            source.status === "expired"
              ? "Session expired — sign in again to keep playing"
              : source.status === "disconnected"
                ? source.detail
                : source.status === "available"
                  ? source.detail
                  : `${source.detail} · ${source.albums} albums`
          }
          leading={<Avatar label={source.name} initials={source.initials} />}
          actions={
            source.status === "connected" ? (
              <StatusMark label="Connected" state="ready" />
            ) : source.status === "available" ? (
              <Action label={`Install ${source.name}`} onClick={() => onInstall?.(source.id)}>
                Install
              </Action>
            ) : (
              <Action
                label={`${source.status === "expired" ? "Reconnect" : "Connect"} ${source.name}`}
                onClick={() => onConnect?.(source.id)}
              >
                {source.status === "expired" ? "Reconnect" : "Connect"}
              </Action>
            )
          }
        />
      ))}
    </Panel>
  )
}
