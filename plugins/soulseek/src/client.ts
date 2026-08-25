import { createWriteStream } from "node:fs"
import { rm } from "node:fs/promises"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { SlskClient } from "soulseek-ts"
import type { NetworkFile, SoulseekConfig } from "./policy"

const BITRATE_ATTRIBUTE = 0
const DURATION_ATTRIBUTE = 1
const SAMPLE_RATE_ATTRIBUTE = 4
const BIT_DEPTH_ATTRIBUTE = 5

export interface DownloadLimits {
  readonly expectedBytes: number
  readonly maxBytes: number
  readonly timeoutMs: number
}

export interface SoulseekNetwork {
  search(query: string, timeoutMs: number): Promise<readonly NetworkFile[]>
  download(
    username: string,
    filename: string,
    destinationPath: string,
    limits: DownloadLimits,
  ): Promise<number>
  close(): void
}

export type SoulseekConnector = (config: SoulseekConfig) => Promise<SoulseekNetwork>

export async function connectSoulseek(config: SoulseekConfig): Promise<SoulseekNetwork> {
  const client = new SlskClient({ listenPort: config.listenPort })
  client.on("server-error", () => undefined)
  client.on("listen-error", () => undefined)
  client.on("peer-error", () => undefined)
  client.on("client-error", () => undefined)
  try {
    await client.login(config.username, config.password)
  } catch (error) {
    client.destroy()
    throw error
  }
  return new ProductionSoulseekNetwork(client)
}

class ProductionSoulseekNetwork implements SoulseekNetwork {
  constructor(private readonly client: SlskClient) {}

  async search(query: string, timeoutMs: number): Promise<readonly NetworkFile[]> {
    const responses = await this.client.search(query, { timeout: timeoutMs })
    return responses.flatMap((response) =>
      response.files.flatMap((file) => {
        const sizeBytes = safeBigInt(file.size)
        if (sizeBytes === undefined) return []
        return [
          {
            username: response.username,
            filename: file.filename,
            sizeBytes,
            ...positiveAttribute(file.attrs.get(BITRATE_ATTRIBUTE), "bitrateKbps"),
            ...durationAttribute(file.attrs.get(DURATION_ATTRIBUTE)),
            ...positiveAttribute(file.attrs.get(SAMPLE_RATE_ATTRIBUTE), "sampleRateHz"),
            ...positiveAttribute(file.attrs.get(BIT_DEPTH_ATTRIBUTE), "bitDepth"),
            freeSlot: response.slotsFree,
            queueLength: Math.max(0, response.queueLength),
          },
        ]
      }),
    )
  }

  async download(
    username: string,
    filename: string,
    destinationPath: string,
    limits: DownloadLimits,
  ): Promise<number> {
    const transfer = await this.client.download(username, filename)
    let received = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > limits.maxBytes) {
          callback(new Error("Soulseek download exceeded the byte limit"))
        } else {
          callback(null, chunk)
        }
      },
    })
    const output = createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        pipeline(transfer.stream, limiter, output),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            transfer.stream.destroy(new Error("Soulseek download timed out"))
            reject(new Error("Soulseek download timed out"))
          }, limits.timeoutMs)
        }),
      ])
      if (received !== limits.expectedBytes) {
        throw new Error(
          `Soulseek download wrote ${received} bytes; expected ${limits.expectedBytes}`,
        )
      }
      return received
    } catch (error) {
      output.destroy()
      await rm(destinationPath, { force: true })
      throw error
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  close(): void {
    this.client.destroy()
  }
}

function safeBigInt(value: bigint): number | undefined {
  return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined
}

function positiveAttribute<K extends "bitrateKbps" | "sampleRateHz" | "bitDepth">(
  value: number | undefined,
  key: K,
): Partial<Record<K, number>> {
  return value === undefined || !Number.isSafeInteger(value) || value <= 0
    ? {}
    : ({ [key]: value } as Partial<Record<K, number>>)
}

function durationAttribute(value: number | undefined): { durationMs?: number } {
  return value === undefined || !Number.isFinite(value) || value <= 0
    ? {}
    : { durationMs: Math.round(value * 1000) }
}
