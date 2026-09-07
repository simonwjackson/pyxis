import { Input } from "./Input.tsx"
export const name = "Input"

export default function InputPart() {
  return (
    <Input
      id="account-name"
      label="Account name"
      defaultValue="Default"
      type="text"
      disabled={false}
      invalid={false}
    />
  )
}
