import { describe, expect, test, vi } from "vitest"
import { registerPwa } from "./register"

describe("PWA registration", () => {
  test("registers a module worker without HTTP cache reuse", async () => {
    const registration = {} as ServiceWorkerRegistration
    const register = vi.fn(async () => registration)

    await expect(registerPwa({ register })).resolves.toBe(registration)

    expect(register).toHaveBeenCalledWith("/service-worker.js", {
      scope: "/",
      type: "module",
      updateViaCache: "none",
    })
  })

  test("does nothing where service workers are unavailable", async () => {
    await expect(registerPwa(undefined)).resolves.toBeUndefined()
  })

  test("keeps the online app usable if registration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const register = vi.fn(async () => {
      throw new Error("blocked")
    })

    await expect(registerPwa({ register })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
