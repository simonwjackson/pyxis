import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test"
import {
  getExitCode,
  formatCliError,
  handleEffectError,
  EXIT_CODE,
} from "./handler.js"
import {
  EncryptionError,
  DecryptionError,
  PartnerLoginError,
  UserLoginError,
  ApiCallError,
  ConfigError,
  NotFoundError,
  SessionError,
} from "../../types/errors.js"

describe("CLI Error Handler", () => {
  describe("getExitCode", () => {
    it("should return GENERAL_ERROR for EncryptionError", () => {
      const error = new EncryptionError({ message: "Encryption failed" })
      expect(getExitCode(error)).toBe(EXIT_CODE.GENERAL_ERROR)
    })

    it("should return GENERAL_ERROR for DecryptionError", () => {
      const error = new DecryptionError({ message: "Decryption failed" })
      expect(getExitCode(error)).toBe(EXIT_CODE.GENERAL_ERROR)
    })

    it("should return NETWORK_ERROR for PartnerLoginError", () => {
      const error = new PartnerLoginError({ message: "Partner login failed" })
      expect(getExitCode(error)).toBe(EXIT_CODE.NETWORK_ERROR)
    })

    it("should return AUTH_FAILED for UserLoginError", () => {
      const error = new UserLoginError({ message: "User login failed" })
      expect(getExitCode(error)).toBe(EXIT_CODE.AUTH_FAILED)
    })

    it("should return API_ERROR for ApiCallError", () => {
      const error = new ApiCallError({
        method: "user.getStations",
        message: "API call failed",
      })
      expect(getExitCode(error)).toBe(EXIT_CODE.API_ERROR)
    })

    it("should return CONFIG_ERROR for ConfigError", () => {
      const error = new ConfigError({ message: "Config not found" })
      expect(getExitCode(error)).toBe(EXIT_CODE.CONFIG_ERROR)
    })

    it("should return RESOURCE_NOT_FOUND for NotFoundError", () => {
      const error = new NotFoundError({ message: "Resource not found" })
      expect(getExitCode(error)).toBe(EXIT_CODE.RESOURCE_NOT_FOUND)
    })

    it("should return AUTH_FAILED for SessionError", () => {
      const error = new SessionError({ message: "Session required" })
      expect(getExitCode(error)).toBe(EXIT_CODE.AUTH_FAILED)
    })
  })

  describe("formatCliError - Human Readable Format", () => {
    it("should format EncryptionError with title and hints", () => {
      const error = new EncryptionError({ message: "Failed to encrypt data" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Encryption Failed")
      expect(output).toContain("Internal cryptographic operation failed")
      expect(output).toContain("This is likely a bug")
      expect(output).not.toContain("Debug Information")
    })

    it("should format DecryptionError with title and hints", () => {
      const error = new DecryptionError({ message: "Failed to decrypt data" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Decryption Failed")
      expect(output).toContain("Internal cryptographic operation failed")
    })

    it("should format UserLoginError with helpful hints", () => {
      const error = new UserLoginError({ message: "Invalid credentials" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Authentication Failed")
      expect(output).toContain("Invalid username or password")
      expect(output).toContain("pandora config init --force")
    })

    it("should format PartnerLoginError with network hints", () => {
      const error = new PartnerLoginError({ message: "Connection failed" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Partner Authentication Failed")
      expect(output).toContain("Failed to establish connection with Pandora servers")
      expect(output).toContain("temporary network issue")
    })

    it("should format ConfigError with init hint", () => {
      const error = new ConfigError({ message: "Config file missing" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Configuration Error")
      expect(output).toContain("configuration file appears to be missing")
      expect(output).toContain("pandora config init")
    })

    it("should format ApiCallError with method name", () => {
      const error = new ApiCallError({
        method: "station.getPlaylist",
        message: "Request failed",
      })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: API Call Failed")
      expect(output).toContain("station.getPlaylist")
      expect(output).toContain("Network connectivity issues")
    })

    it("should format NotFoundError with verification hints", () => {
      const error = new NotFoundError({ message: "Station not found" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Resource Not Found")
      expect(output).toContain("resource could not be found")
      expect(output).toContain("resource ID or name is correct")
    })

    it("should format SessionError with login hint", () => {
      const error = new SessionError({ message: "Not logged in" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Error: Session Required")
      expect(output).toContain("need to be logged in")
      expect(output).toContain("pandora auth login")
    })
  })

  describe("formatCliError - Verbose Mode", () => {
    it("should include debug information in verbose mode", () => {
      const error = new EncryptionError({ message: "Test error message" })
      const output = formatCliError(error, { verbose: true, json: false })

      expect(output).toContain("Debug Information:")
      expect(output).toContain("Error Type: EncryptionError")
      expect(output).toContain("Message: Test error message")
    })

    it("should include cause in verbose mode when present", () => {
      const cause = new Error("Underlying error")
      const error = new EncryptionError({
        message: "Encryption failed",
        cause,
      })
      const output = formatCliError(error, { verbose: true, json: false })

      expect(output).toContain("Debug Information:")
      expect(output).toContain("Cause:")
      expect(output).toContain("Underlying error")
    })

    it("should include API method in verbose mode for ApiCallError", () => {
      const error = new ApiCallError({
        method: "user.createStation",
        message: "API error",
      })
      const output = formatCliError(error, { verbose: true, json: false })

      expect(output).toContain("Debug Information:")
      expect(output).toContain("API Method: user.createStation")
    })

    it("should not include cause when not present", () => {
      const error = new UserLoginError({ message: "Auth failed" })
      const output = formatCliError(error, { verbose: true, json: false })

      expect(output).toContain("Debug Information:")
      expect(output).not.toContain("Cause:")
    })
  })

  describe("formatCliError - JSON Format", () => {
    it("should format EncryptionError as JSON", () => {
      const error = new EncryptionError({ message: "Test encryption error" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.success).toBe(false)
      expect(parsed.error.code).toBe("ENCRYPTION_ERROR")
      expect(parsed.error.message).toBe("Encryption Failed")
      expect(parsed.error.details).toBe("Test encryption error")
      expect(parsed.error.method).toBeUndefined()
    })

    it("should format DecryptionError as JSON", () => {
      const error = new DecryptionError({ message: "Test decryption error" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.success).toBe(false)
      expect(parsed.error.code).toBe("DECRYPTION_ERROR")
      expect(parsed.error.message).toBe("Decryption Failed")
    })

    it("should format UserLoginError as JSON", () => {
      const error = new UserLoginError({ message: "Invalid password" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("AUTH_INVALID_CREDENTIALS")
      expect(parsed.error.message).toBe("Authentication Failed")
    })

    it("should format PartnerLoginError as JSON", () => {
      const error = new PartnerLoginError({ message: "Network error" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("PARTNER_LOGIN_FAILED")
    })

    it("should format ApiCallError as JSON with method", () => {
      const error = new ApiCallError({
        method: "station.deleteFeedback",
        message: "Request timeout",
      })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("API_CALL_FAILED")
      expect(parsed.error.method).toBe("station.deleteFeedback")
      expect(parsed.error.details).toBe("Request timeout")
    })

    it("should format ConfigError as JSON", () => {
      const error = new ConfigError({ message: "Missing config" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("CONFIG_ERROR")
    })

    it("should format NotFoundError as JSON", () => {
      const error = new NotFoundError({ message: "Station not found" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("NOT_FOUND")
    })

    it("should format SessionError as JSON", () => {
      const error = new SessionError({ message: "Auth required" })
      const output = formatCliError(error, { verbose: false, json: true })

      const parsed = JSON.parse(output)
      expect(parsed.error.code).toBe("SESSION_ERROR")
    })

    it("should ignore verbose flag in JSON mode", () => {
      const error = new EncryptionError({
        message: "Test",
        cause: new Error("Cause"),
      })
      const output = formatCliError(error, { verbose: true, json: true })

      const parsed = JSON.parse(output)
      // Verbose data should not be in JSON output
      expect(parsed.error).not.toHaveProperty("cause")
      expect(parsed.error).not.toHaveProperty("_tag")
      expect(parsed.error.details).toBe("Test")
    })
  })

  describe("handleEffectError", () => {
    let consoleErrorSpy: ReturnType<typeof spyOn>
    let processExitSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      processExitSpy = spyOn(process, "exit").mockImplementation(
        (() => {}) as never
      )
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
      processExitSpy.mockRestore()
    })

    it("should handle PandoraError and exit with correct code", () => {
      const error = new UserLoginError({ message: "Auth failed" })

      handleEffectError(error, { verbose: false, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.AUTH_FAILED)

      const calls = consoleErrorSpy.mock.calls
      const output = calls.map((c) => c[0]).join("\n")
      expect(output).toContain("Error: Authentication Failed")
    })

    it("should handle PandoraError in JSON mode", () => {
      const error = new ConfigError({ message: "Config missing" })

      handleEffectError(error, { verbose: false, json: true })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.CONFIG_ERROR)

      // For JSON mode, the output should be in the first (and typically only) call
      const jsonOutput = consoleErrorSpy.mock.calls[0][0]
      const parsed = JSON.parse(jsonOutput)
      expect(parsed.error.code).toBe("CONFIG_ERROR")
    })

    it("should handle PandoraError in verbose mode", () => {
      const error = new ApiCallError({
        method: "test.method",
        message: "Failed",
        cause: new Error("Network error"),
      })

      handleEffectError(error, { verbose: true, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.API_ERROR)

      const calls = consoleErrorSpy.mock.calls
      const output = calls.map((c) => c[0]).join("\n")
      expect(output).toContain("Debug Information:")
      expect(output).toContain("API Method: test.method")
      expect(output).toContain("Network error")
    })

    it("should handle unknown error in human-readable mode", () => {
      const error = new Error("Unknown error")

      handleEffectError(error, { verbose: false, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR)

      // Should contain unknown error message
      const calls = consoleErrorSpy.mock.calls
      const output = calls.map((c) => c[0]).join("\n")
      expect(output).toContain("Error: Unknown Error")
      expect(output).toContain("Unknown error")
    })

    it("should handle unknown error in JSON mode", () => {
      const error = new Error("Unexpected error")

      handleEffectError(error, { verbose: false, json: true })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR)

      const jsonOutput = consoleErrorSpy.mock.calls[0][0]
      const parsed = JSON.parse(jsonOutput)
      expect(parsed.success).toBe(false)
      expect(parsed.error.code).toBe("UNKNOWN_ERROR")
      expect(parsed.error.message).toBe("Unknown Error")
      expect(parsed.error.details).toContain("Unexpected error")
    })

    it("should include stack trace for unknown errors in verbose mode", () => {
      const error = new Error("Error with stack")

      handleEffectError(error, { verbose: true, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR)

      const calls = consoleErrorSpy.mock.calls
      const output = calls.map((c) => c[0]).join("\n")
      expect(output).toContain("Stack trace:")
    })

    it("should handle non-Error objects", () => {
      const error = "String error"

      handleEffectError(error, { verbose: false, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR)

      const calls = consoleErrorSpy.mock.calls
      const output = calls.map((c) => c[0]).join("\n")
      expect(output).toContain("String error")
    })

    it("should handle null/undefined errors", () => {
      handleEffectError(null, { verbose: false, json: false })

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(processExitSpy).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR)
    })

    it("should handle errors with all different exit codes", () => {
      const testCases = [
        { error: new EncryptionError({ message: "E" }), code: EXIT_CODE.GENERAL_ERROR },
        { error: new DecryptionError({ message: "D" }), code: EXIT_CODE.GENERAL_ERROR },
        { error: new PartnerLoginError({ message: "P" }), code: EXIT_CODE.NETWORK_ERROR },
        { error: new UserLoginError({ message: "U" }), code: EXIT_CODE.AUTH_FAILED },
        { error: new ApiCallError({ method: "m", message: "A" }), code: EXIT_CODE.API_ERROR },
        { error: new ConfigError({ message: "C" }), code: EXIT_CODE.CONFIG_ERROR },
        { error: new NotFoundError({ message: "N" }), code: EXIT_CODE.RESOURCE_NOT_FOUND },
        { error: new SessionError({ message: "S" }), code: EXIT_CODE.AUTH_FAILED },
      ]

      for (const { error, code } of testCases) {
        processExitSpy.mockClear()
        consoleErrorSpy.mockClear()

        handleEffectError(error, { verbose: false, json: false })

        expect(processExitSpy).toHaveBeenCalledWith(code)
      }
    })
  })

  describe("Error Hints and Suggestions", () => {
    it("should provide specific hints for UserLoginError", () => {
      const error = new UserLoginError({ message: "Bad credentials" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Invalid username or password")
      expect(output).toContain("check your credentials")
      expect(output).toContain("pandora config init --force")
    })

    it("should provide network troubleshooting for PartnerLoginError", () => {
      const error = new PartnerLoginError({ message: "Connection refused" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("temporary network issue")
      expect(output).toContain("Pandora service disruption")
      expect(output).toContain("try again")
    })

    it("should provide config init instructions for ConfigError", () => {
      const error = new ConfigError({ message: "No config" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("Create a new configuration:")
      expect(output).toContain("pandora config init")
    })

    it("should provide API-specific hints for ApiCallError", () => {
      const error = new ApiCallError({
        method: "track.addMusic",
        message: "Failed",
      })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("track.addMusic")
      expect(output).toContain("Network connectivity issues")
      expect(output).toContain("Pandora API changes")
      expect(output).toContain("Invalid request parameters")
    })

    it("should provide bug report instructions for crypto errors", () => {
      const error = new EncryptionError({ message: "Crypto fail" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("likely a bug")
      expect(output).toContain("report this issue")
      expect(output).toContain("--verbose flag")
    })

    it("should provide login instructions for SessionError", () => {
      const error = new SessionError({ message: "No session" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("need to be logged in")
      expect(output).toContain("pandora auth login")
    })

    it("should provide verification hints for NotFoundError", () => {
      const error = new NotFoundError({ message: "Missing resource" })
      const output = formatCliError(error, { verbose: false, json: false })

      expect(output).toContain("resource ID or name is correct")
      expect(output).toContain("access to this resource")
    })
  })

  describe("Exit Code Constants", () => {
    it("should have correct exit code values", () => {
      expect(EXIT_CODE.SUCCESS).toBe(0)
      expect(EXIT_CODE.GENERAL_ERROR).toBe(1)
      expect(EXIT_CODE.INVALID_ARGUMENTS).toBe(2)
      expect(EXIT_CODE.AUTH_FAILED).toBe(3)
      expect(EXIT_CODE.NETWORK_ERROR).toBe(4)
      expect(EXIT_CODE.CONFIG_ERROR).toBe(5)
      expect(EXIT_CODE.RESOURCE_NOT_FOUND).toBe(6)
      expect(EXIT_CODE.API_ERROR).toBe(7)
    })
  })
})
