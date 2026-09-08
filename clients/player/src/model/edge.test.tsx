import { describe, expect, it } from "vitest"
import {
  afterSync,
  failureReason,
  isPending,
  isRetryable,
  isSettled,
  loading,
  ready,
  type SyncOutcome,
  shownValue,
  syncReason,
  unavailable,
  unknown,
} from "./edge"

const outcome = (patch: Partial<SyncOutcome> = {}): SyncOutcome => ({
  offline: false,
  authRequired: false,
  deferred: 0,
  ...patch,
})

describe("having no answer yet is not the same as an empty answer", () => {
  it("separates never asked, asking, and genuinely empty", () => {
    const never = unknown<readonly string[]>()
    const asking = loading<readonly string[]>()
    const empty = ready<readonly string[]>([], "live")

    expect(isPending(never)).toBe(true)
    expect(isPending(asking)).toBe(true)
    expect(isPending(empty)).toBe(false)

    expect(isSettled(empty)).toBe(true)
    expect(shownValue(empty)).toEqual([])
    expect(shownValue(never)).toBeUndefined()
    expect(shownValue(asking)).toBeUndefined()
  })

  it("treats a failure with nothing kept as settled but with nothing to show", () => {
    const failed = unavailable<readonly string[]>({ kind: "offline" })
    expect(isSettled(failed)).toBe(true)
    expect(isPending(failed)).toBe(false)
    expect(shownValue(failed)).toBeUndefined()
  })
})

describe("a failed reconcile never discards what the device already had", () => {
  it("keeps the local library and states the reason when the network stopped", () => {
    const result = afterSync(["a", "b"], outcome({ offline: true }))
    expect(result.state).toBe("unavailable")
    expect(shownValue(result)).toEqual(["a", "b"])
    if (result.state === "unavailable") expect(result.reason).toEqual({ kind: "offline" })
  })

  it("marks data live after a clean reconcile", () => {
    const result = afterSync(["a"], outcome())
    expect(result).toEqual({ state: "ready", value: ["a"], freshness: "live" })
  })

  it("marks data stale when the reconcile ran but this domain did not arrive", () => {
    const result = afterSync(["a"], outcome(), true)
    expect(result).toEqual({ state: "ready", value: ["a"], freshness: "stale" })
  })
})

describe("the reason offered decides what the person is asked to do", () => {
  it("reports refused credentials ahead of being offline, because waiting cannot fix them", () => {
    expect(syncReason(outcome({ offline: true, authRequired: true }))).toEqual({
      kind: "auth-required",
    })
  })

  it("reports offline ahead of a generic failure", () => {
    expect(syncReason(outcome({ offline: true, failure: "boom" }))).toEqual({ kind: "offline" })
  })

  it("passes a specific failure through", () => {
    expect(syncReason(outcome({ failure: "boom" }))).toEqual({ kind: "failed", message: "boom" })
  })

  it("reports no reason for a clean sync", () => {
    expect(syncReason(outcome())).toBeUndefined()
  })
})

describe("a failure that can never succeed is not offered as a retry", () => {
  it("keeps the retryable bit instead of flattening both onto one reason", () => {
    expect(failureReason("database is down", true)).toEqual({
      kind: "failed",
      message: "database is down",
    })
    expect(failureReason("claims are disabled", false)).toEqual({
      kind: "permanent",
      message: "claims are disabled",
    })
    // The whole point: these must not be the same reason. Before this existed, a refusal
    // that could never succeed arrived as `failed` and was rendered as retry advice.
    expect(failureReason("x", true).kind).not.toBe(failureReason("x", false).kind)
  })

  it("offers a retry only where repeating the request could change the answer", () => {
    expect(isRetryable({ kind: "offline" })).toBe(true)
    expect(isRetryable({ kind: "failed", message: "boom" })).toBe(true)
    expect(isRetryable({ kind: "permanent", message: "boom" })).toBe(false)
    // Not a retry, and not nothing either. Pairing is the remedy, so this must not be
    // dressed up as a button that repeats the same failing read.
    expect(isRetryable({ kind: "auth-required" })).toBe(false)
  })

  it("still carries a message, so a permanent failure can say what went wrong", () => {
    const reason = failureReason("unsupported: claims are disabled", false)
    expect(reason.kind === "permanent" && reason.message).toBe("unsupported: claims are disabled")
  })
})

describe("optional retained data", () => {
  it("omits the key entirely rather than storing undefined", () => {
    expect(Object.hasOwn(unavailable<string>({ kind: "offline" }), "last")).toBe(false)
    expect(Object.hasOwn(unavailable({ kind: "offline" }, "kept"), "last")).toBe(true)
  })
})
