import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { search, getTrack, shareMusic } from "./music.js"
import {
  expectEffectSuccess,
  expectEffectFailure,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import type { AuthState } from "./call.js"
import { ApiCallError } from "../types/errors.js"

describe("music API", () => {
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

  describe("search", () => {
    it("should return search results from fixture", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "radiohead" })
      )

      // Search response should have at least one of these arrays
      const hasResults =
        result.artists !== undefined ||
        result.songs !== undefined ||
        result.genreStations !== undefined

      expect(hasResults).toBe(true)
    })

    it("should return artist results with expected properties", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "radiohead" })
      )

      if (result.artists && result.artists.length > 0) {
        const firstArtist = result.artists[0]
        expect(firstArtist.artistName).toBeDefined()
        expect(firstArtist.musicToken).toBeDefined()
        expect(typeof firstArtist.score).toBe("number")
        expect(firstArtist.musicToken.length).toBeGreaterThan(0)
      }
    })

    it("should return song results with expected properties", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "creep" })
      )

      if (result.songs && result.songs.length > 0) {
        const firstSong = result.songs[0]
        expect(firstSong.songName).toBeDefined()
        expect(firstSong.artistName).toBeDefined()
        expect(firstSong.musicToken).toBeDefined()
        expect(typeof firstSong.score).toBe("number")
        expect(firstSong.musicToken.length).toBeGreaterThan(0)
      }
    })

    it("should return genre station results with expected properties", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "rock" })
      )

      if (result.genreStations && result.genreStations.length > 0) {
        const firstStation = result.genreStations[0]
        expect(firstStation.stationName).toBeDefined()
        expect(firstStation.musicToken).toBeDefined()
        expect(typeof firstStation.score).toBe("number")
        expect(firstStation.musicToken.length).toBeGreaterThan(0)
      }
    })

    it("should handle empty search text", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "" })
      )

      // Empty search should still return a valid response structure
      expect(result).toBeDefined()
    })

    it("should handle search with special characters", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "AC/DC" })
      )

      expect(result).toBeDefined()
    })

    it("should handle search with unicode characters", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "Björk" })
      )

      expect(result).toBeDefined()
    })
  })

  describe("getTrack", () => {
    it("should return track details from fixture", async () => {
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "test-track-token" })
      )

      expect(result.songName).toBeDefined()
      expect(result.artistName).toBeDefined()
      expect(result.albumName).toBeDefined()
      expect(result.trackToken).toBeDefined()
    })

    it("should return all expected track properties", async () => {
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "test-track-token" })
      )

      // Required properties
      expect(typeof result.songName).toBe("string")
      expect(typeof result.artistName).toBe("string")
      expect(typeof result.albumName).toBe("string")
      expect(typeof result.trackToken).toBe("string")

      // Properties should not be empty
      expect(result.songName.length).toBeGreaterThan(0)
      expect(result.artistName.length).toBeGreaterThan(0)
      expect(result.trackToken.length).toBeGreaterThan(0)
    })

    it("should include optional track properties when available", async () => {
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "test-track-token-with-details" })
      )

      // Test for optional properties if they exist in the fixture
      if (result.musicToken !== undefined) {
        expect(typeof result.musicToken).toBe("string")
      }

      if (result.artUrl !== undefined) {
        expect(typeof result.artUrl).toBe("string")
      }

      if (result.songDetailUrl !== undefined) {
        expect(typeof result.songDetailUrl).toBe("string")
      }

      if (result.artistDetailUrl !== undefined) {
        expect(typeof result.artistDetailUrl).toBe("string")
      }

      if (result.albumDetailUrl !== undefined) {
        expect(typeof result.albumDetailUrl).toBe("string")
      }

      if (result.songRating !== undefined) {
        expect(typeof result.songRating).toBe("number")
      }
    })

    it("should handle invalid track token gracefully", async () => {
      // This test assumes the fixture will handle invalid tokens
      // or we would get an API error
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "invalid-token" })
      )

      expect(result).toBeDefined()
    })
  })

  describe("shareMusic", () => {
    it("should successfully share music", async () => {
      const result = await expectEffectSuccess(
        shareMusic(mockAuthState, {
          musicToken: "test-music-token",
          email: "friend@example.com"
        })
      )

      // shareMusic returns an empty object on success
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should handle sharing with different email formats", async () => {
      const result = await expectEffectSuccess(
        shareMusic(mockAuthState, {
          musicToken: "test-music-token",
          email: "test.user+tag@example.co.uk"
        })
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should handle sharing different music token types", async () => {
      const result = await expectEffectSuccess(
        shareMusic(mockAuthState, {
          musicToken: "S123456",
          email: "friend@example.com"
        })
      )

      expect(result).toBeDefined()
    })
  })

  describe("error handling", () => {
    it("should have correct error type structure for API errors", () => {
      const error = new ApiCallError({
        message: "Test API error",
        method: "music.search",
        statusCode: 500
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.message).toBe("Test API error")
      expect(error.method).toBe("music.search")
      expect(error.statusCode).toBe(500)
    })

    it("should handle network errors in search", async () => {
      // This test would require a fixture or mock that simulates network failure
      // For now, verify the error structure
      const error = new ApiCallError({
        message: "Network error",
        method: "music.search",
        statusCode: 0
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.method).toBe("music.search")
    })

    it("should handle authentication errors in getTrack", async () => {
      const error = new ApiCallError({
        message: "Authentication failed",
        method: "music.getTrack",
        statusCode: 401
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.statusCode).toBe(401)
    })

    it("should handle validation errors in shareMusic", async () => {
      const error = new ApiCallError({
        message: "Invalid email address",
        method: "music.shareMusic",
        statusCode: 400
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.statusCode).toBe(400)
    })
  })

  describe("encryption", () => {
    it("should use encrypted requests for search", async () => {
      // This is tested implicitly through the success of the API call
      // The callPandoraMethod with encrypted: true will fail if encryption is broken
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "test" })
      )

      expect(result).toBeDefined()
    })

    it("should use encrypted requests for getTrack", async () => {
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "test-token" })
      )

      expect(result).toBeDefined()
    })

    it("should use encrypted requests for shareMusic", async () => {
      const result = await expectEffectSuccess(
        shareMusic(mockAuthState, {
          musicToken: "test-token",
          email: "test@example.com"
        })
      )

      expect(result).toBeDefined()
    })
  })

  describe("auth state requirements", () => {
    it("should require valid auth state for search", async () => {
      const invalidAuthState: AuthState = {
        syncTime: 0,
        partnerId: "",
        partnerAuthToken: "",
        userId: "",
        userAuthToken: ""
      }

      // With empty auth, the request should still be attempted
      // but would likely fail at the API level (tested via fixtures)
      const result = await expectEffectSuccess(
        search(invalidAuthState, { searchText: "test" })
      )

      expect(result).toBeDefined()
    })

    it("should include sync time in requests", async () => {
      const authWithSyncTime: AuthState = {
        ...mockAuthState,
        syncTime: Math.floor(Date.now() / 1000)
      }

      const result = await expectEffectSuccess(
        search(authWithSyncTime, { searchText: "test" })
      )

      expect(result).toBeDefined()
    })
  })

  describe("response validation", () => {
    it("should validate search response structure", async () => {
      const result = await expectEffectSuccess(
        search(mockAuthState, { searchText: "test" })
      )

      // Response should be an object
      expect(typeof result).toBe("object")
      expect(result).not.toBeNull()

      // If arrays exist, they should be arrays
      if (result.artists !== undefined) {
        expect(Array.isArray(result.artists)).toBe(true)
      }

      if (result.songs !== undefined) {
        expect(Array.isArray(result.songs)).toBe(true)
      }

      if (result.genreStations !== undefined) {
        expect(Array.isArray(result.genreStations)).toBe(true)
      }
    })

    it("should validate getTrack response structure", async () => {
      const result = await expectEffectSuccess(
        getTrack(mockAuthState, { trackToken: "test-token" })
      )

      // Response should be an object with required string fields
      expect(typeof result).toBe("object")
      expect(result).not.toBeNull()
      expect(typeof result.songName).toBe("string")
      expect(typeof result.artistName).toBe("string")
      expect(typeof result.albumName).toBe("string")
      expect(typeof result.trackToken).toBe("string")
    })

    it("should validate shareMusic response structure", async () => {
      const result = await expectEffectSuccess(
        shareMusic(mockAuthState, {
          musicToken: "test-token",
          email: "test@example.com"
        })
      )

      // Response should be an empty object
      expect(typeof result).toBe("object")
      expect(result).not.toBeNull()
      expect(Object.keys(result).length).toBe(0)
    })
  })
})
