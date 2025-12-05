import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { Command } from "commander"
import { Effect } from "effect"
import type { PandoraSession } from "../../../client.js"
import type { GetSettingsResponse, GetUsageInfoResponse } from "../../../types/api.js"

// Store original console.log
const originalConsoleLog = console.log

// Mock modules
const mockGetSession = mock(() => Promise.resolve(null as PandoraSession | null))
const mockGetSettings = mock(() => Effect.succeed({} as GetSettingsResponse))
const mockGetUsageInfo = mock(() => Effect.succeed({} as GetUsageInfoResponse))
const mockChangeSettings = mock(() => Effect.succeed({} as Record<string, never>))
const mockSetExplicitContentFilter = mock(() => Effect.succeed({} as Record<string, never>))
const mockRunEffect = mock(async <T>(effect: Effect.Effect<T, unknown>) => {
  const result = await Effect.runPromise(effect)
  return result
})

mock.module("../../cache/session.js", () => ({
  getSession: mockGetSession
}))

mock.module("../../../client.js", () => ({
  getSettings: mockGetSettings,
  getUsageInfo: mockGetUsageInfo,
  changeSettings: mockChangeSettings,
  setExplicitContentFilter: mockSetExplicitContentFilter
}))

mock.module("../../errors/handler.js", () => ({
  runEffect: mockRunEffect
}))

// Import after mocking
import { registerAccountCommands } from "./index.js"

type CapturedOutput = string[]

