// Keep the position in a provider page when its size exceeds the requested limit.
// Only core ever gives this selector to a client (encrypted and query-bound).
export interface Position {
  readonly offset: number
  readonly token?: string
}
export interface Page<T> {
  readonly items: readonly T[]
  readonly cursor?: string
}
export function position(cursor?: string): Position {
  if (!cursor) return { offset: 0 }
  const pos = JSON.parse(cursor)
  if (
    !Number.isSafeInteger(pos.offset) ||
    pos.offset < 0 ||
    (pos.token !== undefined && typeof pos.token !== "string")
  )
    throw new Error("Invalid page position")
  return pos
}
export function boundedPage<T>(
  rows: readonly T[],
  pos: Position,
  limit: number,
  next?: string,
): Page<T> {
  const end = pos.offset + limit
  const after =
    end < rows.length ? { ...pos, offset: end } : next ? { offset: 0, token: next } : undefined
  return { items: rows.slice(pos.offset, end), ...(after && { cursor: JSON.stringify(after) }) }
}
