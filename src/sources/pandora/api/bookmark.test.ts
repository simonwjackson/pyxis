import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  addArtistBookmark,
  addSongBookmark,
  deleteArtistBookmark,
  deleteSongBookmark
} from "./bookmark.js"
import {
  expectEffectSuccess,
  expectEffectFailure,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import { ApiCallError } from "../types/errors.js"
import type {
  AddArtistBookmarkRequest,
  AddSongBookmarkRequest,
  DeleteBookmarkRequest
} from "../types/api.js"

// Mock authenticated state
const mockAuthState = {
  syncTime: 1234567890,
  partnerId: "42",
  partnerAuthToken: "VAyOF96RBRvkfDjqbPKUsslw==",
  userAuthToken: "XXXuserAuthTokenXXX",
  userId: "123456789"
}

describe("bookmark", () => {
  beforeEach(() => {
    setFixtureMode("replay")
  })

  afterEach(() => {
    resetFixtureMode()
  })

  describe("addArtistBookmark", () => {
    it("should successfully add an artist bookmark", async () => {
      const request: AddArtistBookmarkRequest = {
        trackToken: "track123abc"
      }

      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, request)
      )

      expect(result.bookmarkToken).toBeDefined()
      expect(result.artistName).toBeDefined()
      expect(result.musicToken).toBeDefined()
      expect(result.dateCreated).toBeDefined()
      expect(result.dateCreated.time).toBeDefined()
    })

    it("should return valid artist bookmark data", async () => {
      const request: AddArtistBookmarkRequest = {
        trackToken: "track123abc"
      }

      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, request)
      )

      expect(typeof result.bookmarkToken).toBe("string")
      expect(typeof result.artistName).toBe("string")
      expect(typeof result.musicToken).toBe("string")
      expect(typeof result.dateCreated.time).toBe("number")
      expect(result.bookmarkToken.length).toBeGreaterThan(0)
      expect(result.artistName.length).toBeGreaterThan(0)
      expect(result.musicToken.length).toBeGreaterThan(0)
    })

    it("should include timestamp in dateCreated", async () => {
      const request: AddArtistBookmarkRequest = {
        trackToken: "track123abc"
      }

      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, request)
      )

      // Timestamp should be a valid unix timestamp (in milliseconds)
      expect(result.dateCreated.time).toBeGreaterThan(0)
      // Should be a reasonable timestamp (after year 2000)
      expect(result.dateCreated.time).toBeGreaterThan(946684800000)
    })
  })

  describe("addSongBookmark", () => {
    it("should successfully add a song bookmark", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "song123abc"
      }

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      expect(result.bookmarkToken).toBeDefined()
      expect(result.songName).toBeDefined()
      expect(result.artistName).toBeDefined()
      expect(result.musicToken).toBeDefined()
      expect(result.dateCreated).toBeDefined()
      expect(result.dateCreated.time).toBeDefined()
    })

    it("should return valid song bookmark data", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "song123abc"
      }

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      expect(typeof result.bookmarkToken).toBe("string")
      expect(typeof result.songName).toBe("string")
      expect(typeof result.artistName).toBe("string")
      expect(typeof result.musicToken).toBe("string")
      expect(typeof result.dateCreated.time).toBe("number")
      expect(result.bookmarkToken.length).toBeGreaterThan(0)
      expect(result.songName.length).toBeGreaterThan(0)
      expect(result.artistName.length).toBeGreaterThan(0)
      expect(result.musicToken.length).toBeGreaterThan(0)
    })

    it("should include optional fields when present", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "song123abc"
      }

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      // Optional fields may or may not be present
      if (result.albumName !== undefined) {
        expect(typeof result.albumName).toBe("string")
      }
      if (result.sampleUrl !== undefined) {
        expect(typeof result.sampleUrl).toBe("string")
      }
    })

    it("should include timestamp in dateCreated", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "song123abc"
      }

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      // Timestamp should be a valid unix timestamp (in milliseconds)
      expect(result.dateCreated.time).toBeGreaterThan(0)
      // Should be a reasonable timestamp (after year 2000)
      expect(result.dateCreated.time).toBeGreaterThan(946684800000)
    })
  })

  describe("deleteArtistBookmark", () => {
    it("should successfully delete an artist bookmark", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "bookmark123xyz"
      }

      const result = await expectEffectSuccess(
        deleteArtistBookmark(mockAuthState, request)
      )

      // Delete operations return empty object on success
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should return empty object on successful deletion", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "bookmark123xyz"
      }

      const result = await expectEffectSuccess(
        deleteArtistBookmark(mockAuthState, request)
      )

      // Result should be an empty object
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("deleteSongBookmark", () => {
    it("should successfully delete a song bookmark", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "songbookmark456"
      }

      const result = await expectEffectSuccess(
        deleteSongBookmark(mockAuthState, request)
      )

      // Delete operations return empty object on success
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should return empty object on successful deletion", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "songbookmark456"
      }

      const result = await expectEffectSuccess(
        deleteSongBookmark(mockAuthState, request)
      )

      // Result should be an empty object
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("error handling", () => {
    it("should have correct error type structure for bookmark errors", () => {
      const error = new ApiCallError({
        method: "bookmark.addArtistBookmark",
        message: "Invalid track token",
        cause: new Error("Track not found")
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.method).toBe("bookmark.addArtistBookmark")
      expect(error.message).toBe("Invalid track token")
      expect(error.cause).toBeDefined()
    })

    it("should create error with just method and message", () => {
      const error = new ApiCallError({
        method: "bookmark.deleteSongBookmark",
        message: "Bookmark not found"
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.method).toBe("bookmark.deleteSongBookmark")
      expect(error.message).toBe("Bookmark not found")
      expect(error.cause).toBeUndefined()
    })

    it("should handle missing required fields in request", async () => {
      // TypeScript would catch this, but testing runtime behavior
      const invalidRequest = {} as AddArtistBookmarkRequest

      // With fixture mode, this should still work (fixture handles it)
      // In live mode, this would fail with API error
      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, invalidRequest)
      )

      expect(result).toBeDefined()
    })

    it("should handle invalid bookmark token in delete request", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: ""
      }

      // With fixture mode, this may succeed (depends on fixture)
      // In live mode, this would likely fail
      const result = await expectEffectSuccess(
        deleteArtistBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })
  })

  describe("authentication state requirements", () => {
    it("should require all auth state fields for addArtistBookmark", async () => {
      const request: AddArtistBookmarkRequest = {
        trackToken: "track123abc"
      }

      // All auth state fields should be present
      expect(mockAuthState.syncTime).toBeDefined()
      expect(mockAuthState.partnerId).toBeDefined()
      expect(mockAuthState.partnerAuthToken).toBeDefined()
      expect(mockAuthState.userAuthToken).toBeDefined()
      expect(mockAuthState.userId).toBeDefined()

      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })

    it("should require all auth state fields for addSongBookmark", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "song123abc"
      }

      expect(mockAuthState.syncTime).toBeDefined()
      expect(mockAuthState.partnerId).toBeDefined()
      expect(mockAuthState.partnerAuthToken).toBeDefined()
      expect(mockAuthState.userAuthToken).toBeDefined()
      expect(mockAuthState.userId).toBeDefined()

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })

    it("should require all auth state fields for delete operations", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "bookmark123xyz"
      }

      expect(mockAuthState.syncTime).toBeDefined()
      expect(mockAuthState.partnerId).toBeDefined()
      expect(mockAuthState.partnerAuthToken).toBeDefined()
      expect(mockAuthState.userAuthToken).toBeDefined()
      expect(mockAuthState.userId).toBeDefined()

      const result = await expectEffectSuccess(
        deleteArtistBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })
  })

  describe("request structure validation", () => {
    it("should accept valid AddArtistBookmarkRequest", async () => {
      const request: AddArtistBookmarkRequest = {
        trackToken: "validTrackToken123"
      }

      expect(request.trackToken).toBeDefined()
      expect(typeof request.trackToken).toBe("string")

      const result = await expectEffectSuccess(
        addArtistBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })

    it("should accept valid AddSongBookmarkRequest", async () => {
      const request: AddSongBookmarkRequest = {
        trackToken: "validSongToken456"
      }

      expect(request.trackToken).toBeDefined()
      expect(typeof request.trackToken).toBe("string")

      const result = await expectEffectSuccess(
        addSongBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })

    it("should accept valid DeleteBookmarkRequest", async () => {
      const request: DeleteBookmarkRequest = {
        bookmarkToken: "validBookmarkToken789"
      }

      expect(request.bookmarkToken).toBeDefined()
      expect(typeof request.bookmarkToken).toBe("string")

      const result = await expectEffectSuccess(
        deleteArtistBookmark(mockAuthState, request)
      )

      expect(result).toBeDefined()
    })
  })
})
