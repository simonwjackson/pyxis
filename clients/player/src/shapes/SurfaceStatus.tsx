import type { ReactNode } from "react"
import { Action } from "../system-next/Action.tsx"
import { BlankState } from "../system-next/BlankState.tsx"
import { Flow } from "../system-next/Flow.tsx"
import { Notice } from "../system-next/Notice.tsx"
export interface SurfaceStatusProps {
  readonly state: "pending" | "empty" | "blocked"
  /// What this particular emptiness means. First run and a filter that matched nothing look
  /// identical until you read the words, so the surface supplies them.
  readonly emptyTitle: string
  readonly emptyMessage: string
  readonly emptyAction?: ReactNode
  /// Why the data could not be confirmed. Present on `blocked`, and possible on `empty`
  /// when the local answer was nothing and reconciling also failed.
  readonly reason?: string
  readonly onRetry?: () => void
}
// A surface with no content, saying which kind of nothing it is.
//
// The three states are drawn as three different things on purpose, because conflating them
// is the oldest bug in this product: a spinner that says "no albums" tells someone their
// library is empty when it is merely slow, and they go looking for a bug that is not there.
// Waiting is a quiet line, empty is an invitation, and unreadable is a failure with a retry.
export function SurfaceStatus({
  state,
  emptyTitle,
  emptyMessage,
  emptyAction,
  reason,
  onRetry,
}: SurfaceStatusProps) {
  // Waiting is a status, not an emptiness. It gets one quiet line and no offer to act,
  // because there is nothing useful to do until the answer arrives.
  if (state === "pending") return <Notice message="Reading your library" />

  if (state === "empty")
    return (
      <Flow gap="regular">
        <BlankState
          title={emptyTitle}
          message={emptyMessage}
          {...(emptyAction ? { actions: emptyAction } : {})}
        />
        {reason ? <Notice message={reason} /> : null}
      </Flow>
    )

  return (
    <BlankState
      title="This library cannot be read here"
      message={reason ?? "Something stopped this device from reading your library."}
      {...(onRetry
        ? { actions: <Action label="Try again" emphasis="primary" onClick={onRetry} /> }
        : {})}
    />
  )
}
