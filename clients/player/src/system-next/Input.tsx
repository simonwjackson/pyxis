import type { ChangeEventHandler } from "react"
import "./base.css"
import "./Input.css"
export interface InputProps {
  readonly id: string
  readonly name?: string
  readonly label: string
  readonly type?: "text" | "search" | "password"
  readonly value?: string
  readonly defaultValue?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly describedBy?: string
  readonly autoComplete?: string
  readonly required?: boolean
  readonly onChange?: ChangeEventHandler<HTMLInputElement>
}
export function Input({
  id,
  name,
  label,
  type = "text",
  value,
  defaultValue,
  disabled = false,
  invalid = false,
  describedBy,
  autoComplete,
  required = false,
  onChange,
}: InputProps) {
  return (
    <input
      className="px-input"
      id={id}
      name={name}
      aria-label={label}
      type={type}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      autoComplete={autoComplete}
      required={required}
      onChange={onChange}
    />
  )
}
