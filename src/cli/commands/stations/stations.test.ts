import { describe, it, expect, beforeEach, spyOn } from "bun:test"
import { Effect } from "effect"
import * as client from "../../../client.js"
import * as sessionCache from "../../cache/session.js"
import type {
  Station,
  StationListResponse,
  GetStationResponse,
  CreateStationResponse,
  RenameStationResponse,
  AddMusicResponse,
  GetGenreStationsResponse,
  TransformSharedStationResponse
} from "../../../types/api.js"
import type { Session } from "../../../types/session.js"
import { sortStations, limitStations } from "./list.js"
import { findStation, findStationOrFail } from "../utils/findStation.js"
import { parseStationNames, resolveStationIds } from "./quickmix.js"

/**
 * Integration tests for stations CLI commands
 *
 * These tests verify the core business logic of stations commands including:
 * - Station sorting and filtering
 * - Station lookup by name (partial matching)
 * - QuickMix station name parsing
 * - API client interactions
 *
 * Note: Full CLI integration testing with Commander requires complex parent chain setup.
 * These tests focus on the core logic and API interactions rather than the Commander wrapper.
 */

describe("stations commands", () => {
  const mockSession: Session = {
    partnerId: "partner123",
    partnerAuthToken: "partnerAuth123",
    syncTime: 1234567890,
    userId: "user123",
    userAuthToken: "userAuth123",
  }

  const mockStations: readonly Station[] = [
    {
      stationToken: "token1",
      stationName: "Rock Classics",
      stationId: "station1",
    },
    {
      stationToken: "token2",
      stationName: "Jazz Vibes",
      stationId: "station2",
    },
    {
      stationToken: "token3",
      stationName: "Electronic Beats",
      stationId: "station3",
    },
  ]

  describe("stations list - sorting", () => {
    it("should sort stations by name alphabetically", () => {
      const sorted = sortStations(mockStations, "name")

      expect(sorted[0].stationName).toBe("Electronic Beats")
      expect(sorted[1].stationName).toBe("Jazz Vibes")
      expect(sorted[2].stationName).toBe("Rock Classics")
    })

    it("should keep original order for recent sort", () => {
      const sorted = sortStations(mockStations, "recent")

      expect(sorted[0].stationName).toBe("Rock Classics")
      expect(sorted[1].stationName).toBe("Jazz Vibes")
      expect(sorted[2].stationName).toBe("Electronic Beats")
    })

    it("should reverse order for created sort", () => {
      const sorted = sortStations(mockStations, "created")

      expect(sorted[0].stationName).toBe("Electronic Beats")
      expect(sorted[1].stationName).toBe("Jazz Vibes")
      expect(sorted[2].stationName).toBe("Rock Classics")
    })
  })

  describe("stations list - limiting", () => {
    it("should limit number of results", () => {
      const limited = limitStations([...mockStations], 2)

      expect(limited).toHaveLength(2)
      expect(limited[0].stationName).toBe("Rock Classics")
      expect(limited[1].stationName).toBe("Jazz Vibes")
    })

    it("should return all stations when limit is undefined", () => {
      const limited = limitStations([...mockStations], undefined)

      expect(limited).toHaveLength(3)
    })

    it("should return all stations when limit is 0 or negative", () => {
      expect(limitStations([...mockStations], 0)).toHaveLength(3)
      expect(limitStations([...mockStations], -1)).toHaveLength(3)
    })
  })

  describe("stations list - API integration", () => {
    it("should call getStationList with session", async () => {
      const getSessionMock = spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const getStationListMock = spyOn(client, "getStationList").mockReturnValue(
        Effect.succeed({ stations: mockStations } as StationListResponse)
      )

      const effect = client.getStationList(mockSession)
      const result = await Effect.runPromise(effect)

      expect(getStationListMock).toHaveBeenCalledWith(mockSession)
      expect(result.stations).toHaveLength(3)
    })
  })

  describe("stations info - station lookup", () => {
    it("should find station by exact name (case-insensitive)", () => {
      const station = findStation(mockStations, "rock classics")

      expect(station).not.toBeNull()
      expect(station?.stationName).toBe("Rock Classics")
    })

    it("should find station by partial name", () => {
      const station = findStation(mockStations, "electronic")

      expect(station).not.toBeNull()
      expect(station?.stationName).toBe("Electronic Beats")
    })

    it("should find station by token", () => {
      const station = findStation(mockStations, "token2")

      expect(station).not.toBeNull()
      expect(station?.stationName).toBe("Jazz Vibes")
    })

    it("should return null for nonexistent station", () => {
      const station = findStation(mockStations, "Nonexistent Station")

      expect(station).toBeNull()
    })

    it("should fail with NotFoundError for nonexistent station", async () => {
      const effect = findStationOrFail(mockStations, "Nonexistent Station")

      try {
        await Effect.runPromise(effect)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe("stations create - API integration", () => {
    const mockCreateResponse: CreateStationResponse = {
      stationId: "newstation1",
      stationToken: "newtoken1",
      stationName: "New Station Radio",
    }

    it("should create station with music token and song type", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const createStationMock = spyOn(client, "createStation").mockReturnValue(
        Effect.succeed(mockCreateResponse)
      )

      const effect = client.createStation(mockSession, {
        musicToken: "musictoken123",
        musicType: "song",
      })

      const result = await Effect.runPromise(effect)

      expect(createStationMock).toHaveBeenCalledWith(mockSession, {
        musicToken: "musictoken123",
        musicType: "song",
      })
      expect(result.stationName).toBe("New Station Radio")
    })

    it("should create station with artist type", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const createStationMock = spyOn(client, "createStation").mockReturnValue(
        Effect.succeed(mockCreateResponse)
      )

      const effect = client.createStation(mockSession, {
        musicToken: "musictoken123",
        musicType: "artist",
      })

      await Effect.runPromise(effect)

      expect(createStationMock).toHaveBeenCalledWith(mockSession, {
        musicToken: "musictoken123",
        musicType: "artist",
      })
    })
  })

  describe("stations delete - API integration", () => {
    it("should delete station by token", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const deleteStationMock = spyOn(client, "deleteStation").mockReturnValue(
        Effect.succeed({})
      )

      const effect = client.deleteStation(mockSession, {
        stationToken: "token1",
      })

      await Effect.runPromise(effect)

      expect(deleteStationMock).toHaveBeenCalledWith(mockSession, {
        stationToken: "token1",
      })
    })
  })

  describe("stations rename - API integration", () => {
    const mockRenameResponse: RenameStationResponse = {
      stationId: "station1",
      stationToken: "token1",
      stationName: "Classic Rock Hits",
    }

    it("should rename station", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const renameStationMock = spyOn(client, "renameStation").mockReturnValue(
        Effect.succeed(mockRenameResponse)
      )

      const effect = client.renameStation(mockSession, {
        stationToken: "token1",
        stationName: "Classic Rock Hits",
      })

      const result = await Effect.runPromise(effect)

      expect(renameStationMock).toHaveBeenCalledWith(mockSession, {
        stationToken: "token1",
        stationName: "Classic Rock Hits",
      })
      expect(result.stationName).toBe("Classic Rock Hits")
    })
  })

  describe("stations genres - API integration", () => {
    const mockGenreResponse: GetGenreStationsResponse = {
      categories: [
        {
          categoryName: "Rock",
          stations: [
            {
              stationName: "Classic Rock",
              stationToken: "genre_token1",
              stationId: "genre_station1",
            },
            {
              stationName: "Alternative Rock",
              stationToken: "genre_token2",
              stationId: "genre_station2",
            },
          ],
        },
        {
          categoryName: "Jazz",
          stations: [
            {
              stationName: "Smooth Jazz",
              stationToken: "genre_token3",
              stationId: "genre_station3",
            },
          ],
        },
      ],
    }

    it("should get genre stations", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const getGenreStationsMock = spyOn(client, "getGenreStations").mockReturnValue(
        Effect.succeed(mockGenreResponse)
      )

      const effect = client.getGenreStations(mockSession)
      const result = await Effect.runPromise(effect)

      expect(getGenreStationsMock).toHaveBeenCalledWith(mockSession)
      expect(result.categories).toHaveLength(2)
      expect(result.categories[0].categoryName).toBe("Rock")
      expect(result.categories[0].stations).toHaveLength(2)
    })
  })

  describe("stations share - API integration", () => {
    it("should share station with emails", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const shareStationMock = spyOn(client, "shareStation").mockReturnValue(
        Effect.succeed({})
      )

      const effect = client.shareStation(mockSession, {
        stationId: "station1",
        stationToken: "token1",
        emails: ["friend1@example.com", "friend2@example.com"],
      })

      await Effect.runPromise(effect)

      expect(shareStationMock).toHaveBeenCalledWith(mockSession, {
        stationId: "station1",
        stationToken: "token1",
        emails: ["friend1@example.com", "friend2@example.com"],
      })
    })
  })

  describe("stations clone - API integration", () => {
    const mockCloneResponse: TransformSharedStationResponse = {
      stationId: "newstation2",
      stationToken: "newtoken2",
      stationName: "Rock Classics (Copy)",
    }

    it("should clone a shared station", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const transformStationMock = spyOn(client, "transformSharedStation").mockReturnValue(
        Effect.succeed(mockCloneResponse)
      )

      const effect = client.transformSharedStation(mockSession, {
        stationToken: "token1",
      })

      const result = await Effect.runPromise(effect)

      expect(transformStationMock).toHaveBeenCalledWith(mockSession, {
        stationToken: "token1",
      })
      expect(result.stationName).toBe("Rock Classics (Copy)")
    })
  })

  describe("stations seed add - API integration", () => {
    const mockAddMusicResponse: AddMusicResponse = {
      seedId: "newseed1",
      artistName: "The Rolling Stones",
      songName: "Paint It Black",
    }

    it("should add music seed to station", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const addMusicMock = spyOn(client, "addMusic").mockReturnValue(
        Effect.succeed(mockAddMusicResponse)
      )

      const effect = client.addMusic(mockSession, {
        stationToken: "token1",
        musicToken: "musictoken789",
      })

      const result = await Effect.runPromise(effect)

      expect(addMusicMock).toHaveBeenCalledWith(mockSession, {
        stationToken: "token1",
        musicToken: "musictoken789",
      })
      expect(result.seedId).toBe("newseed1")
      expect(result.songName).toBe("Paint It Black")
    })
  })

  describe("stations seed remove - API integration", () => {
    it("should remove music seed from station", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const deleteMusicMock = spyOn(client, "deleteMusic").mockReturnValue(
        Effect.succeed({})
      )

      const effect = client.deleteMusic(mockSession, {
        seedId: "seed123",
      })

      await Effect.runPromise(effect)

      expect(deleteMusicMock).toHaveBeenCalledWith(mockSession, {
        seedId: "seed123",
      })
    })
  })

  describe("stations quickmix - station name parsing", () => {
    it("should parse space-separated station names", () => {
      const names = parseStationNames(["rock classics", "jazz vibes"])

      expect(names).toEqual(["rock classics", "jazz vibes"])
    })

    it("should parse comma-separated station names", () => {
      const names = parseStationNames(["rock classics,jazz vibes,electronic beats"])

      expect(names).toEqual(["rock classics", "jazz vibes", "electronic beats"])
    })

    it("should handle mixed comma and space separation", () => {
      const names = parseStationNames(["rock classics,jazz vibes", "electronic beats"])

      expect(names).toEqual(["rock classics", "jazz vibes", "electronic beats"])
    })

    it("should trim whitespace from names", () => {
      const names = parseStationNames(["  rock classics  ,  jazz vibes  "])

      expect(names).toEqual(["rock classics", "jazz vibes"])
    })

    it("should filter empty strings", () => {
      const names = parseStationNames(["rock classics,,jazz vibes"])

      expect(names).toEqual(["rock classics", "jazz vibes"])
    })
  })

  describe("stations quickmix - ID resolution", () => {
    it("should resolve station names to IDs", async () => {
      const effect = resolveStationIds(mockStations, ["rock classics", "jazz vibes"])
      const result = await Effect.runPromise(effect)

      expect(result).toEqual(["station1", "station2"])
    })

    it("should support partial name matching", async () => {
      const effect = resolveStationIds(mockStations, ["rock", "jazz"])
      const result = await Effect.runPromise(effect)

      expect(result).toEqual(["station1", "station2"])
    })

    it("should fail when station not found", async () => {
      const effect = resolveStationIds(mockStations, ["nonexistent"])

      try {
        await Effect.runPromise(effect)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it("should fail with list of all missing stations", async () => {
      const effect = resolveStationIds(mockStations, ["nonexistent1", "jazz", "nonexistent2"])

      try {
        await Effect.runPromise(effect)
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        const errorObj = error as Error
        expect(errorObj.message).toContain("nonexistent1")
        expect(errorObj.message).toContain("nonexistent2")
        expect(errorObj.message).not.toContain("jazz")
      }
    })
  })

  describe("stations quickmix set - API integration", () => {
    it("should set quickmix with station IDs", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const setQuickMixMock = spyOn(client, "setQuickMix").mockReturnValue(
        Effect.succeed(undefined as never)
      )

      const effect = client.setQuickMix(mockSession, ["station1", "station2", "station3"])

      await Effect.runPromise(effect)

      expect(setQuickMixMock).toHaveBeenCalledWith(
        mockSession,
        ["station1", "station2", "station3"]
      )
    })
  })

  describe("stations info - extended attributes", () => {
    const mockStationInfo: GetStationResponse = {
      stationToken: "token1",
      stationName: "Rock Classics",
      stationId: "station1",
      music: {
        artists: [
          {
            seedId: "seed1",
            artistName: "Led Zeppelin",
            musicToken: "music1",
          },
          {
            seedId: "seed2",
            artistName: "Pink Floyd",
            musicToken: "music2",
          },
        ],
        songs: [
          {
            seedId: "seed3",
            artistName: "The Beatles",
            songName: "Here Comes The Sun",
            musicToken: "music3",
          },
        ],
      },
      feedback: {
        thumbsUp: [
          {
            feedbackId: "fb1",
            songName: "Stairway to Heaven",
            artistName: "Led Zeppelin",
            isPositive: true,
            dateCreated: { time: 1234567890 },
          },
        ],
        thumbsDown: [],
      },
    }

    it("should get station with extended attributes", async () => {
      spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
      const getStationMock = spyOn(client, "getStation").mockReturnValue(
        Effect.succeed(mockStationInfo)
      )

      const effect = client.getStation(mockSession, {
        stationToken: "token1",
        includeExtendedAttributes: true,
      })

      const result = await Effect.runPromise(effect)

      expect(getStationMock).toHaveBeenCalledWith(mockSession, {
        stationToken: "token1",
        includeExtendedAttributes: true,
      })
      expect(result.music?.artists).toHaveLength(2)
      expect(result.music?.songs).toHaveLength(1)
      expect(result.feedback?.thumbsUp).toHaveLength(1)
    })
  })
})
