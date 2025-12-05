import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { getPlaylist } from "./station.js"
import {
  expectEffectSuccess,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import type { AuthState } from "./call.js"

describe("station API", () => {
  // Mock auth state for testing
  const mockAuthState: AuthState = {
    syncTime: 0,
    partnerId: "42",
    partnerAuthToken: "VAyOF96RBRvkfDjqbPKUsslw==",
    userId: "123456",
    userAuthToken: "mockUserToken123"
  }

  beforeEach(() => {
    setFixtureMode("replay")
  })

  afterEach(() => {
    resetFixtureMode()
  })

  describe("getPlaylist", () => {
    it("should return playlist items from fixture", async () => {
      const result = await expectEffectSuccess(
        getPlaylist(mockAuthState, { stationToken: "test-station-token" })
      )

      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })

    it("should return playlist items with expected properties", async () => {
      const result = await expectEffectSuccess(
        getPlaylist(mockAuthState, { stationToken: "test-station-token" })
      )

      // Should have at least one item in the fixture
      expect(result.items.length).toBeGreaterThan(0)

      const firstItem = result.items[0]
      expect(firstItem.trackToken).toBeDefined()
      expect(firstItem.songName).toBeDefined()
      expect(firstItem.artistName).toBeDefined()
      expect(firstItem.albumName).toBeDefined()
    })

    it("should include audio URLs in playlist items", async () => {
      const result = await expectEffectSuccess(
        getPlaylist(mockAuthState, { stationToken: "test-station-token" })
      )

      const firstItem = result.items[0]

      // Item should have either audioUrlMap or additionalAudioUrl
      const hasAudioUrls =
        firstItem.audioUrlMap !== undefined ||
        firstItem.additionalAudioUrl !== undefined

      expect(hasAudioUrls).toBe(true)
    })

    it("should handle additionalAudioUrl request parameter", async () => {
      const result = await expectEffectSuccess(
        getPlaylist(mockAuthState, {
          stationToken: "test-station-token",
          additionalAudioUrl: "HTTP_128_MP3"
        })
      )

      expect(result.items).toBeDefined()
      expect(result.items.length).toBeGreaterThan(0)
    })
  })
})
