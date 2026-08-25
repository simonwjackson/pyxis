export interface SoulseekConfig {
  readonly username: string
  readonly password: string
  readonly listenPort: number
  readonly searchTimeoutMs: number
  readonly downloadTimeoutMs: number
  readonly maxFileBytes: number
  readonly maxResults: number
}

export interface TargetFidelity {
  readonly lossless: boolean
  readonly bitrateKbps?: number
  readonly sampleRateHz?: number
}

export interface NetworkFile {
  readonly username: string
  readonly filename: string
  readonly sizeBytes: number
  readonly bitrateKbps?: number
  readonly durationMs?: number
  readonly sampleRateHz?: number
  readonly bitDepth?: number
  readonly freeSlot: boolean
  readonly queueLength: number
}

export interface ParsedPath {
  readonly artist: string
  readonly title: string
  readonly album?: string
  readonly format: string
}

export interface UpgradeSearchCandidate extends ParsedPath {
  readonly username: string
  readonly filename: string
  readonly sizeBytes: number
  readonly durationMs?: number
  readonly advertisedFidelity: TargetFidelity
  readonly freeSlot: boolean
  readonly queueLength: number
}

const AUDIO_FORMATS = new Set(["flac", "wav", "mp3", "m4a", "aac"])
const LOSSLESS_FORMATS = new Set(["flac", "wav"])
const GENERIC_DIRECTORIES = new Set([
  "audio",
  "downloads",
  "flac",
  "lossless",
  "music",
  "mp3",
  "shared",
])

export function parseConfig(value: unknown): SoulseekConfig {
  const record = object(value, "Soulseek config must be an object")
  const allowed = new Set([
    "username",
    "password",
    "listenPort",
    "searchTimeoutMs",
    "downloadTimeoutMs",
    "maxFileBytes",
    "maxResults",
  ])
  const unknown = Object.keys(record).find((key) => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`unknown Soulseek config field '${unknown}'`)
  return {
    username: requiredString(record.username, "username"),
    password: requiredString(record.password, "password"),
    listenPort: integer(record.listenPort, "listenPort", 2234, 1024, 65_535),
    searchTimeoutMs: integer(record.searchTimeoutMs, "searchTimeoutMs", 10_000, 1_000, 25_000),
    downloadTimeoutMs: integer(
      record.downloadTimeoutMs,
      "downloadTimeoutMs",
      2 * 60 * 60_000,
      5_000,
      6 * 60 * 60_000,
    ),
    maxFileBytes: integer(
      record.maxFileBytes,
      "maxFileBytes",
      2 * 1024 * 1024 * 1024,
      1024,
      2 * 1024 * 1024 * 1024,
    ),
    maxResults: integer(record.maxResults, "maxResults", 50, 1, 100),
  }
}

export function searchQuery(artist: string, title: string): string {
  return `${cleanQueryPart(artist)} ${cleanQueryPart(title)}`.trim()
}

export function candidateFromNetwork(
  file: NetworkFile,
  current: TargetFidelity,
  maxFileBytes: number,
): UpgradeSearchCandidate | undefined {
  if (
    file.sizeBytes <= 0 ||
    file.sizeBytes > maxFileBytes ||
    file.queueLength < 0 ||
    !Number.isSafeInteger(file.queueLength)
  ) {
    return undefined
  }
  const parsed = parseSoulseekPath(file.filename)
  if (parsed === undefined) return undefined
  const advertisedFidelity: TargetFidelity = {
    lossless: LOSSLESS_FORMATS.has(parsed.format),
    ...(file.bitrateKbps === undefined ? {} : { bitrateKbps: file.bitrateKbps }),
    ...(file.sampleRateHz === undefined ? {} : { sampleRateHz: file.sampleRateHz }),
  }
  if (!isStrictUpgrade(current, advertisedFidelity)) return undefined
  return {
    ...parsed,
    username: file.username,
    filename: file.filename,
    sizeBytes: file.sizeBytes,
    ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
    advertisedFidelity,
    freeSlot: file.freeSlot,
    queueLength: file.queueLength,
  }
}

export function parseSoulseekPath(value: string): ParsedPath | undefined {
  const normalized = value.replaceAll("\\", "/")
  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const leaf = parts.pop()
  if (leaf === undefined) return undefined
  const extension = leaf.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase()
  if (extension === undefined || !AUDIO_FORMATS.has(extension)) return undefined
  let title = leaf
    .slice(0, -(extension.length + 1))
    .replace(/^\s*\d{1,3}\s*[-.)_]\s*/u, "")
    .trim()
  if (title.length === 0) return undefined

  const meaningful = parts.filter((part) => !GENERIC_DIRECTORIES.has(part.toLowerCase()))
  let artist: string | undefined
  let album: string | undefined
  if (meaningful.length >= 2) {
    album = stripYear(meaningful.at(-1) ?? "")
    artist = meaningful.at(-2)
  } else if (meaningful.length === 1) {
    const combined = splitArtistAlbum(meaningful[0] ?? "")
    artist = combined?.artist
    album = combined?.album
  }
  if (artist === undefined) {
    const split = title.match(/^(.+?)\s+-\s+(.+)$/u)
    if (split !== null) {
      artist = split[1]?.trim()
      title = split[2]?.trim() ?? ""
    }
  }
  if (artist === undefined || artist.trim().length === 0 || title.length === 0) return undefined
  return {
    artist: artist.trim(),
    title,
    ...(album === undefined || album.length === 0 ? {} : { album }),
    format: extension,
  }
}

export function isStrictUpgrade(current: TargetFidelity, candidate: TargetFidelity): boolean {
  return fidelityKey(candidate) > fidelityKey(current)
}

function fidelityKey(value: TargetFidelity): bigint {
  return (
    (value.lossless ? 1n : 0n) * 10_000_000_000_000n +
    BigInt(value.bitrateKbps ?? 0) * 1_000_000n +
    BigInt(value.sampleRateHz ?? 0)
  )
}

function splitArtistAlbum(value: string): { artist: string; album: string } | undefined {
  const match = value.match(/^(.+?)\s+-\s+(?:\d{4}\s+-\s+)?(.+)$/u)
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  return { artist: match[1].trim(), album: stripYear(match[2]) }
}

function stripYear(value: string): string {
  return value
    .replace(/^\s*\d{4}\s*[-.)_]\s*/u, "")
    .replace(/\s*\(\d{4}\)\s*$/u, "")
    .trim()
}

function cleanQueryPart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function integer(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value as number
}
