export type ReleaseType = "album" | "single" | "ep"
export function releaseType(text: readonly string[]): ReleaseType | undefined {
  for (const label of text) {
    const type = label.toLowerCase()
    if (type === "album" || type === "single" || type === "ep") return type
  }
  return undefined
}
