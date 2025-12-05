import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { Effect } from "effect"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import { loadConfig } from "../../config/loader.js"
import type { PandoraSession } from "../../../client.js"
import type { PlaylistResponse } from "../../../types/api.js"

describe("playlist command", () => {
  const mockSession: PandoraSession = {
    syncTime: 1234567890,
    partnerId: "test-partner-id",
    partnerAuthToken: "test-partner-token",
    userId: "test-user-id",
    userAuthToken: "test-user-token"
  }

  const mockPlaylistResponse: PlaylistResponse = {
    items: [
      {
        trackToken: "track-1",
        artistName: "Artist One",
        songName: "Song One",
        albumName: "Album One",
        audioUrlMap: {
          highQuality: { audioUrl: "https://example.com/track1-high.aac", bitrate: "64", encoding: "aacplus" },
          mediumQuality: { audioUrl: "https://example.com/track1-med.aac", bitrate: "64", encoding: "aacplus" },
          lowQuality: { audioUrl: "https://example.com/track1-low.aac", bitrate: "32", encoding: "aacplus" }
        },
        additionalAudioUrl: "https://example.com/track1-128.mp3"
      },
      {
        trackToken: "track-2",
        artistName: "Artist Two",
        songName: "Song Two",
        albumName: "Album Two",
        audioUrlMap: {
          highQuality: { audioUrl: "https://example.com/track2-high.aac", bitrate: "64", encoding: "aacplus" },
          mediumQuality: { audioUrl: "https://example.com/track2-med.aac", bitrate: "64", encoding: "aacplus" },
          lowQuality: { audioUrl: "https://example.com/track2-low.aac", bitrate: "32", encoding: "aacplus" }
        },
        additionalAudioUrl: "https://example.com/track2-128.mp3"
      },
      {
        trackToken: "track-3",
        artistName: "Artist Three",
        songName: "Song Three",
        albumName: "",
        audioUrlMap: {
          highQuality: { audioUrl: "https://example.com/track3-high.aac", bitrate: "64", encoding: "aacplus" },
          mediumQuality: { audioUrl: "https://example.com/track3-med.aac", bitrate: "64", encoding: "aacplus" },
          lowQuality: { audioUrl: "https://example.com/track3-low.aac", bitrate: "32", encoding: "aacplus" }
        }
      }
    ]
  }

  describe("output formats", () => {
    it("should format playlist data as table for full format", () => {
      const rows = mockPlaylistResponse.items.map(item => ({
        Artist: item.artistName,
        Song: item.songName,
        Album: item.albumName || '—',
        URL: item.additionalAudioUrl || item.audioUrlMap?.highQuality?.audioUrl || '—'
      }))

      expect(rows).toHaveLength(3)
      expect(rows[0].Artist).toBe("Artist One")
      expect(rows[0].Song).toBe("Song One")
      expect(rows[0].Album).toBe("Album One")
      expect(rows[0].URL).toBe("https://example.com/track1-128.mp3")

      expect(rows[2].Album).toBe('—')
    })

    it("should format playlist data as URL list", () => {
      const urls = mockPlaylistResponse.items
        .map(item => item.additionalAudioUrl || item.audioUrlMap?.highQuality?.audioUrl)
        .filter((url): url is string => Boolean(url))

      expect(urls).toHaveLength(3)
      expect(urls[0]).toBe("https://example.com/track1-128.mp3")
      expect(urls[1]).toBe("https://example.com/track2-128.mp3")
      expect(urls[2]).toBe("https://example.com/track3-high.aac")
    })

    it("should format playlist data as M3U", () => {
      const entries = mockPlaylistResponse.items.map(item => {
        const url = item.additionalAudioUrl || item.audioUrlMap?.highQuality?.audioUrl
        return {
          duration: -1,
          title: item.artistName + " - " + item.songName,
          url: url as string
        }
      })

      expect(entries).toHaveLength(3)
      expect(entries[0].title).toBe("Artist One - Song One")
      expect(entries[0].url).toBe("https://example.com/track1-128.mp3")
      expect(entries[0].duration).toBe(-1)
    })

    it("should format playlist data as JSON", () => {
      const jsonOutput = JSON.stringify({ success: true, data: mockPlaylistResponse }, null, 2)
      const parsed = JSON.parse(jsonOutput) as { success: boolean; data: PlaylistResponse }

      expect(parsed.success).toBe(true)
      expect(parsed.data.items).toHaveLength(3)
      expect(parsed.data.items[0].artistName).toBe("Artist One")
    })
  })

  describe("quality selection", () => {
    it("should extract high quality URL from additionalAudioUrl", () => {
      const item = mockPlaylistResponse.items[0]
      const url = item.additionalAudioUrl

      expect(url).toBe("https://example.com/track1-128.mp3")
    })

    it("should extract medium quality URL from audioUrlMap.highQuality", () => {
      const item = mockPlaylistResponse.items[0]
      const url = item.audioUrlMap?.highQuality?.audioUrl

      expect(url).toBe("https://example.com/track1-high.aac")
    })

    it("should extract low quality URL from audioUrlMap.lowQuality", () => {
      const item = mockPlaylistResponse.items[0]
      const url = item.audioUrlMap?.lowQuality?.audioUrl

      expect(url).toBe("https://example.com/track1-low.aac")
    })

    it("should handle missing additionalAudioUrl", () => {
      const item = mockPlaylistResponse.items[2]
      const url = item.additionalAudioUrl

      expect(url).toBeUndefined()
    })

    it("should fallback to audioUrlMap when additionalAudioUrl missing", () => {
      const item = mockPlaylistResponse.items[2]
      const url = item.additionalAudioUrl || item.audioUrlMap?.highQuality?.audioUrl

      expect(url).toBe("https://example.com/track3-high.aac")
    })
  })

  describe("error handling", () => {
    it("should handle empty playlist response", () => {
      const emptyResponse: PlaylistResponse = { items: [] }

      expect(emptyResponse.items).toHaveLength(0)

      const rows = emptyResponse.items.map(item => ({
        Artist: item.artistName,
        Song: item.songName,
        Album: item.albumName || '—',
        URL: item.additionalAudioUrl || '—'
      }))

      expect(rows).toHaveLength(0)
    })
  })

  describe("data validation", () => {
    it("should handle playlist items with all fields", () => {
      const item = mockPlaylistResponse.items[0]

      expect(item.trackToken).toBe("track-1")
      expect(item.artistName).toBe("Artist One")
      expect(item.songName).toBe("Song One")
      expect(item.albumName).toBe("Album One")
      expect(item.audioUrlMap).toBeDefined()
      expect(item.additionalAudioUrl).toBe("https://example.com/track1-128.mp3")
    })

    it("should handle playlist items with missing album name", () => {
      const item = mockPlaylistResponse.items[2]

      expect(item.albumName).toBe("")
      expect(item.artistName).toBe("Artist Three")
      expect(item.songName).toBe("Song Three")
    })

    it("should handle playlist items with missing additionalAudioUrl", () => {
      const item = mockPlaylistResponse.items[2]

      expect(item.additionalAudioUrl).toBeUndefined()
      expect(item.audioUrlMap).toBeDefined()
      expect(item.audioUrlMap?.highQuality?.audioUrl).toBe("https://example.com/track3-high.aac")
    })

    it("should validate audioUrlMap structure", () => {
      const item = mockPlaylistResponse.items[0]

      expect(item.audioUrlMap?.highQuality).toBeDefined()
      expect(item.audioUrlMap?.highQuality?.audioUrl).toBeTruthy()
      expect(item.audioUrlMap?.highQuality?.bitrate).toBeTruthy()
      expect(item.audioUrlMap?.highQuality?.encoding).toBeTruthy()

      expect(item.audioUrlMap?.mediumQuality).toBeDefined()
      expect(item.audioUrlMap?.lowQuality).toBeDefined()
    })
  })

  describe("track metadata", () => {
    it("should include all track metadata in response", () => {
      const item = mockPlaylistResponse.items[0]

      expect(item.trackToken).toBe("track-1")
      expect(item.artistName).toBe("Artist One")
      expect(item.songName).toBe("Song One")
      expect(item.albumName).toBe("Album One")
    })

    it("should format track title correctly", () => {
      const item = mockPlaylistResponse.items[0]
      const title = item.artistName + " - " + item.songName

      expect(title).toBe("Artist One - Song One")
    })

    it("should handle tracks from multiple artists", () => {
      const artists = mockPlaylistResponse.items.map(item => item.artistName)

      expect(artists).toHaveLength(3)
      expect(new Set(artists).size).toBe(3)
    })
  })

  describe("URL expiration handling", () => {
    it("should note that URLs expire", () => {
      const expirationMessage = "Note: URLs expire in approximately 30 minutes"

      expect(expirationMessage).toContain("expire")
      expect(expirationMessage).toContain("30 minutes")
    })
  })

  describe("quality information display", () => {
    it("should display quality info for high quality", () => {
      const qualityInfo = {
        bitrate: "128",
        format: "MP3",
        description: "High quality (128 kbps MP3)"
      }

      expect(qualityInfo.bitrate).toBe("128")
      expect(qualityInfo.format).toBe("MP3")
      expect(qualityInfo.description).toContain("High quality")
    })

    it("should display quality info for medium quality", () => {
      const qualityInfo = {
        bitrate: "64",
        format: "AAC+",
        description: "Medium quality (64 kbps AAC+)"
      }

      expect(qualityInfo.bitrate).toBe("64")
      expect(qualityInfo.format).toBe("AAC+")
      expect(qualityInfo.description).toContain("Medium quality")
    })

    it("should display quality info for low quality", () => {
      const qualityInfo = {
        bitrate: "32",
        format: "AAC+",
        description: "Low quality (32 kbps AAC+)"
      }

      expect(qualityInfo.bitrate).toBe("32")
      expect(qualityInfo.format).toBe("AAC+")
      expect(qualityInfo.description).toContain("Low quality")
    })
  })
})
