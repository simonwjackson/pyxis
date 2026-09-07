import { Action } from "./Action.tsx"
export const name = "Action"

export default function ActionPart() {
  return <Action label="Play" emphasis="primary" disabled={false} />
}
