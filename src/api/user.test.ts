import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { getStationList } from "./user.js"
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
})
