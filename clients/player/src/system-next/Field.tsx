import { Input, type InputProps } from "./Input.tsx"
import { Text } from "./Text.tsx"
import "./base.css"
import "./Field.css"
export interface FieldProps extends Omit<InputProps, "invalid" | "describedBy"> {
  readonly error?: string
  readonly hint?: string
}
export function Field({ error, hint, ...input }: FieldProps) {
  const description = error ?? hint
  return (
    <div className="px-field">
      <label htmlFor={input.id}>
        <Text text={input.label} size="small" weight="strong" tone="muted" />
      </label>
      <Input
        {...input}
        invalid={Boolean(error)}
        {...(description ? { describedBy: `${input.id}-description` } : {})}
      />
      {description ? (
        <span id={`${input.id}-description`} role={error ? "alert" : undefined}>
          <Text text={description} size="small" tone={error ? "danger" : "muted"} />
        </span>
      ) : null}
    </div>
  )
}
