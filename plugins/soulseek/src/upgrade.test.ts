import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SoulseekConnector, SoulseekNetwork } from "./client"
import { SoulseekUpgradeProvider } from "./upgrade"

const config = {
  username: "listener",
  password: "secret",
  downloadTimeoutMs: 5000,
  maxFileBytes: 1024,
}
const searchInput = {
  track: {
    id: "track-1",
    artist: "Boards of Canada",
    title: "Ready Lets Go",
    album: "Geogaddi",
    durationMs: 59_000,
    year: 2002,
  },
  currentFidelity: { lossless: false, bitrateKbps: 128, sampleRateHz: 44_100 },
  maxResults: 10,
}

function fakeNetwork(closed: { value: number }): SoulseekNetwork {
  return {
    search: async () => [
      {
        username: "peer-a",
        filename: "Music/FLAC/Boards of Canada/Geogaddi/01 - Ready Lets Go.flac",
        sizeBytes: 5,
        bitrateKbps: 900,
        durationMs: 59_000,
        sampleRateHz: 44_100,
        bitDepth: 16,
        freeSlot: true,
        queueLength: 0,
      },
    ],
    download: async (_username, _filename, destinationPath) => {
      await writeFile(destinationPath, "audio", { flag: "wx" })
      return 5
    },
    close: () => {
      closed.value += 1
    },
  }
}

describe("Soulseek upgrade provider", () => {
  test("returns opaque refs and consumes one download exactly once", async () => {
    const root = await mkdtemp(join(tmpdir(), "pyxis-soulseek-"))
    const closed = { value: 0 }
    const provider = new SoulseekUpgradeProvider(
      async () => fakeNetwork(closed),
      () => 100,
    )
    try {
      const found = await provider.search("default", config, searchInput)
      expect(found.candidates).toHaveLength(1)
      const candidate = found.candidates[0]
      expect(candidate?.candidateRef).not.toContain("peer-a")
      expect(candidate?.candidateRef).not.toContain("Ready")
      const destinationPath = join(root, "candidate.partial")
      await expect(
        provider.download("default", config, {
          candidateRef: candidate?.candidateRef,
          destinationPath,
          expectedBytes: 5,
          maxBytes: 10_000,
        }),
      ).resolves.toEqual({ destinationPath, bytes: 5 })
      expect(await readFile(destinationPath, "utf8")).toBe("audio")
      await expect(
        provider.download("default", config, {
          candidateRef: candidate?.candidateRef,
          destinationPath: join(root, "second.partial"),
          expectedBytes: 5,
          maxBytes: 100,
        }),
      ).rejects.toThrow("unknown or expired")
    } finally {
      provider.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  test("closes the previous account before opening another", async () => {
    const closed = { value: 0 }
    const connect: SoulseekConnector = async () => fakeNetwork(closed)
    const provider = new SoulseekUpgradeProvider(connect)

    await provider.search("account-a", config, searchInput)
    await provider.search("account-b", config, searchInput)

    expect(closed.value).toBe(1)
    provider.close()
  })

  test("a failed account switch does not reuse the closed previous connection", async () => {
    const closed = { value: 0 }
    let calls = 0
    const provider = new SoulseekUpgradeProvider(async () => {
      calls += 1
      if (calls === 2) throw new Error("login failed")
      return fakeNetwork(closed)
    })

    await provider.search("account-a", config, searchInput)
    await expect(provider.search("account-b", config, searchInput)).rejects.toThrow("login failed")
    await expect(provider.search("account-a", config, searchInput)).resolves.toBeDefined()

    expect(calls).toBe(3)
    expect(closed.value).toBe(1)
    provider.close()
  })

  test("the internal network boundary has no sharing method", () => {
    const network = fakeNetwork({ value: 0 })
    expect(Object.keys(network).sort()).toEqual(["close", "download", "search"])
  })
})
