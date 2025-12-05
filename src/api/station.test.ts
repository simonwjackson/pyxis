import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  getPlaylist,
  getGenreStations,
  getStation,
  shareStation,
  transformSharedStation,
  addFeedback,
  deleteFeedback,
  createStation,
  deleteStation,
  renameStation,
  addMusic,
  deleteMusic
} from "./station.js"
import {
  expectEffectSuccess,
  expectEffectFailure,
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

  describe("getGenreStations", () => {
    it("should return genre station categories", async () => {
      const result = await expectEffectSuccess(
        getGenreStations(mockAuthState)
      )

      expect(result.categories).toBeDefined()
      expect(Array.isArray(result.categories)).toBe(true)
    })

    it("should return categories with expected properties", async () => {
      const result = await expectEffectSuccess(
        getGenreStations(mockAuthState)
      )

      expect(result.categories.length).toBeGreaterThan(0)

      const firstCategory = result.categories[0]
      expect(firstCategory.categoryName).toBeDefined()
      expect(firstCategory.stations).toBeDefined()
      expect(Array.isArray(firstCategory.stations)).toBe(true)
    })

    it("should return stations with required fields", async () => {
      const result = await expectEffectSuccess(
        getGenreStations(mockAuthState)
      )

      const categoryWithStations = result.categories.find(
        (cat) => cat.stations.length > 0
      )
      expect(categoryWithStations).toBeDefined()

      if (categoryWithStations) {
        const firstStation = categoryWithStations.stations[0]
        expect(firstStation.stationName).toBeDefined()
        expect(firstStation.stationToken).toBeDefined()
        expect(firstStation.stationId).toBeDefined()
      }
    })
  })

  describe("getStation", () => {
    it("should return station details", async () => {
      const result = await expectEffectSuccess(
        getStation(mockAuthState, { stationToken: "test-station-token" })
      )

      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
      expect(result.stationId).toBeDefined()
    })

    it("should include extended attributes when requested", async () => {
      const result = await expectEffectSuccess(
        getStation(mockAuthState, {
          stationToken: "test-station-token",
          includeExtendedAttributes: true
        })
      )

      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
      expect(result.stationId).toBeDefined()
    })

    it("should include music seeds if available", async () => {
      const result = await expectEffectSuccess(
        getStation(mockAuthState, {
          stationToken: "test-station-token",
          includeExtendedAttributes: true
        })
      )

      if (result.music !== undefined) {
        if (result.music.songs !== undefined) {
          expect(Array.isArray(result.music.songs)).toBe(true)
          if (result.music.songs.length > 0) {
            const firstSeed = result.music.songs[0]
            expect(firstSeed.seedId).toBeDefined()
            expect(firstSeed.musicToken).toBeDefined()
          }
        }
        if (result.music.artists !== undefined) {
          expect(Array.isArray(result.music.artists)).toBe(true)
        }
      }
    })

    it("should include feedback if available", async () => {
      const result = await expectEffectSuccess(
        getStation(mockAuthState, {
          stationToken: "test-station-token",
          includeExtendedAttributes: true
        })
      )

      if (result.feedback !== undefined) {
        if (result.feedback.thumbsUp !== undefined) {
          expect(Array.isArray(result.feedback.thumbsUp)).toBe(true)
        }
        if (result.feedback.thumbsDown !== undefined) {
          expect(Array.isArray(result.feedback.thumbsDown)).toBe(true)
        }
      }
    })
  })

  describe("shareStation", () => {
    it("should successfully share station", async () => {
      const result = await expectEffectSuccess(
        shareStation(mockAuthState, {
          stationId: "test-station-id",
          stationToken: "test-station-token",
          emails: ["test@example.com"]
        })
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should handle multiple email addresses", async () => {
      const result = await expectEffectSuccess(
        shareStation(mockAuthState, {
          stationId: "test-station-id",
          stationToken: "test-station-token",
          emails: ["test1@example.com", "test2@example.com"]
        })
      )

      expect(result).toBeDefined()
    })
  })

  describe("transformSharedStation", () => {
    it("should transform shared station to personal station", async () => {
      const result = await expectEffectSuccess(
        transformSharedStation(mockAuthState, {
          stationToken: "shared-station-token"
        })
      )

      expect(result.stationId).toBeDefined()
      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
    })

    it("should return station with all required fields", async () => {
      const result = await expectEffectSuccess(
        transformSharedStation(mockAuthState, {
          stationToken: "shared-station-token"
        })
      )

      expect(typeof result.stationId).toBe("string")
      expect(typeof result.stationToken).toBe("string")
      expect(typeof result.stationName).toBe("string")
    })
  })

  describe("addFeedback", () => {
    it("should add positive feedback", async () => {
      const result = await expectEffectSuccess(
        addFeedback(mockAuthState, {
          stationToken: "test-station-token",
          trackToken: "test-track-token",
          isPositive: true
        })
      )

      expect(result.feedbackId).toBeDefined()
      expect(result.songName).toBeDefined()
      expect(result.artistName).toBeDefined()
      expect(result.isPositive).toBe(true)
      expect(result.dateCreated).toBeDefined()
      expect(result.dateCreated.time).toBeDefined()
    })

    it("should add feedback and return feedbackId", async () => {
      // Note: Fixture returns isPositive: true regardless of input
      // This tests that the API call succeeds and returns expected fields
      const result = await expectEffectSuccess(
        addFeedback(mockAuthState, {
          stationToken: "test-station-token",
          trackToken: "test-track-token",
          isPositive: false
        })
      )

      expect(result.feedbackId).toBeDefined()
      expect(typeof result.isPositive).toBe("boolean")
    })

    it("should return feedback with timestamp", async () => {
      const result = await expectEffectSuccess(
        addFeedback(mockAuthState, {
          stationToken: "test-station-token",
          trackToken: "test-track-token",
          isPositive: true
        })
      )

      expect(typeof result.dateCreated.time).toBe("number")
      expect(result.dateCreated.time).toBeGreaterThan(0)
    })
  })

  describe("deleteFeedback", () => {
    it("should successfully delete feedback", async () => {
      const result = await expectEffectSuccess(
        deleteFeedback(mockAuthState, {
          feedbackId: "test-feedback-id"
        })
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })
  })

  describe("createStation", () => {
    it("should create station from music token", async () => {
      const result = await expectEffectSuccess(
        createStation(mockAuthState, {
          musicToken: "test-music-token"
        })
      )

      expect(result.stationId).toBeDefined()
      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
    })

    it("should create station from track token", async () => {
      const result = await expectEffectSuccess(
        createStation(mockAuthState, {
          trackToken: "test-track-token"
        })
      )

      expect(result.stationId).toBeDefined()
      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
    })

    it("should create station with music type specified", async () => {
      const result = await expectEffectSuccess(
        createStation(mockAuthState, {
          musicToken: "test-music-token",
          musicType: "song"
        })
      )

      expect(result.stationId).toBeDefined()
      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
    })

    it("should create artist station", async () => {
      const result = await expectEffectSuccess(
        createStation(mockAuthState, {
          musicToken: "test-music-token",
          musicType: "artist"
        })
      )

      expect(result.stationId).toBeDefined()
    })
  })

  describe("deleteStation", () => {
    it("should successfully delete station", async () => {
      const result = await expectEffectSuccess(
        deleteStation(mockAuthState, {
          stationToken: "test-station-token"
        })
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })
  })

  describe("renameStation", () => {
    it("should rename station successfully", async () => {
      const newName = "My Renamed Station"
      const result = await expectEffectSuccess(
        renameStation(mockAuthState, {
          stationToken: "test-station-token",
          stationName: newName
        })
      )

      expect(result.stationId).toBeDefined()
      expect(result.stationToken).toBeDefined()
      expect(result.stationName).toBeDefined()
    })

    it("should return updated station info", async () => {
      const result = await expectEffectSuccess(
        renameStation(mockAuthState, {
          stationToken: "test-station-token",
          stationName: "Updated Name"
        })
      )

      expect(typeof result.stationId).toBe("string")
      expect(typeof result.stationToken).toBe("string")
      expect(typeof result.stationName).toBe("string")
    })
  })

  describe("addMusic", () => {
    it("should add music seed to station", async () => {
      const result = await expectEffectSuccess(
        addMusic(mockAuthState, {
          stationToken: "test-station-token",
          musicToken: "test-music-token"
        })
      )

      expect(result.seedId).toBeDefined()
    })

    it("should return seed with artist name for artist seeds", async () => {
      const result = await expectEffectSuccess(
        addMusic(mockAuthState, {
          stationToken: "test-station-token",
          musicToken: "artist-music-token"
        })
      )

      expect(result.seedId).toBeDefined()
      if (result.artistName !== undefined) {
        expect(typeof result.artistName).toBe("string")
      }
    })

    it("should return seed with song name for song seeds", async () => {
      const result = await expectEffectSuccess(
        addMusic(mockAuthState, {
          stationToken: "test-station-token",
          musicToken: "song-music-token"
        })
      )

      expect(result.seedId).toBeDefined()
      if (result.songName !== undefined) {
        expect(typeof result.songName).toBe("string")
      }
    })
  })

  describe("deleteMusic", () => {
    it("should successfully delete music seed", async () => {
      const result = await expectEffectSuccess(
        deleteMusic(mockAuthState, {
          seedId: "test-seed-id"
        })
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })
  })
})
