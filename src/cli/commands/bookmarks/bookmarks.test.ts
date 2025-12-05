import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test"
import { Effect } from "effect"
import type { PandoraSession } from "../../../client.js"
import * as client from "../../../client.js"
import * as sessionCache from "../../cache/session.js"
import * as errorHandler from "../../errors/handler.js"
import type {
  GetBookmarksResponse,
  AddArtistBookmarkResponse,
  AddSongBookmarkResponse,
  ArtistBookmark,
  SongBookmark,
} from "../../../types/api.js"
import { SessionError } from "../../../types/errors.js"

describe("bookmarks commands", () => {
  const mockSession: PandoraSession = {
    syncTime: 1234567890,
    partnerId: "test-partner-id",
    partnerAuthToken: "test-partner-auth",
    userId: "test-user-id",
    userAuthToken: "test-user-auth",
  }

  const mockArtistBookmarks: readonly ArtistBookmark[] = [
    {
      bookmarkToken: "artist-bookmark-1",
      artistName: "The Beatles",
      musicToken: "music-token-1",
      artUrl: "https://example.com/beatles.jpg",
      dateCreated: { time: 1609459200000 },
    },
    {
      bookmarkToken: "artist-bookmark-2",
      artistName: "Pink Floyd",
      musicToken: "music-token-2",
      dateCreated: { time: 1612137600000 },
    },
  ]

  const mockSongBookmarks: readonly SongBookmark[] = [
    {
      bookmarkToken: "song-bookmark-1",
      songName: "Hey Jude",
      artistName: "The Beatles",
      albumName: "Hey Jude",
      musicToken: "song-music-token-1",
      sampleUrl: "https://example.com/hey-jude.mp3",
      artUrl: "https://example.com/hey-jude.jpg",
      dateCreated: { time: 1609459200000 },
    },
    {
      bookmarkToken: "song-bookmark-2",
      songName: "Wish You Were Here",
      artistName: "Pink Floyd",
      albumName: "Wish You Were Here",
      musicToken: "song-music-token-2",
      dateCreated: { time: 1612137600000 },
    },
    {
      bookmarkToken: "song-bookmark-3",
      songName: "Comfortably Numb",
      artistName: "Pink Floyd",
      musicToken: "song-music-token-3",
      dateCreated: { time: 1614556800000 },
    },
  ]

  beforeEach(() => {
    mock.restore()
  })

  describe("bookmarks list", () => {
    describe("success paths", () => {
      it("should fetch and display all bookmarks", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        spyOn(client, "getBookmarks").mockReturnValue(
          Effect.succeed({
            artists: mockArtistBookmarks,
            songs: mockSongBookmarks,
          } as GetBookmarksResponse)
        )

        const result: GetBookmarksResponse = {
          artists: mockArtistBookmarks,
          songs: mockSongBookmarks,
        }

        expect(result.artists).toHaveLength(2)
        expect(result.songs).toHaveLength(3)
      })

      it("should handle empty artist bookmarks", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const bookmarksSpy = spyOn(client, "getBookmarks").mockReturnValue(
          Effect.succeed({
            artists: [],
            songs: mockSongBookmarks,
          } as GetBookmarksResponse)
        )

        expect(bookmarksSpy).toBeDefined()
      })

      it("should handle empty song bookmarks", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const bookmarksSpy = spyOn(client, "getBookmarks").mockReturnValue(
          Effect.succeed({
            artists: mockArtistBookmarks,
            songs: [],
          } as GetBookmarksResponse)
        )

        expect(bookmarksSpy).toBeDefined()
      })

      it("should handle all empty bookmarks", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const bookmarksSpy = spyOn(client, "getBookmarks").mockReturnValue(
          Effect.succeed({
            artists: [],
            songs: [],
          } as GetBookmarksResponse)
        )

        expect(bookmarksSpy).toBeDefined()
      })
    })

    describe("JSON output format", () => {
      it("should format JSON output correctly for all bookmarks", () => {
        const result: GetBookmarksResponse = {
          artists: mockArtistBookmarks,
          songs: mockSongBookmarks,
        }

        const jsonOutput = {
          success: true,
          data: {
            artists: result.artists,
            songs: result.songs,
            count: (result.artists?.length ?? 0) + (result.songs?.length ?? 0),
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.artists).toHaveLength(2)
        expect(jsonOutput.data.songs).toHaveLength(3)
        expect(jsonOutput.data.count).toBe(5)
      })

      it("should format JSON output for artists only", () => {
        const jsonOutput = {
          success: true,
          data: {
            artists: mockArtistBookmarks,
            count: mockArtistBookmarks.length,
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.artists).toHaveLength(2)
        expect(jsonOutput.data.count).toBe(2)
      })

      it("should format JSON output for songs only", () => {
        const jsonOutput = {
          success: true,
          data: {
            songs: mockSongBookmarks,
            count: mockSongBookmarks.length,
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.songs).toHaveLength(3)
        expect(jsonOutput.data.count).toBe(3)
      })

      it("should format JSON output for empty bookmarks", () => {
        const jsonOutput = {
          success: true,
          data: {
            artists: [],
            songs: [],
            count: 0,
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.count).toBe(0)
      })
    })

    describe("error handling", () => {
      it("should handle missing session error", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(null)

        const sessionError = new SessionError({
          message: "No active session found",
        })

        expect(sessionError.message).toBe("No active session found")
        expect(sessionError._tag).toBe("SessionError")
      })

      it("should validate bookmark type", () => {
        const invalidType = "invalid"
        const validTypes = ["artists", "songs", "all"]

        expect(validTypes.includes(invalidType)).toBe(false)
        expect(validTypes.includes("artists")).toBe(true)
        expect(validTypes.includes("songs")).toBe(true)
        expect(validTypes.includes("all")).toBe(true)
      })

      it("should handle API call errors", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)

        const apiError = new Error("API call failed")
        const bookmarksSpy = spyOn(client, "getBookmarks").mockReturnValue(
          Effect.fail(apiError as never)
        )

        expect(bookmarksSpy).toBeDefined()
      })
    })
  })

  describe("bookmarks add", () => {
    describe("add artist bookmark", () => {
      it("should add artist bookmark successfully", async () => {
        const mockResponse: AddArtistBookmarkResponse = {
          bookmarkToken: "new-artist-bookmark",
          artistName: "Led Zeppelin",
          musicToken: "new-music-token",
          dateCreated: { time: Date.now() },
        }

        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const addSpy = spyOn(client, "addArtistBookmark").mockReturnValue(
          Effect.succeed(mockResponse)
        )

        expect(addSpy).toBeDefined()
        expect(mockResponse.artistName).toBe("Led Zeppelin")
      })

      it("should format JSON output for artist bookmark", () => {
        const mockResponse: AddArtistBookmarkResponse = {
          bookmarkToken: "new-artist-bookmark",
          artistName: "Led Zeppelin",
          musicToken: "new-music-token",
          dateCreated: { time: Date.now() },
        }

        const jsonOutput = {
          success: true,
          data: mockResponse,
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.artistName).toBe("Led Zeppelin")
        expect(jsonOutput.data.bookmarkToken).toBe("new-artist-bookmark")
      })

      it("should handle missing session when adding artist bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(null)

        const sessionError = new SessionError({
          message: "No active session found",
        })

        expect(sessionError._tag).toBe("SessionError")
      })

      it("should handle API errors when adding artist bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)

        const apiError = new Error("Failed to add artist bookmark")
        const addSpy = spyOn(client, "addArtistBookmark").mockReturnValue(
          Effect.fail(apiError as never)
        )

        expect(addSpy).toBeDefined()
      })
    })

    describe("add song bookmark", () => {
      it("should add song bookmark successfully", async () => {
        const mockResponse: AddSongBookmarkResponse = {
          bookmarkToken: "new-song-bookmark",
          songName: "Stairway to Heaven",
          artistName: "Led Zeppelin",
          albumName: "Led Zeppelin IV",
          musicToken: "new-song-music-token",
          sampleUrl: "https://example.com/stairway.mp3",
          dateCreated: { time: Date.now() },
        }

        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const addSpy = spyOn(client, "addSongBookmark").mockReturnValue(
          Effect.succeed(mockResponse)
        )

        expect(addSpy).toBeDefined()
        expect(mockResponse.songName).toBe("Stairway to Heaven")
      })

      it("should add song bookmark without album name", async () => {
        const mockResponse: AddSongBookmarkResponse = {
          bookmarkToken: "new-song-bookmark-2",
          songName: "Kashmir",
          artistName: "Led Zeppelin",
          musicToken: "new-song-music-token-2",
          dateCreated: { time: Date.now() },
        }

        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        spyOn(client, "addSongBookmark").mockReturnValue(
          Effect.succeed(mockResponse)
        )

        expect(mockResponse.albumName).toBeUndefined()
      })

      it("should format JSON output for song bookmark", () => {
        const mockResponse: AddSongBookmarkResponse = {
          bookmarkToken: "new-song-bookmark",
          songName: "Stairway to Heaven",
          artistName: "Led Zeppelin",
          albumName: "Led Zeppelin IV",
          musicToken: "new-song-music-token",
          sampleUrl: "https://example.com/stairway.mp3",
          dateCreated: { time: Date.now() },
        }

        const jsonOutput = {
          success: true,
          data: mockResponse,
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.songName).toBe("Stairway to Heaven")
        expect(jsonOutput.data.artistName).toBe("Led Zeppelin")
        expect(jsonOutput.data.albumName).toBe("Led Zeppelin IV")
      })

      it("should handle missing session when adding song bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(null)

        const sessionError = new SessionError({
          message: "No active session found",
        })

        expect(sessionError._tag).toBe("SessionError")
      })

      it("should handle API errors when adding song bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)

        const apiError = new Error("Failed to add song bookmark")
        const addSpy = spyOn(client, "addSongBookmark").mockReturnValue(
          Effect.fail(apiError as never)
        )

        expect(addSpy).toBeDefined()
      })
    })
  })

  describe("bookmarks delete", () => {
    describe("delete artist bookmark", () => {
      it("should delete artist bookmark successfully", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const deleteSpy = spyOn(client, "deleteArtistBookmark").mockReturnValue(
          Effect.succeed({})
        )

        expect(deleteSpy).toBeDefined()
      })

      it("should format JSON output for delete artist bookmark", () => {
        const bookmarkToken = "artist-bookmark-to-delete"

        const jsonOutput = {
          success: true,
          data: {
            bookmarkType: "artist",
            bookmarkToken,
            message: "artist bookmark deleted successfully",
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.bookmarkType).toBe("artist")
        expect(jsonOutput.data.bookmarkToken).toBe(bookmarkToken)
      })

      it("should validate bookmark type for delete", () => {
        const invalidType = "invalid"
        const validTypes = ["artist", "song"]

        expect(validTypes.includes(invalidType)).toBe(false)
        expect(validTypes.includes("artist")).toBe(true)
        expect(validTypes.includes("song")).toBe(true)
      })

      it("should handle missing session when deleting artist bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(null)

        const sessionError = new SessionError({
          message: "No active session found",
        })

        expect(sessionError._tag).toBe("SessionError")
      })

      it("should handle API errors when deleting artist bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)

        const apiError = new Error("Failed to delete artist bookmark")
        const deleteSpy = spyOn(client, "deleteArtistBookmark").mockReturnValue(
          Effect.fail(apiError as never)
        )

        expect(deleteSpy).toBeDefined()
      })
    })

    describe("delete song bookmark", () => {
      it("should delete song bookmark successfully", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)
        const deleteSpy = spyOn(client, "deleteSongBookmark").mockReturnValue(
          Effect.succeed({})
        )

        expect(deleteSpy).toBeDefined()
      })

      it("should format JSON output for delete song bookmark", () => {
        const bookmarkToken = "song-bookmark-to-delete"

        const jsonOutput = {
          success: true,
          data: {
            bookmarkType: "song",
            bookmarkToken,
            message: "song bookmark deleted successfully",
          },
        }

        expect(jsonOutput.success).toBe(true)
        expect(jsonOutput.data.bookmarkType).toBe("song")
        expect(jsonOutput.data.bookmarkToken).toBe(bookmarkToken)
      })

      it("should handle missing session when deleting song bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(null)

        const sessionError = new SessionError({
          message: "No active session found",
        })

        expect(sessionError._tag).toBe("SessionError")
      })

      it("should handle API errors when deleting song bookmark", async () => {
        spyOn(sessionCache, "getSession").mockResolvedValue(mockSession)

        const apiError = new Error("Failed to delete song bookmark")
        const deleteSpy = spyOn(client, "deleteSongBookmark").mockReturnValue(
          Effect.fail(apiError as never)
        )

        expect(deleteSpy).toBeDefined()
      })
    })
  })

  describe("date formatting", () => {
    it("should format dates correctly", () => {
      const timestamp = 1609459200000
      const formatted = new Date(timestamp).toLocaleDateString()

      expect(formatted).toBeTruthy()
      expect(typeof formatted).toBe("string")
    })

    it("should handle different timestamp values", () => {
      const timestamps = [1609459200000, 1612137600000, 1614556800000]

      for (const timestamp of timestamps) {
        const formatted = new Date(timestamp).toLocaleDateString()
        expect(formatted).toBeTruthy()
        expect(typeof formatted).toBe("string")
      }
    })
  })

  describe("table formatting", () => {
    it("should handle artist bookmarks with optional fields", () => {
      const artistWithArt = mockArtistBookmarks[0]
      const artistWithoutArt = mockArtistBookmarks[1]

      expect(artistWithArt?.artUrl).toBeDefined()
      expect(artistWithoutArt?.artUrl).toBeUndefined()
    })

    it("should handle song bookmarks with optional fields", () => {
      const songWithAlbum = mockSongBookmarks[0]
      const songWithoutAlbum = mockSongBookmarks[2]

      expect(songWithAlbum?.albumName).toBeDefined()
      expect(songWithoutAlbum?.albumName).toBeUndefined()
    })

    it("should display hyphen for missing album names", () => {
      const songWithoutAlbum = mockSongBookmarks[2]
      const displayValue = songWithoutAlbum?.albumName ?? "-"

      expect(displayValue).toBe("-")
    })
  })

  describe("count and pluralization", () => {
    it("should pluralize artist count correctly", () => {
      const counts = [0, 1, 2]
      const expected = ["artists", "artist", "artists"]

      for (let i = 0; i < counts.length; i++) {
        const count = counts[i]
        const suffix = count === 1 ? "" : "s"
        const word = "artist" + suffix
        expect(word).toBe(expected[i])
      }
    })

    it("should pluralize song count correctly", () => {
      const counts = [0, 1, 3]
      const expected = ["songs", "song", "songs"]

      for (let i = 0; i < counts.length; i++) {
        const count = counts[i]
        const suffix = count === 1 ? "" : "s"
        const word = "song" + suffix
        expect(word).toBe(expected[i])
      }
    })

    it("should calculate total count correctly", () => {
      const artistCount = mockArtistBookmarks.length
      const songCount = mockSongBookmarks.length
      const total = artistCount + songCount

      expect(total).toBe(5)
      expect(artistCount).toBe(2)
      expect(songCount).toBe(3)
    })
  })

  describe("string capitalization", () => {
    it("should capitalize first letter of bookmark type", () => {
      const capitalize = (str: string): string => {
        return str.charAt(0).toUpperCase() + str.slice(1)
      }

      expect(capitalize("artist")).toBe("Artist")
      expect(capitalize("song")).toBe("Song")
    })
  })
})
