import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  getStationList,
  getBookmarks,
  getSettings,
  getUsageInfo,
  getStationListChecksum,
  setQuickMix,
  changeSettings,
  setExplicitContentFilter,
  sleepSong
} from "./user.js"
import {
  expectEffectSuccess,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import type { AuthState } from "./call.js"

describe("user API", () => {
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

  describe("getStationList", () => {
    it("should return station list from fixture", async () => {
      const result = await expectEffectSuccess(getStationList(mockAuthState))

      expect(result.stations).toBeDefined()
      expect(Array.isArray(result.stations)).toBe(true)
    })

    it("should return stations with expected properties", async () => {
      const result = await expectEffectSuccess(getStationList(mockAuthState))

      // Should have at least one station in the fixture
      expect(result.stations.length).toBeGreaterThan(0)

      const firstStation = result.stations[0]
      expect(firstStation.stationToken).toBeDefined()
      expect(firstStation.stationName).toBeDefined()
      expect(firstStation.stationId).toBeDefined()
    })

    it("should return multiple stations", async () => {
      const result = await expectEffectSuccess(getStationList(mockAuthState))

      // Real users typically have multiple stations
      expect(result.stations.length).toBeGreaterThanOrEqual(1)
    })

    it("should have string station tokens", async () => {
      const result = await expectEffectSuccess(getStationList(mockAuthState))

      for (const station of result.stations) {
        expect(typeof station.stationToken).toBe("string")
        expect(station.stationToken.length).toBeGreaterThan(0)
      }
    })

    it("should have string station names", async () => {
      const result = await expectEffectSuccess(getStationList(mockAuthState))

      for (const station of result.stations) {
        expect(typeof station.stationName).toBe("string")
        expect(station.stationName.length).toBeGreaterThan(0)
      }
    })
  })

  describe("getBookmarks", () => {
    it("should return bookmarks from fixture", async () => {
      const result = await expectEffectSuccess(getBookmarks(mockAuthState))

      expect(result).toBeDefined()
    })

    it("should return artist bookmarks with expected properties", async () => {
      const result = await expectEffectSuccess(getBookmarks(mockAuthState))

      if (result.artists) {
        expect(Array.isArray(result.artists)).toBe(true)
        expect(result.artists.length).toBeGreaterThan(0)

        const firstArtist = result.artists[0]
        expect(firstArtist.bookmarkToken).toBeDefined()
        expect(typeof firstArtist.bookmarkToken).toBe("string")
        expect(firstArtist.artistName).toBeDefined()
        expect(typeof firstArtist.artistName).toBe("string")
        expect(firstArtist.musicToken).toBeDefined()
        expect(typeof firstArtist.musicToken).toBe("string")
        expect(firstArtist.dateCreated).toBeDefined()
        expect(typeof firstArtist.dateCreated.time).toBe("number")
      }
    })

    it("should return song bookmarks with expected properties", async () => {
      const result = await expectEffectSuccess(getBookmarks(mockAuthState))

      if (result.songs) {
        expect(Array.isArray(result.songs)).toBe(true)
        expect(result.songs.length).toBeGreaterThan(0)

        const firstSong = result.songs[0]
        expect(firstSong.bookmarkToken).toBeDefined()
        expect(typeof firstSong.bookmarkToken).toBe("string")
        expect(firstSong.songName).toBeDefined()
        expect(typeof firstSong.songName).toBe("string")
        expect(firstSong.artistName).toBeDefined()
        expect(typeof firstSong.artistName).toBe("string")
        expect(firstSong.musicToken).toBeDefined()
        expect(typeof firstSong.musicToken).toBe("string")
        expect(firstSong.dateCreated).toBeDefined()
        expect(typeof firstSong.dateCreated.time).toBe("number")
      }
    })

    it("should handle bookmarks with optional fields", async () => {
      const result = await expectEffectSuccess(getBookmarks(mockAuthState))

      if (result.artists && result.artists.length > 0) {
        const artist = result.artists[0]
        if (artist.artUrl) {
          expect(typeof artist.artUrl).toBe("string")
        }
      }

      if (result.songs && result.songs.length > 0) {
        const song = result.songs[0]
        if (song.albumName) {
          expect(typeof song.albumName).toBe("string")
        }
        if (song.sampleUrl) {
          expect(typeof song.sampleUrl).toBe("string")
        }
        if (song.artUrl) {
          expect(typeof song.artUrl).toBe("string")
        }
      }
    })
  })

  describe("getSettings", () => {
    it("should return user settings from fixture", async () => {
      const result = await expectEffectSuccess(getSettings(mockAuthState))

      expect(result).toBeDefined()
    })

    it("should return settings with expected properties", async () => {
      const result = await expectEffectSuccess(getSettings(mockAuthState))

      if (result.username) {
        expect(typeof result.username).toBe("string")
      }
      if (result.gender) {
        expect(typeof result.gender).toBe("string")
      }
      if (result.birthYear) {
        expect(typeof result.birthYear).toBe("number")
        expect(result.birthYear).toBeGreaterThan(1900)
        expect(result.birthYear).toBeLessThan(2100)
      }
      if (result.zipCode) {
        expect(typeof result.zipCode).toBe("string")
      }
      if (result.isExplicitContentFilterEnabled !== undefined) {
        expect(typeof result.isExplicitContentFilterEnabled).toBe("boolean")
      }
      if (result.isProfilePrivate !== undefined) {
        expect(typeof result.isProfilePrivate).toBe("boolean")
      }
      if (result.emailOptIn !== undefined) {
        expect(typeof result.emailOptIn).toBe("boolean")
      }
    })

    it("should handle all optional fields", async () => {
      const result = await expectEffectSuccess(getSettings(mockAuthState))

      // All fields are optional, so just verify the result exists
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })
  })

  describe("getUsageInfo", () => {
    it("should return usage info from fixture", async () => {
      const result = await expectEffectSuccess(getUsageInfo(mockAuthState))

      expect(result).toBeDefined()
    })

    it("should return usage info with expected properties", async () => {
      const result = await expectEffectSuccess(getUsageInfo(mockAuthState))

      if (result.accountMonthlyListening !== undefined) {
        expect(typeof result.accountMonthlyListening).toBe("number")
        expect(result.accountMonthlyListening).toBeGreaterThanOrEqual(0)
      }
      if (result.monthlyCapHours !== undefined) {
        expect(typeof result.monthlyCapHours).toBe("number")
        expect(result.monthlyCapHours).toBeGreaterThan(0)
      }
      if (result.monthlyCapWarningPercent !== undefined) {
        expect(typeof result.monthlyCapWarningPercent).toBe("number")
        expect(result.monthlyCapWarningPercent).toBeGreaterThan(0)
        expect(result.monthlyCapWarningPercent).toBeLessThanOrEqual(100)
      }
      if (result.monthlyCapWarningRepeatPercent !== undefined) {
        expect(typeof result.monthlyCapWarningRepeatPercent).toBe("number")
        expect(result.monthlyCapWarningRepeatPercent).toBeGreaterThan(0)
        expect(result.monthlyCapWarningRepeatPercent).toBeLessThanOrEqual(100)
      }
      if (result.isMonthlyPayer !== undefined) {
        expect(typeof result.isMonthlyPayer).toBe("boolean")
      }
      if (result.isCapped !== undefined) {
        expect(typeof result.isCapped).toBe("boolean")
      }
      if (result.listeningTimestamp !== undefined) {
        expect(typeof result.listeningTimestamp).toBe("number")
        expect(result.listeningTimestamp).toBeGreaterThan(0)
      }
    })

    it("should validate listening cap relationships", async () => {
      const result = await expectEffectSuccess(getUsageInfo(mockAuthState))

      if (result.accountMonthlyListening !== undefined && result.monthlyCapHours !== undefined) {
        // Cap hours should be reasonable (usually 320 hours/month for free tier)
        expect(result.monthlyCapHours).toBeLessThan(1000)
      }

      if (result.monthlyCapWarningPercent !== undefined && result.monthlyCapWarningRepeatPercent !== undefined) {
        // Repeat warning should be at or above initial warning
        expect(result.monthlyCapWarningRepeatPercent).toBeGreaterThanOrEqual(result.monthlyCapWarningPercent)
      }
    })
  })

  describe("getStationListChecksum", () => {
    it("should return checksum from fixture", async () => {
      const result = await expectEffectSuccess(getStationListChecksum(mockAuthState))

      expect(result).toBeDefined()
      expect(result.checksum).toBeDefined()
    })

    it("should return checksum as string", async () => {
      const result = await expectEffectSuccess(getStationListChecksum(mockAuthState))

      expect(typeof result.checksum).toBe("string")
      expect(result.checksum.length).toBeGreaterThan(0)
    })

    it("should return non-empty checksum", async () => {
      const result = await expectEffectSuccess(getStationListChecksum(mockAuthState))

      expect(result.checksum.length).toBeGreaterThan(0)
    })
  })

  describe("setQuickMix", () => {
    it("should successfully set quick mix stations", async () => {
      const request = {
        quickMixStationIds: ["123456", "789012", "345678"]
      }

      const result = await expectEffectSuccess(setQuickMix(mockAuthState, request))

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should handle empty quick mix", async () => {
      const request = {
        quickMixStationIds: []
      }

      const result = await expectEffectSuccess(setQuickMix(mockAuthState, request))

      expect(result).toBeDefined()
    })

    it("should handle single station quick mix", async () => {
      const request = {
        quickMixStationIds: ["123456"]
      }

      const result = await expectEffectSuccess(setQuickMix(mockAuthState, request))

      expect(result).toBeDefined()
    })

    it("should handle multiple stations quick mix", async () => {
      const request = {
        quickMixStationIds: ["123456", "789012", "345678", "901234"]
      }

      const result = await expectEffectSuccess(setQuickMix(mockAuthState, request))

      expect(result).toBeDefined()
    })
  })

  describe("changeSettings", () => {
    it("should successfully change single setting", async () => {
      const request = {
        zipCode: "94103"
      }

      const result = await expectEffectSuccess(changeSettings(mockAuthState, request))

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should successfully change multiple settings", async () => {
      const request = {
        gender: "male",
        birthYear: 1990,
        zipCode: "10001",
        isExplicitContentFilterEnabled: true,
        isProfilePrivate: false,
        emailOptIn: true
      }

      const result = await expectEffectSuccess(changeSettings(mockAuthState, request))

      expect(result).toBeDefined()
    })

    it("should handle boolean settings", async () => {
      const request = {
        isExplicitContentFilterEnabled: false,
        isProfilePrivate: true,
        emailOptIn: false
      }

      const result = await expectEffectSuccess(changeSettings(mockAuthState, request))

      expect(result).toBeDefined()
    })

    it("should handle demographic settings", async () => {
      const request = {
        gender: "female",
        birthYear: 1985,
        zipCode: "90210"
      }

      const result = await expectEffectSuccess(changeSettings(mockAuthState, request))

      expect(result).toBeDefined()
    })
  })

  describe("setExplicitContentFilter", () => {
    it("should enable explicit content filter", async () => {
      const request = {
        isExplicitContentFilterEnabled: true
      }

      const result = await expectEffectSuccess(setExplicitContentFilter(mockAuthState, request))

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should disable explicit content filter", async () => {
      const request = {
        isExplicitContentFilterEnabled: false
      }

      const result = await expectEffectSuccess(setExplicitContentFilter(mockAuthState, request))

      expect(result).toBeDefined()
    })

    it("should return empty result object", async () => {
      const request = {
        isExplicitContentFilterEnabled: true
      }

      const result = await expectEffectSuccess(setExplicitContentFilter(mockAuthState, request))

      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("sleepSong", () => {
    it("should successfully sleep a song", async () => {
      const request = {
        trackToken: "test_track_token_123"
      }

      const result = await expectEffectSuccess(sleepSong(mockAuthState, request))

      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
    })

    it("should return empty result object", async () => {
      const request = {
        trackToken: "test_track_token_456"
      }

      const result = await expectEffectSuccess(sleepSong(mockAuthState, request))

      expect(Object.keys(result).length).toBe(0)
    })

    it("should handle different track tokens", async () => {
      const request1 = {
        trackToken: "track_abc123"
      }
      const request2 = {
        trackToken: "track_xyz789"
      }

      const result1 = await expectEffectSuccess(sleepSong(mockAuthState, request1))
      const result2 = await expectEffectSuccess(sleepSong(mockAuthState, request2))

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })
  })
})
