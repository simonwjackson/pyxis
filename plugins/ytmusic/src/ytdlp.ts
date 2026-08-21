import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { join } from "node:path"
import type { RemoteStream, SourceTrack } from "./api"

export class YtDlpError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean) {
    super(message)
    this.name = "YtDlpError"
    this.code = code
    this.retryable = retryable
  }
}

export interface YtDlp {
  check(): Promise<string>
  search(query: string, limit: number): Promise<readonly SourceTrack[]>
  resolveStream(trackId: string): Promise<RemoteStream>
  fetchStream(trackId: string, targetPath: string): Promise<void>
}

export interface YtDlpConfig {
  readonly fallbackBinary?: string
  readonly mutableRoot?: string
  readonly timeoutMs?: number
}

export function createYtDlp(config: YtDlpConfig = {}): YtDlp {
  const fallbackBinary = config.fallbackBinary ?? "yt-dlp"
  // An explicit binary is authoritative and makes tests or operator overrides
  // deterministic. Production (no explicit binary) checks the mutable nightly first.
  const mutableRoot =
    config.mutableRoot ?? (config.fallbackBinary === undefined ? defaultMutableRoot() : undefined)
  const timeoutMs = config.timeoutMs ?? 60_000

  const run = async (args: readonly string[]): Promise<string> => {
    const binary = await selectBinary(fallbackBinary, mutableRoot)
    let process: ReturnType<typeof Bun.spawn>
    try {
      process = Bun.spawn([binary, ...args], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (error) {
      throw new YtDlpError(
        "ytDlp.missing",
        error instanceof Error ? error.message : `could not start ${binary}`,
        false,
      )
    }

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      process.kill()
    }, timeoutMs)
    const stdout = pipeText(process.stdout, "stdout")
    const stderr = pipeText(process.stderr, "stderr")
    const exitCode = await process.exited
    clearTimeout(timeout)
    const [output, errorOutput] = await Promise.all([stdout, stderr])

    if (timedOut) {
      throw new YtDlpError("ytDlp.timeout", `yt-dlp timed out after ${timeoutMs}ms`, true)
    }
    if (exitCode !== 0) {
      throw new YtDlpError(
        "ytDlp.failed",
        `yt-dlp exited with code ${exitCode}: ${errorOutput.trim()}`,
        isRetryableFailure(errorOutput),
      )
    }
    return output.trim()
  }

  return {
    check: () => run(["--version"]),

    async search(query, limit) {
      const output = await run([
        "--dump-json",
        "--flat-playlist",
        "--no-download",
        "--no-warnings",
        `ytsearch${limit}:${query}`,
      ])
      return output
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .flatMap((line) => {
          const value: unknown = JSON.parse(line)
          if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
            return []
          }
          const artist = firstString(value.artist, value.uploader, value.channel) ?? "Unknown"
          const track: SourceTrack = {
            source: "ytmusic",
            externalId: value.id,
            title: value.title,
            artist,
            ...(typeof value.album === "string" && value.album.length > 0
              ? { album: value.album }
              : {}),
            ...(typeof value.duration === "number" && Number.isFinite(value.duration)
              ? { durationMs: Math.round(value.duration * 1000) }
              : {}),
            ...(typeof value.thumbnail === "string" ? { artworkUrl: value.thumbnail } : {}),
          }
          return [track]
        })
    },

    async resolveStream(trackId) {
      const output = await run([
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "--format",
        "bestaudio/best[acodec!=none]",
        `https://music.youtube.com/watch?v=${trackId}`,
      ])
      let value: unknown
      try {
        value = JSON.parse(output)
      } catch (error) {
        throw new YtDlpError(
          "ytDlp.invalidOutput",
          error instanceof Error ? error.message : "yt-dlp output was not JSON",
          true,
        )
      }
      if (!isRecord(value) || typeof value.url !== "string" || value.url.length === 0) {
        throw new YtDlpError("ytDlp.invalidOutput", "yt-dlp output did not contain a URL", true)
      }
      const headers: Record<string, string> = {}
      if (isRecord(value.http_headers)) {
        for (const [name, headerValue] of Object.entries(value.http_headers)) {
          if (typeof headerValue === "string") headers[name] = headerValue
        }
      }
      const ext = typeof value.ext === "string" ? value.ext : undefined
      const codec = typeof value.acodec === "string" ? value.acodec : undefined
      const format = [ext, codec].filter((part) => part !== undefined).join("/") || undefined

      return {
        kind: "remote",
        url: value.url,
        headers,
        ...(format === undefined ? {} : { format }),
        ...(typeof value.abr === "number" ? { bitrateKbps: value.abr } : {}),
        ...(typeof value.asr === "number" ? { sampleRateHz: value.asr } : {}),
        lossless: isLossless(ext, codec),
      }
    },

    async fetchStream(trackId, targetPath) {
      await run([
        "--no-playlist",
        "--no-warnings",
        "--no-part",
        "--no-mtime",
        "--format",
        "bestaudio/best[acodec!=none]",
        "--output",
        targetPath,
        `https://music.youtube.com/watch?v=${trackId}`,
      ])
      const metadata = await stat(targetPath).catch(() => undefined)
      if (metadata === undefined || !metadata.isFile() || metadata.size === 0) {
        throw new YtDlpError(
          "ytDlp.invalidOutput",
          "yt-dlp completed without writing the requested target file",
          true,
        )
      }
    },
  }
}

function pipeText(
  stream: number | ReadableStream<Uint8Array> | undefined,
  name: string,
): Promise<string> {
  if (stream === undefined || typeof stream === "number") {
    throw new YtDlpError("ytDlp.spawn", `yt-dlp ${name} was not piped`, false)
  }
  return new Response(stream).text()
}

async function selectBinary(
  fallbackBinary: string,
  mutableRoot: string | undefined,
): Promise<string> {
  if (process.env.PYXIS_YT_DLP_BIN !== undefined) return process.env.PYXIS_YT_DLP_BIN
  if (mutableRoot !== undefined) {
    const mutable = join(mutableRoot, "yt-dlp")
    try {
      await access(mutable, constants.X_OK)
      return mutable
    } catch {
      // The immutable fallback remains the floor.
    }
  }
  return fallbackBinary
}

function defaultMutableRoot(): string {
  if (process.env.PYXIS_YT_DLP_DATA_DIR !== undefined) return process.env.PYXIS_YT_DLP_DATA_DIR
  const dataHome = process.env.XDG_DATA_HOME ?? join(process.env.HOME ?? ".", ".local", "share")
  return join(dataHome, "pyxis", "yt-dlp")
}

function isRetryableFailure(stderr: string): boolean {
  return /timed out|429|503|temporar|network|connection/i.test(stderr)
}

function isLossless(ext: string | undefined, codec: string | undefined): boolean {
  return [ext, codec].some(
    (value) => value !== undefined && /^(flac|alac|wav|ape|tta)$/i.test(value),
  )
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0) as string | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
