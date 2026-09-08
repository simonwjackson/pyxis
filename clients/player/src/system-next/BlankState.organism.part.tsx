import { Action } from "./Action.tsx"
import { BlankState } from "./BlankState.tsx"
export const name = "Blank state"
export default function BlankStatePart() {
  return (
    <BlankState
      title="Nothing here yet"
      message="Connect a source and your albums will appear on this wall."
      actions={
        <>
          <Action label="Add a source" emphasis="primary" />
          <Action label="Import a library" />
        </>
      }
    />
  )
}
