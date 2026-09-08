import { Action } from "../system-next/Action.tsx"
import { SurfaceStatus, type SurfaceStatusProps } from "./SurfaceStatus.tsx"

export const name = "Surface status"

/// Defaults to `blocked` because it is the state with the most to get wrong: it has to name
/// a reason and offer a way out without claiming the library is empty.
export default function SurfaceStatusPart(props: Partial<SurfaceStatusProps>) {
  return (
    <SurfaceStatus
      state={props.state ?? "blocked"}
      emptyTitle={props.emptyTitle ?? "No albums yet"}
      emptyMessage={props.emptyMessage ?? "Albums you add to your library will collect here."}
      emptyAction={<Action label="Add music" emphasis="primary" />}
      reason={props.reason ?? "This device is offline."}
      onRetry={() => undefined}
    />
  )
}
