import { describe, expect, it } from "vitest"
import type { DeviceClaimOutcome, RpcAuthGrant } from "../../../../contracts/generated/pyxis"
import {
  type AccountSettingsRecord,
  claimFailureReason,
  credentialFromSettings,
  deviceNameFrom,
  readClaimOutcome,
  readGrant,
  settingsFromCredential,
} from "./account"

const grant: RpcAuthGrant = {
  account: { id: "account-1", name: "Default", isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  device: { id: "device-1", name: "Firefox on Linux" },
  bearerToken: "token-1",
}

const settings: AccountSettingsRecord = {
  accountId: "account-1",
  accountName: "Default",
  accountIsDefault: true,
  accountCreatedAt: "2026-01-01T00:00:00Z",
  deviceId: "device-1",
  deviceName: "Firefox on Linux",
  bearerToken: "token-1",
}

describe("the core's answer to a claim keeps its meaning", () => {
  it("reads a grant into the credential the product holds", () => {
    const outcome: DeviceClaimOutcome = { status: "ready", value: grant }
    expect(readClaimOutcome(outcome)).toEqual({
      status: "granted",
      credential: {
        account: {
          id: "account-1",
          name: "Default",
          isDefault: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
        device: { id: "device-1", name: "Firefox on Linux" },
        token: "token-1",
      },
    })
  })

  it("keeps a refusal separate from a failure, because waiting cannot fix a refusal", () => {
    const refused: DeviceClaimOutcome = { status: "pairingRequired" }
    const broken: DeviceClaimOutcome = {
      status: "unavailable",
      value: { code: "internal", message: "database is down", retryable: true },
    }
    expect(readClaimOutcome(refused)).toEqual({ status: "pairingRequired" })
    expect(readClaimOutcome(broken)).toEqual({
      status: "unavailable",
      message: "internal: database is down",
      retryable: true,
    })
    // The distinction the reference client loses by throwing the same error for both.
    expect(readClaimOutcome(refused).status).not.toBe(readClaimOutcome(broken).status)
  })

  it("keeps whether a failure is worth retrying, so nobody has to parse a code string", () => {
    const permanent: DeviceClaimOutcome = {
      status: "unavailable",
      value: { code: "unsupported", message: "claims are disabled", retryable: false },
    }
    const result = readClaimOutcome(permanent)
    expect(result.status === "unavailable" && result.retryable).toBe(false)
  })
})

describe("a credential is only rebuilt from a complete grant", () => {
  it("reads every field back out of durable settings", () => {
    expect(credentialFromSettings(settings)).toEqual(readGrant(grant))
  })

  it("survives a round trip through the durable row", () => {
    const credential = readGrant(grant)
    expect(credentialFromSettings(settingsFromCredential(credential))).toEqual(credential)
  })

  it("refuses a half-written row rather than sending a request that cannot be authorised", () => {
    for (const field of Object.keys(settings) as (keyof AccountSettingsRecord)[]) {
      const partial = { ...settings }
      delete partial[field]
      expect(credentialFromSettings(partial), `missing ${field}`).toBeUndefined()
    }
  })

  it("has nothing to rebuild before the first claim", () => {
    expect(credentialFromSettings({})).toBeUndefined()
    // A device id alone is minted locally on first open and is not a credential.
    expect(credentialFromSettings({ deviceId: "device-1" })).toBeUndefined()
  })
})

describe("the network is trusted in one direction only", () => {
  it("calls it offline when the browser says so, because that much is true", () => {
    expect(claimFailureReason(false, "fetch failed")).toEqual({ kind: "offline" })
  })

  it("says what went wrong when the browser claims to be online, instead of guessing", () => {
    // An interface being up says nothing about the core being reachable, so this must not
    // silently become "offline" and advise waiting.
    expect(claimFailureReason(true, "fetch failed")).toEqual({
      kind: "failed",
      message: "fetch failed",
    })
  })
})

describe("the device name is a label a person reads", () => {
  it("says the browser and the machine when both are known", () => {
    expect(deviceNameFrom({ browser: "Firefox", platform: "Linux" })).toBe("Firefox on Linux")
  })

  it("says whichever half is known", () => {
    expect(deviceNameFrom({ browser: "Firefox" })).toBe("Firefox")
    expect(deviceNameFrom({ platform: "Linux" })).toBe("Linux")
  })

  it("admits to knowing nothing rather than inventing a fact about the hardware", () => {
    expect(deviceNameFrom({})).toBe("Browser")
    expect(deviceNameFrom({ browser: "  ", platform: "" })).toBe("Browser")
  })
})
