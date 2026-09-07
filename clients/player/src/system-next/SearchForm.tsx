import { Action } from "./Action.tsx"
import { Field } from "./Field.tsx"
import "./base.css"
import "./SearchForm.css"
export interface SearchFormProps {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly onSearch?: (query: string) => void
}
export function SearchForm({ id, label, disabled = false, onSearch }: SearchFormProps) {
  return (
    <form
      className="px-search-form"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const query = String(data.get("query") ?? "").trim()
        if (!disabled && query) onSearch?.(query)
      }}
    >
      <Field id={id} name="query" label={label} type="search" disabled={disabled} required />
      <Action label="Search" type="submit" disabled={disabled} />
    </form>
  )
}
