import { describe, it, expect } from "bun:test"
import {
  formatResponse,
  formatError,
  formatTable,
  formatSuccess,
  formatWarning,
  type StandardResponse,
  type OutputOptions
} from "./formatter.js"
import { generateM3U, generateURLList, type PlaylistEntry } from "./m3u.js"

describe("formatter", () => {
  describe("formatResponse", () => {
    describe("JSON output", () => {
      const jsonOptions: OutputOptions = { json: true }

      it("should format string data as JSON response", () => {
        const result = formatResponse("test data", jsonOptions)
        const parsed: StandardResponse<string> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toBe("test data")
        expect(parsed.error).toBeUndefined()
      })

      it("should format number data as JSON response", () => {
        const result = formatResponse(42, jsonOptions)
        const parsed: StandardResponse<number> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toBe(42)
      })

      it("should format object data as JSON response", () => {
        const data = { foo: "bar", count: 42 }
        const result = formatResponse(data, jsonOptions)
        const parsed: StandardResponse<typeof data> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toEqual(data)
      })

      it("should format array data as JSON response", () => {
        const data = [1, 2, 3]
        const result = formatResponse(data, jsonOptions)
        const parsed: StandardResponse<typeof data> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toEqual(data)
      })

      it("should format null data as JSON response", () => {
        const result = formatResponse(null, jsonOptions)
        const parsed: StandardResponse<null> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toBe(null)
      })

      it("should format boolean data as JSON response", () => {
        const result = formatResponse(true, jsonOptions)
        const parsed: StandardResponse<boolean> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toBe(true)
      })

      it("should produce pretty-printed JSON with 2-space indentation", () => {
        const data = { nested: { value: 123 } }
        const result = formatResponse(data, jsonOptions)

        expect(result).toContain('\n  ')
        expect(result).not.toContain('\n    \n')
      })
    })

    describe("human-readable output", () => {
      const humanOptions: OutputOptions = { json: false }

      it("should return string data as-is", () => {
        const result = formatResponse("plain text", humanOptions)
        expect(result).toBe("plain text")
      })

      it("should convert number to string", () => {
        const result = formatResponse(42, humanOptions)
        expect(result).toBe("42")
      })

      it("should convert boolean to string", () => {
        const result = formatResponse(true, humanOptions)
        expect(result).toBe("true")
      })

      it("should format object as pretty JSON", () => {
        const data = { foo: "bar", count: 42 }
        const result = formatResponse(data, humanOptions)

        expect(result).toContain('"foo": "bar"')
        expect(result).toContain('"count": 42')
      })

      it("should format array as pretty JSON", () => {
        const data = ["one", "two", "three"]
        const result = formatResponse(data, humanOptions)

        expect(result).toContain('"one"')
        expect(result).toContain('"two"')
        expect(result).toContain('"three"')
      })

      it("should handle null value", () => {
        const result = formatResponse(null, humanOptions)
        expect(result).toBe("null")
      })

      it("should handle empty object", () => {
        const result = formatResponse({}, humanOptions)
        expect(result).toContain("{")
        expect(result).toContain("}")
      })

      it("should handle empty array", () => {
        const result = formatResponse([], humanOptions)
        expect(result).toContain("[")
        expect(result).toContain("]")
      })
    })
  })

  describe("formatError", () => {
    describe("JSON output", () => {
      const jsonOptions: OutputOptions = { json: true }

      it("should format error with code and message", () => {
        const error = { code: "AUTH_ERROR", message: "Authentication failed" }
        const result = formatError(error, jsonOptions)
        const parsed: StandardResponse<null> = JSON.parse(result)

        expect(parsed.success).toBe(false)
        expect(parsed.data).toBe(null)
        expect(parsed.error).toEqual(error)
      })

      it("should include error details when provided", () => {
        const error = {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { field: "email", reason: "Invalid format" }
        }
        const result = formatError(error, jsonOptions)
        const parsed: StandardResponse<null> = JSON.parse(result)

        expect(parsed.error?.details).toEqual({ field: "email", reason: "Invalid format" })
      })

      it("should handle error without details", () => {
        const error = { code: "UNKNOWN", message: "Something went wrong" }
        const result = formatError(error, jsonOptions)
        const parsed: StandardResponse<null> = JSON.parse(result)

        expect(parsed.error?.details).toBeUndefined()
      })

      it("should handle empty error code", () => {
        const error = { code: "", message: "Error message" }
        const result = formatError(error, jsonOptions)
        const parsed: StandardResponse<null> = JSON.parse(result)

        expect(parsed.error?.code).toBe("")
        expect(parsed.error?.message).toBe("Error message")
      })
    })

    describe("human-readable output", () => {
      const humanOptions: OutputOptions = { json: false }

      it("should format error with red X symbol and message", () => {
        const error = { code: "AUTH_ERROR", message: "Authentication failed" }
        const result = formatError(error, humanOptions)

        expect(result).toContain("✗")
        expect(result).toContain("Authentication failed")
      })

      it("should include error code in output", () => {
        const error = { code: "AUTH_ERROR", message: "Authentication failed" }
        const result = formatError(error, humanOptions)

        expect(result).toContain("Error code: AUTH_ERROR")
      })

      it("should include details when provided", () => {
        const error = {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: { field: "email" }
        }
        const result = formatError(error, humanOptions)

        expect(result).toContain("Details:")
        expect(result).toContain('"field"')
        expect(result).toContain('"email"')
      })

      it("should not include error code when code is empty", () => {
        const error = { code: "", message: "Error message" }
        const result = formatError(error, humanOptions)

        expect(result).not.toContain("Error code:")
        expect(result).toContain("Error message")
      })

      it("should handle complex details object", () => {
        const error = {
          code: "COMPLEX_ERROR",
          message: "Multiple issues",
          details: {
            errors: [
              { field: "name", message: "Required" },
              { field: "age", message: "Must be positive" }
            ]
          }
        }
        const result = formatError(error, humanOptions)

        expect(result).toContain("Details:")
        expect(result).toContain("errors")
      })
    })
  })

  describe("formatTable", () => {
    describe("JSON output", () => {
      const jsonOptions: OutputOptions = { json: true }

      it("should format table data as JSON array", () => {
        const headers = ["Name", "Age", "City"]
        const rows = [
          { Name: "Alice", Age: 30, City: "New York" },
          { Name: "Bob", Age: 25, City: "London" }
        ]
        const result = formatTable(headers, rows, jsonOptions)
        const parsed: StandardResponse<Record<string, unknown>[]> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toEqual(rows)
      })

      it("should handle empty rows array", () => {
        const headers = ["Name", "Age"]
        const rows: Record<string, unknown>[] = []
        const result = formatTable(headers, rows, jsonOptions)
        const parsed: StandardResponse<Record<string, unknown>[]> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data).toEqual([])
      })

      it("should preserve data types in JSON output", () => {
        const headers = ["Name", "Active", "Count"]
        const rows = [
          { Name: "Test", Active: true, Count: 42 }
        ]
        const result = formatTable(headers, rows, jsonOptions)
        const parsed: StandardResponse<Record<string, unknown>[]> = JSON.parse(result)

        expect(parsed.data?.[0].Active).toBe(true)
        expect(parsed.data?.[0].Count).toBe(42)
      })
    })

    describe("human-readable output", () => {
      const humanOptions: OutputOptions = { json: false }

      it("should format data as ASCII table", () => {
        const headers = ["Name", "Age"]
        const rows = [
          { Name: "Alice", Age: 30 }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("Name")
        expect(result).toContain("Age")
        expect(result).toContain("Alice")
        expect(result).toContain("30")
      })

      it("should handle multiple rows", () => {
        const headers = ["Name", "Age"]
        const rows = [
          { Name: "Alice", Age: 30 },
          { Name: "Bob", Age: 25 },
          { Name: "Charlie", Age: 35 }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("Alice")
        expect(result).toContain("Bob")
        expect(result).toContain("Charlie")
      })

      it("should display em dash for null values", () => {
        const headers = ["Name", "Age"]
        const rows = [
          { Name: "Alice", Age: null }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("—")
      })

      it("should display em dash for undefined values", () => {
        const headers = ["Name", "Age"]
        const rows = [
          { Name: "Alice", Age: undefined }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("—")
      })

      it("should convert non-string values to strings", () => {
        const headers = ["Name", "Active", "Count"]
        const rows = [
          { Name: "Test", Active: true, Count: 42 }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("true")
        expect(result).toContain("42")
      })

      it("should handle empty rows with message", () => {
        const headers = ["Name", "Age"]
        const rows: Record<string, unknown>[] = []
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("No data to display")
      })

      it("should handle missing fields in rows", () => {
        const headers = ["Name", "Age", "City"]
        const rows = [
          { Name: "Alice", Age: 30 }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("Alice")
        expect(result).toContain("—")
      })

      it("should handle long string values", () => {
        const headers = ["Name", "Description"]
        const rows = [
          {
            Name: "Test",
            Description: "This is a very long description that might need to be handled properly in the table output"
          }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("very long description")
      })

      it("should handle special characters in values", () => {
        const headers = ["Name", "Email"]
        const rows = [
          { Name: "Alice & Bob", Email: "test@example.com" }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("Alice & Bob")
        expect(result).toContain("test@example.com")
      })

      it("should handle object values by converting to string", () => {
        const headers = ["Name", "Data"]
        const rows = [
          { Name: "Test", Data: { nested: "value" } }
        ]
        const result = formatTable(headers, rows, humanOptions)

        expect(result).toContain("[object Object]")
      })
    })
  })

  describe("formatSuccess", () => {
    describe("JSON output", () => {
      const jsonOptions: OutputOptions = { json: true }

      it("should format success message as JSON", () => {
        const result = formatSuccess("Operation completed", jsonOptions)
        const parsed: StandardResponse<{ message: string }> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data?.message).toBe("Operation completed")
      })

      it("should handle empty message", () => {
        const result = formatSuccess("", jsonOptions)
        const parsed: StandardResponse<{ message: string }> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data?.message).toBe("")
      })

      it("should handle message with special characters", () => {
        const message = "Success! File saved @ /path/to/file.txt"
        const result = formatSuccess(message, jsonOptions)
        const parsed: StandardResponse<{ message: string }> = JSON.parse(result)

        expect(parsed.data?.message).toBe(message)
      })
    })

    describe("human-readable output", () => {
      const humanOptions: OutputOptions = { json: false }

      it("should format with green checkmark", () => {
        const result = formatSuccess("Operation completed", humanOptions)

        expect(result).toContain("✓")
        expect(result).toContain("Operation completed")
      })

      it("should handle empty message", () => {
        const result = formatSuccess("", humanOptions)

        expect(result).toContain("✓")
      })

      it("should handle multiline message", () => {
        const message = "Line 1\nLine 2\nLine 3"
        const result = formatSuccess(message, humanOptions)

        expect(result).toContain("Line 1")
        expect(result).toContain("Line 2")
        expect(result).toContain("Line 3")
      })
    })
  })

  describe("formatWarning", () => {
    describe("JSON output", () => {
      const jsonOptions: OutputOptions = { json: true }

      it("should format warning message as JSON", () => {
        const result = formatWarning("This is a warning", jsonOptions)
        const parsed: StandardResponse<{ warning: string }> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data?.warning).toBe("This is a warning")
      })

      it("should handle empty warning", () => {
        const result = formatWarning("", jsonOptions)
        const parsed: StandardResponse<{ warning: string }> = JSON.parse(result)

        expect(parsed.success).toBe(true)
        expect(parsed.data?.warning).toBe("")
      })

      it("should handle warning with special characters", () => {
        const warning = "Warning: Rate limit (5/10) approaching!"
        const result = formatWarning(warning, jsonOptions)
        const parsed: StandardResponse<{ warning: string }> = JSON.parse(result)

        expect(parsed.data?.warning).toBe(warning)
      })
    })

    describe("human-readable output", () => {
      const humanOptions: OutputOptions = { json: false }

      it("should format with yellow warning symbol", () => {
        const result = formatWarning("This is a warning", humanOptions)

        expect(result).toContain("⚠")
        expect(result).toContain("This is a warning")
      })

      it("should handle empty warning", () => {
        const result = formatWarning("", humanOptions)

        expect(result).toContain("⚠")
      })

      it("should handle multiline warning", () => {
        const warning = "Warning line 1\nWarning line 2"
        const result = formatWarning(warning, humanOptions)

        expect(result).toContain("Warning line 1")
        expect(result).toContain("Warning line 2")
      })
    })
  })
})

describe("m3u", () => {
  describe("generateM3U", () => {
    it("should generate valid M3U header", () => {
      const entries: PlaylistEntry[] = []
      const result = generateM3U(entries)

      expect(result).toStartWith("#EXTM3U\n")
    })

    it("should generate M3U for single entry", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test Song - Test Artist",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("#EXTM3U")
      expect(result).toContain("#EXTINF:180,Test Song - Test Artist")
      expect(result).toContain("https://audio.pandora.com/track.mp3")
    })

    it("should generate M3U for multiple entries", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Song 1 - Artist 1",
          url: "https://audio.pandora.com/track1.mp3"
        },
        {
          duration: 240,
          title: "Song 2 - Artist 2",
          url: "https://audio.pandora.com/track2.mp3"
        },
        {
          duration: 200,
          title: "Song 3 - Artist 3",
          url: "https://audio.pandora.com/track3.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("#EXTINF:180,Song 1 - Artist 1")
      expect(result).toContain("https://audio.pandora.com/track1.mp3")
      expect(result).toContain("#EXTINF:240,Song 2 - Artist 2")
      expect(result).toContain("https://audio.pandora.com/track2.mp3")
      expect(result).toContain("#EXTINF:200,Song 3 - Artist 3")
      expect(result).toContain("https://audio.pandora.com/track3.mp3")
    })

    it("should handle -1 duration for streams", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: -1,
          title: "Live Stream",
          url: "https://stream.pandora.com/live"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("#EXTINF:-1,Live Stream")
    })

    it("should handle zero duration", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 0,
          title: "Unknown Duration",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("#EXTINF:0,Unknown Duration")
    })

    it("should handle special characters in title", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Song & Title - Artist (feat. Guest)",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("Song & Title - Artist (feat. Guest)")
    })

    it("should handle unicode characters in title", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Café del Mar - José González",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("Café del Mar - José González")
    })

    it("should handle URLs with query parameters", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test Song",
          url: "https://audio.pandora.com/track.mp3?token=abc123&quality=high"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("https://audio.pandora.com/track.mp3?token=abc123&quality=high")
    })

    it("should end with newline", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test Song",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toEndWith("\n")
    })

    it("should handle empty entries array", () => {
      const entries: PlaylistEntry[] = []
      const result = generateM3U(entries)

      expect(result).toBe("#EXTM3U\n")
    })

    it("should maintain correct line order", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "First Song",
          url: "https://audio.pandora.com/first.mp3"
        },
        {
          duration: 240,
          title: "Second Song",
          url: "https://audio.pandora.com/second.mp3"
        }
      ]
      const result = generateM3U(entries)
      const lines = result.split('\n')

      expect(lines[0]).toBe("#EXTM3U")
      expect(lines[1]).toBe("#EXTINF:180,First Song")
      expect(lines[2]).toBe("https://audio.pandora.com/first.mp3")
      expect(lines[3]).toBe("#EXTINF:240,Second Song")
      expect(lines[4]).toBe("https://audio.pandora.com/second.mp3")
    })

    it("should handle very long titles", () => {
      const longTitle = "A".repeat(500)
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: longTitle,
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain(longTitle)
    })

    it("should handle empty title", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("#EXTINF:180,")
    })

    it("should handle empty URL", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test Song",
          url: ""
        }
      ]
      const result = generateM3U(entries)

      expect(result).toContain("Test Song")
      expect(result.split('\n')).toContain("")
    })
  })

  describe("generateURLList", () => {
    it("should generate URL list for single entry", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test Song",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateURLList(entries)

      expect(result).toBe("https://audio.pandora.com/track.mp3\n")
    })

    it("should generate URL list for multiple entries", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Song 1",
          url: "https://audio.pandora.com/track1.mp3"
        },
        {
          duration: 240,
          title: "Song 2",
          url: "https://audio.pandora.com/track2.mp3"
        },
        {
          duration: 200,
          title: "Song 3",
          url: "https://audio.pandora.com/track3.mp3"
        }
      ]
      const result = generateURLList(entries)

      expect(result).toBe(
        "https://audio.pandora.com/track1.mp3\n" +
        "https://audio.pandora.com/track2.mp3\n" +
        "https://audio.pandora.com/track3.mp3\n"
      )
    })

    it("should ignore duration and title fields", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 999,
          title: "This should not appear",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateURLList(entries)

      expect(result).not.toContain("This should not appear")
      expect(result).not.toContain("999")
      expect(result).toContain("https://audio.pandora.com/track.mp3")
    })

    it("should handle URLs with query parameters", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test",
          url: "https://audio.pandora.com/track.mp3?token=abc&quality=high"
        }
      ]
      const result = generateURLList(entries)

      expect(result).toBe("https://audio.pandora.com/track.mp3?token=abc&quality=high\n")
    })

    it("should end with newline", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test",
          url: "https://audio.pandora.com/track.mp3"
        }
      ]
      const result = generateURLList(entries)

      expect(result).toEndWith("\n")
    })

    it("should handle empty entries array", () => {
      const entries: PlaylistEntry[] = []
      const result = generateURLList(entries)

      expect(result).toBe("\n")
    })

    it("should handle empty URL", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test",
          url: ""
        }
      ]
      const result = generateURLList(entries)

      expect(result).toBe("\n")
    })

    it("should maintain URL order", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "First",
          url: "https://audio.pandora.com/first.mp3"
        },
        {
          duration: 180,
          title: "Second",
          url: "https://audio.pandora.com/second.mp3"
        },
        {
          duration: 180,
          title: "Third",
          url: "https://audio.pandora.com/third.mp3"
        }
      ]
      const result = generateURLList(entries)
      const lines = result.split('\n').filter(line => line.length > 0)

      expect(lines[0]).toBe("https://audio.pandora.com/first.mp3")
      expect(lines[1]).toBe("https://audio.pandora.com/second.mp3")
      expect(lines[2]).toBe("https://audio.pandora.com/third.mp3")
    })

    it("should handle special characters in URL", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Test",
          url: "https://audio.pandora.com/track%20with%20spaces.mp3"
        }
      ]
      const result = generateURLList(entries)

      expect(result).toContain("track%20with%20spaces.mp3")
    })

    it("should produce one URL per line", () => {
      const entries: PlaylistEntry[] = [
        {
          duration: 180,
          title: "Song 1",
          url: "https://audio.pandora.com/track1.mp3"
        },
        {
          duration: 180,
          title: "Song 2",
          url: "https://audio.pandora.com/track2.mp3"
        }
      ]
      const result = generateURLList(entries)
      const lines = result.trim().split('\n')

      expect(lines.length).toBe(2)
      expect(lines[0]).toBe("https://audio.pandora.com/track1.mp3")
      expect(lines[1]).toBe("https://audio.pandora.com/track2.mp3")
    })
  })
})
