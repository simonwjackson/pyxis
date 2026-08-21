import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { PandoraEnvelope, PandoraTransport } from "./api"

interface FixtureOptions {
  readonly mode: "live" | "record" | "replay"
  readonly directory: string
  readonly live: PandoraTransport
}

export function createFixtureTransport(options: FixtureOptions): PandoraTransport {
  const cursors = new Map<string, number>()

  return {
    async request<T>(method: string, url: string, body: string) {
      if (options.mode === "live") return options.live.request<T>(method, url, body)
      const path = join(options.directory, `${safeName(method)}.json`)
      if (options.mode === "replay") {
        const entries = JSON.parse(await readFile(path, "utf8")) as unknown[]
        const cursor = cursors.get(method) ?? 0
        const entry = entries[cursor]
        if (entry === undefined) throw new Error(`fixture ${method} has no response at ${cursor}`)
        cursors.set(method, cursor + 1)
        return entry as PandoraEnvelope<T>
      }

      const response = await options.live.request<T>(method, url, body)
      await mkdir(options.directory, { recursive: true })
      let entries: unknown[] = []
      try {
        entries = JSON.parse(await readFile(path, "utf8")) as unknown[]
      } catch {}
      entries.push(response)
      await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 })
      return response
    },
  }
}

function safeName(method: string): string {
  return method.replaceAll(/[^a-zA-Z0-9.-]/gu, "_")
}
