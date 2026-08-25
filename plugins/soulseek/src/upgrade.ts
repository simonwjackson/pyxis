import { isAbsolute } from "node:path"
import type { SoulseekConnector, SoulseekNetwork } from "./client"
import { connectSoulseek } from "./client"
import {
  candidateFromNetwork,
  parseConfig,
  type SoulseekConfig,
  searchQuery,
  type TargetFidelity,
  type UpgradeSearchCandidate,
} from "./policy"

const CANDIDATE_TTL_MS = 30 * 60_000
const MAX_CANDIDATE_REFS = 1000

export interface UpgradeTrack {
  readonly id: string
  readonly artist: string
  readonly title: string
  readonly album?: string
  readonly durationMs?: number
  readonly year?: number
}

export interface UpgradeCandidateOutput {
  readonly candidateRef: string
  readonly artist: string
  readonly title: string
  readonly album?: string
  readonly durationMs?: number
  readonly format: string
  readonly advertisedFidelity: TargetFidelity
  readonly sizeBytes: number
  readonly freeSlot: boolean
  readonly queueLength: number
}

interface CandidateLease {
  readonly accountId: string
  readonly username: string
  readonly filename: string
  readonly sizeBytes: number
  readonly expiresAt: number
}

interface ActiveConnection {
  readonly accountId: string
  readonly fingerprint: string
  readonly network: SoulseekNetwork
}

export class SoulseekUpgradeProvider {
  private active: ActiveConnection | undefined
  private readonly candidates = new Map<string, CandidateLease>()

  constructor(
    private readonly connect: SoulseekConnector = connectSoulseek,
    private readonly now: () => number = Date.now,
  ) {}

  async search(
    accountId: string,
    configValue: unknown,
    input: unknown,
  ): Promise<{ candidates: readonly UpgradeCandidateOutput[] }> {
    const config = parseConfig(configValue)
    const request = searchInput(input)
    const network = await this.network(accountId, config)
    let files: Awaited<ReturnType<SoulseekNetwork["search"]>>
    try {
      files = await network.search(
        searchQuery(request.track.artist, request.track.title),
        config.searchTimeoutMs,
      )
    } catch (error) {
      this.invalidate(network)
      throw error
    }
    this.pruneCandidates()
    const limit = Math.min(config.maxResults, request.maxResults)
    const seen = new Set<string>()
    const candidates: UpgradeCandidateOutput[] = []
    for (const file of files) {
      if (candidates.length >= limit || seen.has(`${file.username}\0${file.filename}`)) continue
      seen.add(`${file.username}\0${file.filename}`)
      const candidate = candidateFromNetwork(file, request.currentFidelity, config.maxFileBytes)
      if (candidate === undefined) continue
      const candidateRef = crypto.randomUUID()
      this.candidates.set(candidateRef, {
        accountId,
        username: candidate.username,
        filename: candidate.filename,
        sizeBytes: candidate.sizeBytes,
        expiresAt: this.now() + CANDIDATE_TTL_MS,
      })
      candidates.push(publicCandidate(candidateRef, candidate))
    }
    return { candidates }
  }

  async download(
    accountId: string,
    configValue: unknown,
    input: unknown,
  ): Promise<{ destinationPath: string; bytes: number }> {
    const config = parseConfig(configValue)
    const request = downloadInput(input)
    this.pruneCandidates()
    const lease = this.candidates.get(request.candidateRef)
    this.candidates.delete(request.candidateRef)
    if (lease === undefined || lease.accountId !== accountId || lease.expiresAt <= this.now()) {
      throw new Error("Soulseek candidate reference is unknown or expired")
    }
    if (
      request.expectedBytes !== lease.sizeBytes ||
      request.expectedBytes > request.maxBytes ||
      request.expectedBytes > config.maxFileBytes
    ) {
      throw new Error("Soulseek download bounds do not match the searched candidate")
    }
    const network = await this.network(accountId, config)
    try {
      const bytes = await network.download(
        lease.username,
        lease.filename,
        request.destinationPath,
        {
          expectedBytes: request.expectedBytes,
          maxBytes: Math.min(request.maxBytes, config.maxFileBytes),
          timeoutMs: config.downloadTimeoutMs,
        },
      )
      return { destinationPath: request.destinationPath, bytes }
    } catch (error) {
      this.invalidate(network)
      throw error
    }
  }

  close(): void {
    this.active?.network.close()
    this.active = undefined
    this.candidates.clear()
  }

