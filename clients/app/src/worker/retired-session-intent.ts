// This is a current-rewrite outbox update fence, not a public command or a v1 reader.
// A one-shot shuffle cannot safely become shuffle.set: its receipt binds different content.
export const RETIRED_SESSION_INTENT_BLOCKER =
  "Pending current-v2 queue.shuffle intent is retained. Drain it with the matching v2 client and service before upgrading; do not clear storage or reuse its command ID."

export function hasRetiredSessionIntent(value: unknown): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "session.command" ||
    !("command" in value)
  )
    return false
  const command = value.command
  return (
    typeof command === "object" &&
    command !== null &&
    "_tag" in command &&
    command._tag === "queue.shuffle"
  )
}
