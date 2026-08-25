import { describe, expect, test } from "bun:test"
import { candidateFromNetwork, parseConfig, parseSoulseekPath } from "./policy"

describe("Soulseek no-share policy", () => {
  test("accepts bounded credentials and rejects every unknown field", () => {
    expect(parseConfig({ username: "listener", password: "secret" })).toMatchObject({
      username: "listener",
      listenPort: 2234,
      maxResults: 50,
    })
    expect(() =>
      parseConfig({ username: "listener", password: "secret", sharedFolders: ["/music"] }),
    ).toThrow("unknown Soulseek config field")
  })

  test("parses common paths without borrowing target metadata", () => {
    expect(
      parseSoulseekPath("Music/FLAC/Boards of Canada/Geogaddi/01 - Ready Lets Go.flac"),
    ).toEqual({
      artist: "Boards of Canada",
      album: "Geogaddi",
      title: "Ready Lets Go",
      format: "flac",
    })
    expect(parseSoulseekPath("Autechre - Tri Repetae (1995)/02. Eutow.flac")).toEqual({
      artist: "Autechre",
      album: "Tri Repetae",
      title: "Eutow",
      format: "flac",
    })
    expect(parseSoulseekPath("Unknown Song.flac")).toBeUndefined()
  })

  test("keeps only strict audio-quality improvements", () => {
    const base = {
      username: "peer",
      filename: "Music/Artist/Album/01 - Track.flac",
      sizeBytes: 10_000,
      durationMs: 180_000,
      freeSlot: true,
      queueLength: 0,
    }
    expect(
      candidateFromNetwork(
        { ...base, bitrateKbps: 900, sampleRateHz: 44_100 },
        { lossless: false, bitrateKbps: 320, sampleRateHz: 48_000 },
        1_000_000,
      ),
    ).toMatchObject({ advertisedFidelity: { lossless: true } })
    expect(
      candidateFromNetwork(
        { ...base, filename: "Music/Artist/Album/01 - Track.mp3", bitrateKbps: 128 },
        { lossless: false, bitrateKbps: 320 },
        1_000_000,
      ),
    ).toBeUndefined()
  })
})