  private async network(accountId: string, config: SoulseekConfig): Promise<SoulseekNetwork> {
    const fingerprint = JSON.stringify({
      username: config.username,
      password: config.password,
      listenPort: config.listenPort,
    })
    if (this.active?.accountId === accountId && this.active.fingerprint === fingerprint) {
      return this.active.network
    }
    const previous = this.active
    this.active = undefined
    previous?.network.close()
    const network = await this.connect(config)
    this.active = { accountId, fingerprint, network }
    return network
  }

  private invalidate(network: SoulseekNetwork): void {
    if (this.active?.network === network) this.active = undefined
    network.close()
  }

  private pruneCandidates(): void {
    const now = this.now()
    for (const [candidateRef, lease] of this.candidates) {
      if (lease.expiresAt <= now) this.candidates.delete(candidateRef)
    }
    while (this.candidates.size > MAX_CANDIDATE_REFS) {
      const first = this.candidates.keys().next().value as string | undefined
      if (first === undefined) break
      this.candidates.delete(first)
    }
  }
}

function searchInput(value: unknown): {
  track: UpgradeTrack
  currentFidelity: TargetFidelity
  maxResults: number
} {
  const record = object(value, "upgrade.search input must be an object")
  exactKeys(record, ["track", "currentFidelity", "maxResults"])
  const track = object(record.track, "track must be an object")
  exactKeys(track, ["id", "artist", "title", "album", "durationMs", "year"], true)
  const current = fidelity(record.currentFidelity)
  return {
    track: {
      id: requiredString(track.id, "track.id"),
      artist: requiredString(track.artist, "track.artist"),
      title: requiredString(track.title, "track.title"),
      ...optionalString(track.album, "track.album"),
      ...optionalInteger(track.durationMs, "track.durationMs"),
      ...optionalInteger(track.year, "track.year"),
    },
    currentFidelity: current,
    maxResults: positiveInteger(record.maxResults, "maxResults", 100),
  }
}

function downloadInput(value: unknown): {
  candidateRef: string
  destinationPath: string
  expectedBytes: number
  maxBytes: number
} {
  const record = object(value, "upgrade.download input must be an object")
  exactKeys(record, ["candidateRef", "destinationPath", "expectedBytes", "maxBytes"])
  const destinationPath = requiredString(record.destinationPath, "destinationPath")
  if (!isAbsolute(destinationPath) || !destinationPath.endsWith(".partial")) {
    throw new Error("destinationPath must be an absolute core staging path")
  }
  return {
    candidateRef: requiredString(record.candidateRef, "candidateRef"),
    destinationPath,
    expectedBytes: positiveInteger(record.expectedBytes, "expectedBytes", Number.MAX_SAFE_INTEGER),
    maxBytes: positiveInteger(record.maxBytes, "maxBytes", Number.MAX_SAFE_INTEGER),
  }
}

function fidelity(value: unknown): TargetFidelity {
  const record = object(value, "currentFidelity must be an object")
  exactKeys(record, ["lossless", "bitrateKbps", "sampleRateHz"], true)
  if (typeof record.lossless !== "boolean") throw new Error("currentFidelity.lossless is required")
  return {
    lossless: record.lossless,
    ...optionalInteger(record.bitrateKbps, "currentFidelity.bitrateKbps"),
    ...optionalInteger(record.sampleRateHz, "currentFidelity.sampleRateHz"),
  }
}

function publicCandidate(
  candidateRef: string,
  candidate: UpgradeSearchCandidate,
): UpgradeCandidateOutput {
  return {
    candidateRef,
    artist: candidate.artist,
    title: candidate.title,
    ...(candidate.album === undefined ? {} : { album: candidate.album }),
    ...(candidate.durationMs === undefined ? {} : { durationMs: candidate.durationMs }),
    format: candidate.format,
    advertisedFidelity: candidate.advertisedFidelity,
    sizeBytes: candidate.sizeBytes,
    freeSlot: candidate.freeSlot,
    queueLength: candidate.queueLength,
  }
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  optional = false,
): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(record).find((key) => !allowed.has(key))
  if (unknown !== undefined) throw new Error(`unknown field '${unknown}'`)
  if (!optional) {
    const missing = keys.find((key) => !(key in record))
    if (missing !== undefined) throw new Error(`missing field '${missing}'`)
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, name: string): { album?: string } {
  if (value === undefined || value === null) return {}
  return { album: requiredString(value, name) }
}

function optionalInteger(value: unknown, name: string): Record<string, number> {
  if (value === undefined || value === null) return {}
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  const key = name.split(".").at(-1) ?? name
  return { [key]: value as number }
}

function positiveInteger(value: unknown, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new Error(`${name} must be a positive bounded integer`)
  }
  return value as number
}
