import { Field } from "./Field.tsx"
export const name = "Field"

export default function FieldPart() {
  return (
    <Field
      id="source-password"
      label="Password"
      type="password"
      error="Password was not accepted."
    />
  )
}