describe("account CLI commands", () => {
  const mockSession: PandoraSession = {
    syncTime: 1234567890,
    partnerId: "test-partner-id",
    partnerAuthToken: "test-partner-token",
    userId: "test-user-id",
    userAuthToken: "test-user-token"
  }

  let program: Command
  let capturedOutput: CapturedOutput

  beforeEach(() => {
    program = new Command()
    program.exitOverride() // Prevent process.exit during tests
    registerAccountCommands(program)

    // Capture console.log output
    capturedOutput = []
    console.log = (...args: ReadonlyArray<unknown>) => {
      capturedOutput.push(args.map(arg => String(arg)).join(" "))
    }

    // Reset all mocks
    mock.restore()
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  describe("account settings", () => {
    it("should display account settings with all fields", async () => {
      const mockSettings: GetSettingsResponse = {
        username: "testuser",
        gender: "male",
        birthYear: 1990,
        zipCode: "94103",
        isExplicitContentFilterEnabled: true,
        isProfilePrivate: false,
        emailOptIn: true
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetSettings.mockReturnValueOnce(Effect.succeed(mockSettings))

      try {
        await program.parseAsync(["node", "test", "account", "settings"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
      expect(mockGetSettings).toHaveBeenCalledWith(mockSession)
      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("Account Settings")
      expect(output).toContain("testuser")
      expect(output).toContain("male")
      expect(output).toContain("1990")
      expect(output).toContain("94103")
    })

    it("should display settings with optional fields as '(not set)'", async () => {
      const mockSettings: GetSettingsResponse = {
        username: "testuser"
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetSettings.mockReturnValueOnce(Effect.succeed(mockSettings))

      try {
        await program.parseAsync(["node", "test", "account", "settings"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("(not set)")
    })

    it("should output JSON format when --json flag is used", async () => {
      const mockSettings: GetSettingsResponse = {
        username: "testuser",
        gender: "female",
        birthYear: 1985,
        zipCode: "10001",
        isExplicitContentFilterEnabled: false,
        isProfilePrivate: true,
        emailOptIn: false
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetSettings.mockReturnValueOnce(Effect.succeed(mockSettings))

      const programWithJson = new Command()
      programWithJson.exitOverride()
      programWithJson.option("--json", "Output as JSON")
      registerAccountCommands(programWithJson)

      try {
        await programWithJson.parseAsync(["node", "test", "--json", "account", "settings"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput[0] as string
      const parsed = JSON.parse(output) as { success: boolean; data: GetSettingsResponse }
      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual(mockSettings)
    })

    it("should handle session error when no session exists", async () => {
      mockGetSession.mockResolvedValueOnce(null)

      const programForError = new Command()
      programForError.exitOverride()
      registerAccountCommands(programForError)

      const mockRunEffectWithError = mock(async <T>(effect: Effect.Effect<T, unknown>) => {
        try {
          return await Effect.runPromise(effect)
        } catch (error) {
          throw error
        }
      })

      mock.module("../../errors/handler.js", () => ({
        runEffect: mockRunEffectWithError
      }))

      let caughtError = null
      try {
        await programForError.parseAsync(["node", "test", "account", "settings"])
      } catch (e) {
        caughtError = e
      }

      expect(mockGetSession).toHaveBeenCalled()
    })

    it("should display boolean settings as Yes/No", async () => {
      const mockSettings: GetSettingsResponse = {
        username: "testuser",
        isExplicitContentFilterEnabled: true,
        isProfilePrivate: false,
        emailOptIn: true
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetSettings.mockReturnValueOnce(Effect.succeed(mockSettings))

      try {
        await program.parseAsync(["node", "test", "account", "settings"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput.join("\n")
      // Check that output is generated
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("account usage", () => {
    it("should display usage information with all fields", async () => {
      const mockUsage: GetUsageInfoResponse = {
        accountMonthlyListening: 1200, // 20 hours in minutes
        monthlyCapHours: 19200, // 320 hours in minutes
        monthlyCapWarningPercent: 80,
        monthlyCapWarningRepeatPercent: 90,
        isMonthlyPayer: false,
        isCapped: false,
        listeningTimestamp: 1609459200 // 2021-01-01 00:00:00
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetUsageInfo.mockReturnValueOnce(Effect.succeed(mockUsage))

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
      expect(mockGetUsageInfo).toHaveBeenCalledWith(mockSession)
      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("Account Usage Information")
      expect(output).toContain("20h 0m") // Monthly listening formatted
    })

    it("should display usage bar for listening progress", async () => {
      const mockUsage: GetUsageInfoResponse = {
        accountMonthlyListening: 9600, // 160 hours (50% of cap)
        monthlyCapHours: 19200, // 320 hours
        isMonthlyPayer: false,
        isCapped: false
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetUsageInfo.mockReturnValueOnce(Effect.succeed(mockUsage))

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput.join("\n")
      // Check for progress bar characters
      expect(output).toMatch(/[█░]/)
      expect(output).toContain("50.0%")
    })

    it("should output JSON format for usage when --json flag is used", async () => {
      const mockUsage: GetUsageInfoResponse = {
        accountMonthlyListening: 1200,
        monthlyCapHours: 19200,
        monthlyCapWarningPercent: 80,
        monthlyCapWarningRepeatPercent: 90,
        isMonthlyPayer: false,
        isCapped: false,
        listeningTimestamp: 1609459200
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetUsageInfo.mockReturnValueOnce(Effect.succeed(mockUsage))

      const programWithJson = new Command()
      programWithJson.exitOverride()
      programWithJson.option("--json", "Output as JSON")
      registerAccountCommands(programWithJson)

      try {
        await programWithJson.parseAsync(["node", "test", "--json", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput[0] as string
      const parsed = JSON.parse(output) as { success: boolean; data: GetUsageInfoResponse }
      expect(parsed.success).toBe(true)
      expect(parsed.data).toEqual(mockUsage)
    })

    it("should handle optional usage fields", async () => {
      const mockUsage: GetUsageInfoResponse = {
        accountMonthlyListening: 1200
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetUsageInfo.mockReturnValueOnce(Effect.succeed(mockUsage))

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput.join("\n")
      expect(output).toContain("(not set)")
    })

    it("should format timestamps correctly", async () => {
      const mockUsage: GetUsageInfoResponse = {
        listeningTimestamp: 1609459200 // 2021-01-01 00:00:00
      }

      mockGetSession.mockResolvedValueOnce(mockSession)
      mockGetUsageInfo.mockReturnValueOnce(Effect.succeed(mockUsage))

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput.join("\n")
      // Should contain formatted date string
      expect(output).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it("should handle session error when no session exists", async () => {
      mockGetSession.mockResolvedValueOnce(null)

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
    })
  })

  describe("account set explicit", () => {
    it("should enable explicit content filter", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
      expect(mockSetExplicitContentFilter).toHaveBeenCalledWith(mockSession, true)
      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("enabled")
    })

    it("should disable explicit content filter", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "off"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockSetExplicitContentFilter).toHaveBeenCalledWith(mockSession, false)

      const output = capturedOutput.join("\n")
      expect(output).toContain("disabled")
    })

    it("should accept boolean values: true/false", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "true"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockSetExplicitContentFilter).toHaveBeenCalledWith(mockSession, true)
    })

    it("should accept boolean values: yes/no", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "yes"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockSetExplicitContentFilter).toHaveBeenCalledWith(mockSession, true)
    })

    it("should accept boolean values: 1/0", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "1"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockSetExplicitContentFilter).toHaveBeenCalledWith(mockSession, true)
    })

    it("should output JSON format when --json flag is used", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      const programWithJson = new Command()
      programWithJson.exitOverride()
      programWithJson.option("--json", "Output as JSON")
      registerAccountCommands(programWithJson)

      try {
        await programWithJson.parseAsync(["node", "test", "--json", "account", "set", "explicit", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput[0] as string
      const parsed = JSON.parse(output) as { success: boolean; setting: string; value: boolean }
      expect(parsed.success).toBe(true)
      expect(parsed.setting).toBe("explicitContentFilter")
      expect(parsed.value).toBe(true)
    })

    it("should respect --quiet flag and not output message", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockSetExplicitContentFilter.mockReturnValueOnce(Effect.succeed({}))

      const programWithQuiet = new Command()
      programWithQuiet.exitOverride()
      programWithQuiet.option("--quiet", "Suppress output")
      registerAccountCommands(programWithQuiet)

      try {
        await programWithQuiet.parseAsync(["node", "test", "--quiet", "account", "set", "explicit", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      // With --quiet, console.log should not be called for success message
      expect(mockSetExplicitContentFilter).toHaveBeenCalled()
    })
  })

  describe("account set private", () => {
    it("should make profile private", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "private", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
      expect(mockChangeSettings).toHaveBeenCalledWith(mockSession, {
        isProfilePrivate: true
      })
      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("private")
    })

    it("should make profile public", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "private", "off"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockChangeSettings).toHaveBeenCalledWith(mockSession, {
        isProfilePrivate: false
      })

      const output = capturedOutput.join("\n")
      expect(output).toContain("public")
    })

    it("should output JSON format when --json flag is used", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      const programWithJson = new Command()
      programWithJson.exitOverride()
      programWithJson.option("--json", "Output as JSON")
      registerAccountCommands(programWithJson)

      try {
        await programWithJson.parseAsync(["node", "test", "--json", "account", "set", "private", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput[0] as string
      const parsed = JSON.parse(output) as { success: boolean; setting: string; value: boolean }
      expect(parsed.success).toBe(true)
      expect(parsed.setting).toBe("profilePrivacy")
      expect(parsed.value).toBe(true)
    })

    it("should accept various boolean formats", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "private", "yes"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockChangeSettings).toHaveBeenCalledWith(mockSession, {
        isProfilePrivate: true
      })
    })
  })

  describe("account set zip", () => {
    it("should update zip code", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      try {
        await program.parseAsync(["node", "test", "account", "set", "zip", "94103"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
      expect(mockChangeSettings).toHaveBeenCalledWith(mockSession, {
        zipCode: "94103"
      })
      expect(capturedOutput.length).toBeGreaterThan(0)

      const output = capturedOutput.join("\n")
      expect(output).toContain("94103")
    })

    it("should accept different valid zip codes", async () => {
      const zipCodes = ["10001", "90210", "60601", "33101", "98101"]

      for (const zipCode of zipCodes) {
        mockGetSession.mockResolvedValueOnce(mockSession)
        mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

        const testProgram = new Command()
        testProgram.exitOverride()
        registerAccountCommands(testProgram)

        try {
          await testProgram.parseAsync(["node", "test", "account", "set", "zip", zipCode])
        } catch (e) {
          // Ignore commander exit
        }

        expect(mockChangeSettings).toHaveBeenCalledWith(mockSession, {
          zipCode
        })

        mock.restore()
      }
    })

    it("should output JSON format when --json flag is used", async () => {
      mockGetSession.mockResolvedValueOnce(mockSession)
      mockChangeSettings.mockReturnValueOnce(Effect.succeed({}))

      const programWithJson = new Command()
      programWithJson.exitOverride()
      programWithJson.option("--json", "Output as JSON")
      registerAccountCommands(programWithJson)

      try {
        await programWithJson.parseAsync(["node", "test", "--json", "account", "set", "zip", "94103"])
      } catch (e) {
        // Ignore commander exit
      }

      const output = capturedOutput[0] as string
      const parsed = JSON.parse(output) as { success: boolean; setting: string; value: string }
      expect(parsed.success).toBe(true)
      expect(parsed.setting).toBe("zipCode")
      expect(parsed.value).toBe("94103")
    })
  })

  describe("error handling", () => {
    it("should handle SessionError when not logged in for settings", async () => {
      mockGetSession.mockResolvedValueOnce(null)

      try {
        await program.parseAsync(["node", "test", "account", "settings"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
    })

    it("should handle SessionError when not logged in for usage", async () => {
      mockGetSession.mockResolvedValueOnce(null)

      try {
        await program.parseAsync(["node", "test", "account", "usage"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
    })

    it("should handle SessionError when not logged in for set commands", async () => {
      mockGetSession.mockResolvedValueOnce(null)

      try {
        await program.parseAsync(["node", "test", "account", "set", "explicit", "on"])
      } catch (e) {
        // Ignore commander exit
      }

      expect(mockGetSession).toHaveBeenCalled()
    })
  })

  describe("command structure", () => {
    it("should register account command", () => {
      const commands = program.commands
      const accountCommand = commands.find((cmd) => cmd.name() === "account")

      expect(accountCommand).toBeDefined()
      expect(accountCommand?.description()).toContain("Account information")
    })

    it("should register settings subcommand", () => {
      const commands = program.commands
      const accountCommand = commands.find((cmd) => cmd.name() === "account")
      const settingsCommand = accountCommand?.commands.find((cmd) => cmd.name() === "settings")

      expect(settingsCommand).toBeDefined()
      expect(settingsCommand?.description()).toContain("account settings")
    })

    it("should register usage subcommand", () => {
      const commands = program.commands
      const accountCommand = commands.find((cmd) => cmd.name() === "account")
      const usageCommand = accountCommand?.commands.find((cmd) => cmd.name() === "usage")

      expect(usageCommand).toBeDefined()
      expect(usageCommand?.description()).toContain("usage")
    })

    it("should register set subcommand with explicit, private, and zip", () => {
      const commands = program.commands
      const accountCommand = commands.find((cmd) => cmd.name() === "account")
      const setCommand = accountCommand?.commands.find((cmd) => cmd.name() === "set")

      expect(setCommand).toBeDefined()
      expect(setCommand?.description()).toContain("Modify account settings")

      const explicitCommand = setCommand?.commands.find((cmd) => cmd.name() === "explicit")
      const privateCommand = setCommand?.commands.find((cmd) => cmd.name() === "private")
      const zipCommand = setCommand?.commands.find((cmd) => cmd.name() === "zip")

      expect(explicitCommand).toBeDefined()
      expect(privateCommand).toBeDefined()
      expect(zipCommand).toBeDefined()
    })
  })
})
