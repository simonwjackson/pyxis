import { Flow } from "./Flow.tsx"

export const name = "Flow"
export const note =
  "A layout primitive. It wraps children, so it cannot emit a sealed contract and is filed " +
  "as a molecule rather than an atom: the authoring gate reserves 'atom' for primitives the " +
  "Inspector can actually drive. Frost's five stages have no clean slot for pure layout, and " +
  "weakening the seal rule to create one would blunt the check that catches uncontrollable atoms."

export default function FlowPart() {
  return (
    <Flow direction="row" gap="regular">
      Space belongs to the shared system.
    </Flow>
  )
}
