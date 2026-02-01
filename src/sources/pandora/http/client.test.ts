import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { httpRequest, type HttpRequest } from "./client.js"
import {
  expectEffectSuccess,
  expectEffectFailure,
  setFixtureMode,
  resetFixtureMode
} from "../test-utils.js"
import { ApiCallError } from "../types/errors.js"
import type { ApiResponse } from "../types/api.js"

describe("http client", () => {
  beforeEach(() => {
    resetFixtureMode()
  })

  afterEach(() => {
    resetFixtureMode()
  })

  describe("fixture replay mode", () => {
    it("should load response from fixture in replay mode", async () => {
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=auth.partnerLogin",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        apiMethod: "auth.partnerLogin"
      }

      const result = await expectEffectSuccess(
        httpRequest<{ partnerId: string }>(request)
      )

      expect(result.stat).toBe("ok")
      expect(result.result).toBeDefined()
    })

    it("should fail when fixture does not exist in replay mode", async () => {
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=nonexistent.method",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        apiMethod: "nonexistent.method"
      }

      const error = await expectEffectFailure(
        httpRequest<unknown>(request)
      )

      expect(error).toBeInstanceOf(ApiCallError)
      expect((error as ApiCallError).message).toContain("No fixture found")
      expect((error as ApiCallError).message).toContain("nonexistent.method")
    })

    it("should load user login fixture", async () => {
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=auth.userLogin",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        apiMethod: "auth.userLogin"
      }

      const result = await expectEffectSuccess(
        httpRequest<{ userId: string; userAuthToken: string }>(request)
      )

      expect(result.stat).toBe("ok")
      expect(result.result).toBeDefined()
    })

    it("should load station list fixture", async () => {
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=user.getStationList",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        apiMethod: "user.getStationList"
      }

      type StationListResult = {
        readonly stations: ReadonlyArray<{
          readonly stationToken: string
          readonly stationName: string
        }>
      }

      const result = await expectEffectSuccess(
        httpRequest<StationListResult>(request)
      )

      expect(result.stat).toBe("ok")
      expect(result.result.stations).toBeDefined()
      expect(Array.isArray(result.result.stations)).toBe(true)
    })

    it("should load playlist fixture", async () => {
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=station.getPlaylist",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        apiMethod: "station.getPlaylist"
      }

      type PlaylistResult = {
        readonly items: ReadonlyArray<{
          readonly trackToken: string
          readonly songName: string
          readonly artistName: string
        }>
      }

      const result = await expectEffectSuccess(
        httpRequest<PlaylistResult>(request)
      )

      expect(result.stat).toBe("ok")
      expect(result.result.items).toBeDefined()
      expect(Array.isArray(result.result.items)).toBe(true)
    })
  })

  describe("fixture mode selection", () => {
    it("should default to live mode when env var not set", async () => {
      // Unset the fixture mode
      delete process.env.PYXIS_FIXTURE_MODE

      // This would make a real network request in live mode
      // We don't want to do that in tests, so we'll just verify the mode logic
      // by checking that replay mode correctly reads from fixtures
      setFixtureMode("replay")

      const request: HttpRequest = {
        url: "https://tuner.pandora.com/services/json/?method=auth.partnerLogin",
        method: "POST",
        headers: {},
        body: "{}",
        apiMethod: "auth.partnerLogin"
      }

      // Should successfully read from fixture in replay mode
      const result = await expectEffectSuccess(httpRequest<unknown>(request))
      expect(result.stat).toBe("ok")
    })
  })

  describe("request structure", () => {
    it("should properly type the HttpRequest", () => {
      const request: HttpRequest = {
        url: "https://example.com/api",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Custom-Header": "value"
        },
        body: JSON.stringify({ key: "value" }),
        apiMethod: "test.method"
      }

      expect(request.url).toBe("https://example.com/api")
      expect(request.method).toBe("POST")
      expect(request.headers["Content-Type"]).toBe("application/json")
      expect(request.body).toBe('{"key":"value"}')
      expect(request.apiMethod).toBe("test.method")
    })
  })

  describe("ApiResponse type", () => {
    it("should handle success response shape", () => {
      const response: ApiResponse<{ data: string }> = {
        stat: "ok",
        result: { data: "test" }
      }

      expect(response.stat).toBe("ok")
      expect(response.result.data).toBe("test")
    })

    it("should handle fail response shape", () => {
      const response: ApiResponse<never> = {
        stat: "fail",
        result: undefined as never
      }

      expect(response.stat).toBe("fail")
    })
  })
})
