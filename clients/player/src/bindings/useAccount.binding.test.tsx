import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AccountSettingsRecord, ClaimResult, Credential } from "../model/account"
import { shownValue } from "../model/edge"
import { type AccountEdge, useAccount } from "./useAccount.binding"

const credential: Credential = {
  account: { id: "account-1", name: "Default", isDefault: true, createdAt: "2026-01-01T00:00:00Z" },
  device: { id: "device-1", name: "Firefox on Linux" },
  token: "token-1",
}

const held: AccountSettingsRecord = {
  accountId: "account-1",
  accountName: "Default",
  accountIsDefault: true,
  accountCreatedAt: "2026-01-01T00:00:00Z",
  deviceId: "device-1",
  deviceName: "Firefox on Linux",
  bearerToken: "token-1",
}

const granted: ClaimResult = { status: "granted", credential }

/// jsdom reports the browser as online. Both directions have to be exercised, because the
/// whole point is that they produce different advice.
const setOnline = (value: boolean) => {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true })
}
afterEach(() => setOnline(true))

interface Harness {
  readonly edge: AccountEdge
  claims: number
  written: AccountSettingsRecord | undefined
}

/// Built once per render, never inside the render callback. An edge rebuilt every render
/// changes identity, restarts the read, and claims without end.
const render = (patch: Partial<AccountEdge> = {}) => {
  const harness: Harness = { claims: 0, written: undefined, edge: undefined as never }
  const stable: AccountEdge = {
    open: async () => ({}),
    settings: async () => ({}),
    writeSettings: async (record) => {
      harness.written = record
      return record
    },
    claim: async () => granted,
    ...patch,
  }
  const counted: AccountEdge = {
    ...stable,
    claim: async (name) => {
      harness.claims += 1
      return stable.claim(name)
    },
  }
  Object.assign(harness, { edge: counted })
  return { harness, ...renderHook(() => useAccount(counted, "Firefox on Linux")) }
}

describe("a device with no credential asks for one", () => {
  it("claims under the name it was given and holds the granted credential", async () => {
    const { result, harness } = render()
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    const state = result.current.credential
    expect(state.state === "ready" && state.freshness).toBe("live")
    expect(shownValue(state)).toEqual(credential)
    expect(harness.claims).toBe(1)
    // Persisted so the next boot does not have to ask again.
    expect(harness.written?.bearerToken).toBe("token-1")
    expect(harness.written?.deviceName).toBe("Firefox on Linux")
    expect(result.current.persisted).toBe(true)
  })

  it("starts out having asked nothing, which is not the same as having no account", () => {
    const { result } = render()
    // Before any promise settles the answer is genuinely unknown, and a screen must be
    // able to tell that apart from a device that is known to be unclaimed.
    expect(["unknown", "loading"]).toContain(result.current.credential.state)
    expect(shownValue(result.current.credential)).toBeUndefined()
  })
})

describe("a device that already holds a credential is signed in", () => {
  it("uses the held credential without asking the core at all", async () => {
    const { result, harness } = render({ settings: async () => held })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    const state = result.current.credential
    expect(state.state === "ready" && state.freshness).toBe("local")
    expect(shownValue(state)).toEqual(credential)
    // Not a mock assertion for its own sake: this is the cold offline boot. Asking the
    // core here would put an RPC timeout between a person and their music.
    expect(harness.claims).toBe(0)
  })

  it("stays signed in when the core cannot be reached", async () => {
    setOnline(false)
    const { result } = render({
      settings: async () => held,
      claim: async () => {
        throw new Error("fetch failed")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    // A network hiccup is not a sign-out.
    expect(shownValue(result.current.credential)).toEqual(credential)
  })
})

describe("a refusal is not a failure to retry", () => {
  it("asks for pairing when the core refuses to grant a credential", async () => {
    const { result } = render({ claim: async () => ({ status: "pairingRequired" }) })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({ kind: "auth-required" })
  })

  it("does not hand back a credential the core has just refused", async () => {
    const { result } = render({
      settings: async () => held,
      claim: async () => ({ status: "pairingRequired" }),
    })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    act(() => {
      result.current.reclaim()
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({ kind: "auth-required" })
    // Offering the refused credential back would loop against the same refusal instead of
    // asking the person to pair.
    expect(shownValue(state)).toBeUndefined()
    expect(result.current.persisted).toBe(false)
  })

  it("reports a core failure with what the core said, not as a network problem", async () => {
    const { result } = render({
      claim: async () => ({
        status: "unavailable",
        message: "internal: database is down",
        retryable: true,
      }),
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({
      kind: "failed",
      message: "internal: database is down",
    })
  })
})

describe("a first claim that cannot reach the core", () => {
  it("advises waiting when the browser knows it is offline", async () => {
    setOnline(false)
    const { result } = render({
      claim: async () => {
        throw new Error("fetch failed")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({ kind: "offline" })
  })

  it("says what went wrong when the browser believes it is online", async () => {
    const { result } = render({
      claim: async () => {
        throw new Error("fetch failed")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({
      kind: "failed",
      message: "fetch failed",
    })
  })

  it("keeps an older credential alive when a forced reclaim cannot finish", async () => {
    setOnline(false)
    const { result } = render({
      settings: async () => held,
      claim: async () => {
        throw new Error("fetch failed")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    act(() => {
      result.current.reclaim()
    })
    await waitFor(() => {
      const state = result.current.credential
      expect(state.state === "ready" && state.freshness).toBe("stale")
    })
    // Degraded, not discarded: a reclaim that never reached the core is no reason to throw
    // away a credential that still works.
    expect(shownValue(result.current.credential)).toEqual(credential)
  })
})

describe("storage faults are reported, not fatal", () => {
  it("reports a failure when the store cannot be opened", async () => {
    const { result } = render({
      open: async () => {
        throw new Error("worker unavailable")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    const state = result.current.credential
    expect(state.state === "unavailable" && state.reason).toEqual({
      kind: "failed",
      message: "worker unavailable",
    })
    expect(result.current.persisted).toBe(false)
  })

  it("reports a failure when the held credential cannot be read", async () => {
    const { result } = render({
      settings: async () => {
        throw new Error("database closed")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("unavailable"))
    expect(shownValue(result.current.credential)).toBeUndefined()
  })

  it("keeps a working credential that could not be written down", async () => {
    const { result } = render({
      writeSettings: async () => {
        throw new Error("quota exceeded")
      },
    })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    // Usable now, gone after a reload. Discarding it would be the worse of the two.
    expect(shownValue(result.current.credential)).toEqual(credential)
    expect(result.current.persisted).toBe(false)
  })

  it("does not promise the credential will survive an ephemeral store", async () => {
    const { result } = render({ open: async () => ({ ephemeral: true }) })
    await waitFor(() => expect(result.current.credential.state).toBe("ready"))
    expect(shownValue(result.current.credential)).toEqual(credential)
    expect(result.current.persisted).toBe(false)
  })
})
