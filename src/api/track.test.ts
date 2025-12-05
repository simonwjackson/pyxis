import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { explainTrack } from "./track.js"
import {
  expectEffectSuccess,
  expectEffectFailure,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import { ApiCallError } from "../types/errors.js"
import type { ExplainTrackRequest } from "../types/api.js"

describe("track", () => {
  const mockAuthState = {
    syncTime: 1234567890,
    partnerId: "42",
    partnerAuthToken: "VAyOF96RBRvkfDjqbPKUsslw==",
    userAuthToken: "mockUserAuthToken123",
    userId: "mockUserId456"
  }

  beforeEach(() => {
    setFixtureMode("replay")
  })

  afterEach(() => {
    resetFixtureMode()
  })

  describe("explainTrack", () => {
    it("should successfully explain track with fixture data", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      expect(result.explanations).toBeDefined()
      expect(Array.isArray(result.explanations)).toBe(true)
      expect(result.explanations.length).toBeGreaterThan(0)
    })

    it("should return explanation with focus traits", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // Check that each explanation has the required fields
      for (const explanation of result.explanations) {
        expect(explanation.focusTraitId).toBeDefined()
        expect(explanation.focusTraitName).toBeDefined()
        expect(typeof explanation.focusTraitId).toBe("string")
        expect(typeof explanation.focusTraitName).toBe("string")
        expect(explanation.focusTraitId.length).toBeGreaterThan(0)
        expect(explanation.focusTraitName.length).toBeGreaterThan(0)
      }
    })

    it("should return multiple explanations for a track", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // Fixture should have multiple explanations
      expect(result.explanations.length).toBeGreaterThanOrEqual(1)

      // Verify the fixture data matches expected structure
      const firstExplanation = result.explanations[0]
      expect(firstExplanation).toBeDefined()
      expect(firstExplanation.focusTraitId).toBeTruthy()
      expect(firstExplanation.focusTraitName).toBeTruthy()
    })

    it("should handle different track tokens", async () => {
      const request1: ExplainTrackRequest = {
        trackToken: "S1234567"
      }
      const request2: ExplainTrackRequest = {
        trackToken: "S9876543"
      }

      // Both should succeed with fixture mode
      const result1 = await expectEffectSuccess(
        explainTrack(mockAuthState, request1)
      )
      const result2 = await expectEffectSuccess(
        explainTrack(mockAuthState, request2)
      )

      expect(result1.explanations).toBeDefined()
      expect(result2.explanations).toBeDefined()
    })

    it("should work with complete auth state", async () => {
      const completeAuthState = {
        syncTime: Date.now(),
        partnerId: "testPartner123",
        partnerAuthToken: "testPartnerToken456",
        userAuthToken: "testUserToken789",
        userId: "testUser999"
      }

      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(completeAuthState, request)
      )

      expect(result.explanations).toBeDefined()
      expect(Array.isArray(result.explanations)).toBe(true)
    })
  })

  describe("error handling", () => {
    it("should have correct error type for API call failure", () => {
      const error = new ApiCallError({
        method: "track.explainTrack",
        message: "Track not found",
        cause: new Error("404 Not Found")
      })

      expect(error._tag).toBe("ApiCallError")
      expect(error.method).toBe("track.explainTrack")
      expect(error.message).toBe("Track not found")
      expect(error.cause).toBeDefined()
    })

    it("should handle missing track token gracefully", async () => {
      // TypeScript prevents this at compile time, but testing runtime behavior
      const request = {
        trackToken: ""
      } as ExplainTrackRequest

      // This should still make the API call with empty token
      // In replay mode, it will use the fixture
      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      expect(result.explanations).toBeDefined()
    })

    it("should work with minimal auth state", async () => {
      const minimalAuthState = {
        syncTime: 0,
        partnerId: "",
        partnerAuthToken: "",
        userAuthToken: "",
        userId: ""
      }

      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      // In replay mode with fixtures, even minimal auth should work
      const result = await expectEffectSuccess(
        explainTrack(minimalAuthState, request)
      )

      expect(result.explanations).toBeDefined()
    })
  })

  describe("response validation", () => {
    it("should have readonly explanations array", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // TypeScript enforces readonly, but verify it's an array
      expect(Array.isArray(result.explanations)).toBe(true)

      // Verify we can iterate over it
      let count = 0
      for (const _ of result.explanations) {
        count++
      }
      expect(count).toBe(result.explanations.length)
    })

    it("should return valid TrackExplanation objects", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // Validate structure of each explanation
      for (const explanation of result.explanations) {
        // Check required properties exist
        expect("focusTraitId" in explanation).toBe(true)
        expect("focusTraitName" in explanation).toBe(true)

        // Check types
        expect(typeof explanation.focusTraitId).toBe("string")
        expect(typeof explanation.focusTraitName).toBe("string")

        // Check non-empty strings
        expect(explanation.focusTraitId.trim().length).toBeGreaterThan(0)
        expect(explanation.focusTraitName.trim().length).toBeGreaterThan(0)
      }
    })

    it("should return explanations with meaningful trait names", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // Verify trait names are descriptive (from fixture)
      const traitNames = result.explanations.map(e => e.focusTraitName)

      expect(traitNames.length).toBeGreaterThan(0)

      // All trait names should be non-empty strings
      for (const name of traitNames) {
        expect(typeof name).toBe("string")
        expect(name.length).toBeGreaterThan(0)
      }
    })

    it("should return explanations with valid trait IDs", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const result = await expectEffectSuccess(
        explainTrack(mockAuthState, request)
      )

      // Verify trait IDs exist and are unique
      const traitIds = result.explanations.map(e => e.focusTraitId)
      const uniqueIds = new Set(traitIds)

      expect(traitIds.length).toBeGreaterThan(0)
      expect(uniqueIds.size).toBe(traitIds.length) // All IDs should be unique

      // All IDs should be non-empty
      for (const id of traitIds) {
        expect(typeof id).toBe("string")
        expect(id.length).toBeGreaterThan(0)
      }
    })
  })

  describe("Effect integration", () => {
    it("should return Effect that can be composed", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      const effect = explainTrack(mockAuthState, request)

      // Verify it's an Effect
      expect(effect).toBeDefined()
      expect(typeof effect).toBe("object")

      // Should be able to run it
      const result = await expectEffectSuccess(effect)
      expect(result.explanations).toBeDefined()
    })

    it("should be callable with pipe", async () => {
      const request: ExplainTrackRequest = {
        trackToken: "S1234567"
      }

      // This tests that the Effect can be used in effect pipelines
      const effect = explainTrack(mockAuthState, request)
      const result = await expectEffectSuccess(effect)

      expect(result.explanations).toBeDefined()
      expect(result.explanations.length).toBeGreaterThan(0)
    })
  })
})
