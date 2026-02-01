import { describe, it, expect } from "bun:test"
import {
  getAudioFormat,
  getAudioUrl,
  getQualityInfo,
  isValidQuality,
  QUALITY_INFO,
  DEFAULT_QUALITY
} from "./quality.js"
import type { PlaylistItem } from "./types/api.js"

describe("quality", () => {
  describe("getAudioFormat", () => {
    it("should return HTTP_128_MP3 for high quality", () => {
      expect(getAudioFormat("high")).toBe("HTTP_128_MP3")
    })

    it("should return undefined for medium quality (uses audioUrlMap)", () => {
      expect(getAudioFormat("medium")).toBeUndefined()
    })

    it("should return undefined for low quality (uses audioUrlMap)", () => {
      expect(getAudioFormat("low")).toBeUndefined()
    })
  })

  describe("getAudioUrl", () => {
    const baseItem: PlaylistItem = {
      trackToken: "token123",
      artistName: "Test Artist",
      songName: "Test Song",
      albumName: "Test Album"
    }

    describe("high quality", () => {
      it("should return additionalAudioUrl when string", () => {
        const item: PlaylistItem = {
          ...baseItem,
          additionalAudioUrl: "https://audio.pandora.com/high.mp3"
        }
        expect(getAudioUrl(item, "high")).toBe("https://audio.pandora.com/high.mp3")
      })

      it("should return first element when additionalAudioUrl is array", () => {
        const item: PlaylistItem = {
          ...baseItem,
          additionalAudioUrl: ["https://audio.pandora.com/first.mp3", "https://audio.pandora.com/second.mp3"]
        }
        expect(getAudioUrl(item, "high")).toBe("https://audio.pandora.com/first.mp3")
      })

      it("should fallback to audioUrlMap.highQuality when no additionalAudioUrl", () => {
        const item: PlaylistItem = {
          ...baseItem,
          audioUrlMap: {
            highQuality: { audioUrl: "https://audio.pandora.com/fallback.aac", bitrate: "64", encoding: "aacplus" },
            mediumQuality: { audioUrl: "https://audio.pandora.com/medium.aac", bitrate: "64", encoding: "aacplus" },
            lowQuality: { audioUrl: "https://audio.pandora.com/low.aac", bitrate: "32", encoding: "aacplus" }
          }
        }
        expect(getAudioUrl(item, "high")).toBe("https://audio.pandora.com/fallback.aac")
      })

      it("should return undefined when no audio URLs available", () => {
        expect(getAudioUrl(baseItem, "high")).toBeUndefined()
      })
    })

    describe("medium quality", () => {
      it("should return audioUrlMap.highQuality (64kbps AAC+)", () => {
        const item: PlaylistItem = {
          ...baseItem,
          audioUrlMap: {
            highQuality: { audioUrl: "https://audio.pandora.com/high.aac", bitrate: "64", encoding: "aacplus" },
            mediumQuality: { audioUrl: "https://audio.pandora.com/medium.aac", bitrate: "64", encoding: "aacplus" },
            lowQuality: { audioUrl: "https://audio.pandora.com/low.aac", bitrate: "32", encoding: "aacplus" }
          }
        }
        expect(getAudioUrl(item, "medium")).toBe("https://audio.pandora.com/high.aac")
      })

      it("should return undefined when audioUrlMap missing", () => {
        expect(getAudioUrl(baseItem, "medium")).toBeUndefined()
      })
    })

    describe("low quality", () => {
      it("should return audioUrlMap.lowQuality (32kbps AAC+)", () => {
        const item: PlaylistItem = {
          ...baseItem,
          audioUrlMap: {
            highQuality: { audioUrl: "https://audio.pandora.com/high.aac", bitrate: "64", encoding: "aacplus" },
            mediumQuality: { audioUrl: "https://audio.pandora.com/medium.aac", bitrate: "64", encoding: "aacplus" },
            lowQuality: { audioUrl: "https://audio.pandora.com/low.aac", bitrate: "32", encoding: "aacplus" }
          }
        }
        expect(getAudioUrl(item, "low")).toBe("https://audio.pandora.com/low.aac")
      })

      it("should return undefined when audioUrlMap missing", () => {
        expect(getAudioUrl(baseItem, "low")).toBeUndefined()
      })
    })
  })

  describe("getQualityInfo", () => {
    it("should return correct info for high quality", () => {
      const info = getQualityInfo("high")
      expect(info.bitrate).toBe("128")
      expect(info.format).toBe("MP3")
      expect(info.description).toContain("128 kbps")
    })

    it("should return correct info for medium quality", () => {
      const info = getQualityInfo("medium")
      expect(info.bitrate).toBe("64")
      expect(info.format).toBe("AAC+")
      expect(info.description).toContain("64 kbps")
    })

    it("should return correct info for low quality", () => {
      const info = getQualityInfo("low")
      expect(info.bitrate).toBe("32")
      expect(info.format).toBe("AAC+")
      expect(info.description).toContain("32 kbps")
    })
  })

  describe("isValidQuality", () => {
    it("should return true for valid quality values", () => {
      expect(isValidQuality("low")).toBe(true)
      expect(isValidQuality("medium")).toBe(true)
      expect(isValidQuality("high")).toBe(true)
    })

    it("should return false for invalid quality values", () => {
      expect(isValidQuality("invalid")).toBe(false)
      expect(isValidQuality("")).toBe(false)
      expect(isValidQuality("HIGH")).toBe(false) // case sensitive
      expect(isValidQuality("ultra")).toBe(false)
    })
  })

  describe("constants", () => {
    it("should have correct default quality", () => {
      expect(DEFAULT_QUALITY).toBe("high")
    })

    it("should have all quality levels in QUALITY_INFO", () => {
      expect(Object.keys(QUALITY_INFO)).toEqual(["high", "medium", "low"])
    })
  })
})
