import { StatusMark } from "./StatusMark.tsx"
export const name = "StatusMark"

export default function StatusMarkPart() {
  return <StatusMark label="Downloaded on this device" state="ready" />
}
