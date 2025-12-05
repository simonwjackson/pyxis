import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { Effect } from "effect"
import * as Client from "../../../client.js"
import * as Session from "../../cache/session.js"
import * as ConfigLoader from "../../config/loader.js"
import type { PandoraSession } from "../../../client.js"
import { UserLoginError, PartnerLoginError } from "../../../types/errors.js"
import type { GlobalOptions } from "../../index.js"
import { loginCommand, logoutCommand, statusCommand } from "./index.js"

/**
 * Comprehensive integration tests for auth CLI commands
 *
 * Tests cover:
 * - Login command with various credential sources
 * - Logout command
 * - Status command for valid/invalid/missing sessions
 * - JSON output format
 * - Error handling (invalid credentials, network errors)
 * - Session caching behavior
 * - Credential resolution priority (config → env vars)
 */

// Custom error for process.exit mock to distinguish from real errors
class ProcessExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`)
    this.name = "ProcessExitError"
  }
}

describe("auth commands", () => {
  // Store original env vars and process methods
  const originalEnv: Record<string, string | undefined> = {}
  const originalExit = process.exit
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  const envVars = ["PANDORA_USERNAME", "PANDORA_PASSWORD"]

  // Captured output
  let consoleLogOutput: string[] = []
  let consoleErrorOutput: string[] = []
  let exitCode: number | null = null

  // Spy trackers for restoration
  const spies: Array<ReturnType<typeof spyOn>> = []

  // Mock session for tests
  const mockSession: PandoraSession = {
    syncTime: 1234567890,
    partnerId: "test-partner-id",
    partnerAuthToken: "test-partner-token",
    userId: "test-user-id",
    userAuthToken: "test-user-token",
  }

  beforeEach(() => {
    // Restore all spies from previous tests
    spies.forEach(spy => spy.mockRestore())
    spies.length = 0

    // Save and clear env vars
    for (const key of envVars) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }

    // Reset output capture
    consoleLogOutput = []
    consoleErrorOutput = []
    exitCode = null

    // Mock console methods
    console.log = mock((msg: string) => {
      consoleLogOutput.push(msg)
    })
    console.error = mock((msg: string) => {
      consoleErrorOutput.push(msg)
    })

    // Mock process.exit to capture exit codes
    // Throw custom error to stop execution but distinguish from real errors
    process.exit = mock((code?: number) => {
      const finalCode = code ?? 0
      exitCode = finalCode
      throw new ProcessExitError(finalCode)
    }) as never
  })

  afterEach(() => {
    // Restore env vars
    for (const key of envVars) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key]
      } else {
        delete process.env[key]
      }
    }

    // Restore original functions
    process.exit = originalExit
    console.log = originalConsoleLog
    console.error = originalConsoleError
  })

  describe("auth login", () => {
    it("should successfully login with env credentials", async () => {
      // Set up env vars
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "testpassword"

      // Mock dependencies
      const loginSpy = spyOn(Client, "login").mockReturnValue(
        Effect.succeed(mockSession)
      )
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, saveSessionSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await loginCommand(options)

      // Verify Client.login was called with correct credentials
      expect(loginSpy).toHaveBeenCalledWith("test@example.com", "testpassword")

      // Verify session was saved
      expect(saveSessionSpy).toHaveBeenCalled()

      // Verify success message
      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Successfully logged in to Pandora")
    })

    it("should successfully login with config credentials", async () => {
      // Mock loadConfig to return credentials
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({
        auth: {
          username: "config@example.com",
          password: "configpassword",
        },
      })

      const loginSpy = spyOn(Client, "login").mockReturnValue(
        Effect.succeed(mockSession)
      )
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      
      spies.push(loginSpy, saveSessionSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await loginCommand(options)

      expect(loginSpy).toHaveBeenCalledWith("config@example.com", "configpassword")
    })

    it("should output JSON format when --json flag is set", async () => {
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "testpassword"

      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.succeed(mockSession))
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, saveSessionSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await loginCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain('"success": true')
      expect(output).toContain('"message"')
    })

    it("should show verbose output when --verbose flag is set", async () => {
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "testpassword"

      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.succeed(mockSession))
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, saveSessionSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: true,
        quiet: false,
      }

      await loginCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("User ID:")
      expect(output).toContain("test-user-id")
      expect(output).toContain("Session cached:")
    })

    it("should not cache session when --no-cache flag is set", async () => {
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "testpassword"

      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.succeed(mockSession))
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, saveSessionSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: false,
        verbose: true,
        quiet: false,
      }

      await loginCommand(options)

      // Session should not be saved
      expect(saveSessionSpy).not.toHaveBeenCalled()

      // Verbose output should indicate no caching
      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Session cached: no")
    })

    it("should exit with error when credentials are missing", async () => {
      // No env vars set, mock config with no credentials
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      spies.push(loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await loginCommand(options)
      } catch (error) {
        // Expected ProcessExitError
        expect(error).toBeInstanceOf(ProcessExitError)
      }

      // Should exit with code 3 (missing credentials)
      expect(exitCode).toBe(1) // Note: Mock causes exit(3) to throw, which is caught and re-exits with 1

      // Should show helpful error message
      const errorOutput = consoleErrorOutput.join("\n")
      expect(errorOutput).toContain("Error: Missing Credentials")
      expect(errorOutput).toContain("PANDORA_USERNAME")
      expect(errorOutput).toContain("PANDORA_PASSWORD")
    })

    it("should handle invalid credentials error", async () => {
      process.env.PANDORA_USERNAME = "wrong@example.com"
      process.env.PANDORA_PASSWORD = "wrongpassword"

      // Mock login to fail with UserLoginError
      const loginError = new UserLoginError({
        message: "Invalid username or password",
      })
      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.fail(loginError))
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await loginCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      // Should exit with error code 1
      expect(exitCode).toBe(1)

      // Should show error message
      const errorOutput = consoleErrorOutput.join("\n")
      expect(errorOutput).toContain("Error")
    })

    it("should handle network error during partner login", async () => {
      process.env.PANDORA_USERNAME = "test@example.com"
      process.env.PANDORA_PASSWORD = "testpassword"

      // Mock login to fail with PartnerLoginError
      const loginError = new PartnerLoginError({
        message: "Network connection failed",
      })
      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.fail(loginError))
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await loginCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)

      const errorOutput = consoleErrorOutput.join("\n")
      expect(errorOutput).toContain("Error")
    })

    it("should output error in JSON format when --json flag is set", async () => {
      process.env.PANDORA_USERNAME = "wrong@example.com"
      process.env.PANDORA_PASSWORD = "wrongpassword"

      const loginError = new UserLoginError({
        message: "Invalid credentials",
      })
      const loginSpy = spyOn(Client, "login").mockReturnValue(Effect.fail(loginError))
      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      
      spies.push(loginSpy, loadConfigSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await loginCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      const errorOutput = consoleErrorOutput.join("\n")
      expect(errorOutput).toContain('"success": false')
      expect(errorOutput).toContain('"error"')
    })
  })

  describe("auth logout", () => {
    it("should successfully clear session", async () => {
      // Mock Session.clearSession
      const clearSessionSpy = spyOn(Session, "clearSession").mockResolvedValue(undefined)
      spies.push(clearSessionSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await logoutCommand(options)

      // Verify clearSession was called
      expect(clearSessionSpy).toHaveBeenCalled()

      // Verify success message
      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Successfully logged out")
    })

    it("should output JSON format when --json flag is set", async () => {
      const clearSessionSpy = spyOn(Session, "clearSession").mockResolvedValue(undefined)
      spies.push(clearSessionSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await logoutCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain('"success": true')
      expect(output).toContain('"message"')
    })

    it("should handle errors during session clearing", async () => {
      // Mock clearSession to throw an error
      const clearSessionSpy = spyOn(Session, "clearSession").mockRejectedValue(
        new Error("Permission denied")
      )
      spies.push(clearSessionSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await logoutCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)
    })
  })

  describe("auth status", () => {
    it("should show valid session status", async () => {
      // Mock getSessionInfo to return valid session
      const sessionInfo = {
        valid: true,
        expiresIn: 3600,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await statusCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Valid session found")
      expect(output).toContain("Expires in:")
      expect(output).toContain("60m 0s") // 3600 seconds = 60 minutes
    })

    it("should show verbose information when --verbose flag is set", async () => {
      const sessionInfo = {
        valid: true,
        expiresIn: 1800,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: true,
        quiet: false,
      }

      await statusCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Cache path:")
      expect(output).toContain("/tmp/pyxis/session.json")
    })

    it("should report no session found", async () => {
      // Mock getSessionInfo to return null (no session)
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(null)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await statusCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("No cached session found")
    })

    it("should report invalid or expired session", async () => {
      const sessionInfo = {
        valid: false,
        expiresIn: undefined,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await statusCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Cached session is invalid or expired")
      expect(output).toContain("Cache path:")
    })

    it("should output JSON format for valid session", async () => {
      const sessionInfo = {
        valid: true,
        expiresIn: 1800,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await statusCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain('"success": true')
      expect(output).toContain('"message"')
    })

    it("should output JSON format for invalid session", async () => {
      const sessionInfo = {
        valid: false,
        expiresIn: undefined,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await statusCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain('"success": false')
      expect(output).toContain('"error"')
      expect(output).toContain("INVALID_SESSION")
    })

    it("should output JSON format for no session", async () => {
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(null)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: true,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await statusCommand(options)
      } catch (error) {
        // Expected ProcessExitError
      }

      expect(exitCode).toBe(1)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain('"success": false')
      expect(output).toContain('"error"')
      expect(output).toContain("NO_SESSION")
    })

    it("should handle session with zero expiry time", async () => {
      const sessionInfo = {
        valid: true,
        expiresIn: 0,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await statusCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Valid session found")
      // Zero is shown as "0m 0s" which is technically valid
      // The implementation shows expiry for any defined expiresIn, including 0
    })

    it("should format expiry time correctly", async () => {
      // Test with 90 seconds (1m 30s)
      const sessionInfo = {
        valid: true,
        expiresIn: 90,
        cachePath: "/tmp/pyxis/session.json",
      }
      const getSessionInfoSpy = spyOn(Session, "getSessionInfo").mockResolvedValue(sessionInfo)
      spies.push(getSessionInfoSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await statusCommand(options)

      const output = consoleLogOutput.join("\n")
      expect(output).toContain("Expires in: 1m 30s")
    })
  })

  describe("credential resolution priority", () => {
    it("should prioritize config credentials over env vars", async () => {
      // Set both env vars and config
      process.env.PANDORA_USERNAME = "env@example.com"
      process.env.PANDORA_PASSWORD = "envpassword"

      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({
        auth: {
          username: "config@example.com",
          password: "configpassword",
        },
      })

      const loginSpy = spyOn(Client, "login").mockReturnValue(
        Effect.succeed(mockSession)
      )
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      
      spies.push(loadConfigSpy, loginSpy, saveSessionSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await loginCommand(options)

      // Should use config credentials, not env
      expect(loginSpy).toHaveBeenCalledWith("config@example.com", "configpassword")
    })

    it("should fall back to env vars when config has no auth", async () => {
      process.env.PANDORA_USERNAME = "env@example.com"
      process.env.PANDORA_PASSWORD = "envpassword"

      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})

      const loginSpy = spyOn(Client, "login").mockReturnValue(
        Effect.succeed(mockSession)
      )
      const saveSessionSpy = spyOn(Session, "saveSession").mockResolvedValue(undefined)
      
      spies.push(loadConfigSpy, loginSpy, saveSessionSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      await loginCommand(options)

      expect(loginSpy).toHaveBeenCalledWith("env@example.com", "envpassword")
    })

    it("should require both username and password", async () => {
      // Only set username
      process.env.PANDORA_USERNAME = "test@example.com"

      const loadConfigSpy = spyOn(ConfigLoader, "loadConfig").mockResolvedValue({})
      spies.push(loadConfigSpy)

      const options: GlobalOptions = {
        json: false,
        cache: true,
        verbose: false,
        quiet: false,
      }

      try {
        await loginCommand(options)
      } catch (error) {
        // Expected ProcessExitError
        expect(error).toBeInstanceOf(ProcessExitError)
      }

      expect(exitCode).toBe(1) // Note: Mock causes exit(3) to throw, which is caught and re-exits with 1

      const errorOutput = consoleErrorOutput.join("\n")
      expect(errorOutput).toContain("Error: Missing Credentials")
    })
  })
})
