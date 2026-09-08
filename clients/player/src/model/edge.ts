/// Edge states, in the type.
///
/// The prototypes repeatedly conflated "we have not asked yet" with "we asked and the
/// answer is nothing". Those are different sentences on screen: one is a skeleton, the
/// other says the library is empty. Making them different constructors means a screen
/// cannot render the wrong one by forgetting a flag.
///
/// This module is deliberately free of any worker, RPC or React import. It describes
/// shapes and maps between them. The binding owns every actual read.

/// Why data is not available. Each case implies a different offer to the person:
/// offline suggests waiting, auth-required suggests pairing again, failed suggests retry.
export type EdgeReason =
  | { readonly kind: "offline" }
  | { readonly kind: "auth-required" }
  | { readonly kind: "failed"; readonly message: string }

/// How much to trust what is being shown.
///
/// `local` is not a failure. A device that has never reconciled still holds real data the
/// person put there, and saying "stale" about it would be a lie.
export type Freshness =
  /// Reconciled with the server during this session.
  | "live"
  /// Read from this device only. No reconcile has been attempted yet.
  | "local"
  /// A reconcile was attempted and did not finish. This data predates it.
  | "stale"

/// Data that lives somewhere else.
///
/// `unavailable` carries `last` because going offline with a full library must not blank
/// the screen. Absence of `last` is itself meaningful: there is genuinely nothing to show.
export type Remote<T> =
  | { readonly state: "unknown" }
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly value: T; readonly freshness: Freshness }
  | { readonly state: "unavailable"; readonly reason: EdgeReason; readonly last?: T }

export const unknown = <T>(): Remote<T> => ({ state: "unknown" })
export const loading = <T>(): Remote<T> => ({ state: "loading" })
export const ready = <T>(value: T, freshness: Freshness = "local"): Remote<T> => ({
  state: "ready",
  value,
  freshness,
})
export const unavailable = <T>(reason: EdgeReason, last?: T): Remote<T> =>
  last === undefined ? { state: "unavailable", reason } : { state: "unavailable", reason, last }

/// The best value available to render, including data kept from before a failure.
/// Returns undefined only when there is truly nothing to show.
export function shownValue<T>(remote: Remote<T>): T | undefined {
  if (remote.state === "ready") return remote.value
  if (remote.state === "unavailable") return remote.last
  return undefined
}

/// True once the answer is known, even if the answer is a failure. Distinguishes a
/// skeleton from a real message.
export const isSettled = <T>(remote: Remote<T>): boolean =>
  remote.state === "ready" || remote.state === "unavailable"

/// True when the screen has nothing to draw and should say why it is waiting.
export const isPending = <T>(remote: Remote<T>): boolean =>
  remote.state === "unknown" || remote.state === "loading"

/// Structural mirror of the fields this layer needs from a worker sync report.
///
/// Declared rather than imported so the model never reaches for the worker. A real
/// `SyncReport` is assignable to it, and the binding performs that assignment, so a drift
/// in the worker's shape becomes a compile error at the seam instead of a silent mismap.
export interface SyncOutcome {
  readonly offline: boolean
  readonly authRequired: boolean
  readonly failure?: string
  readonly deferred: number
  readonly albumPullFailed?: boolean
  readonly sessionPullFailed?: boolean
}

/// The reason a sync did not deliver fresh data, or undefined when it did.
///
/// Order matters. Refused credentials are reported ahead of offline because waiting will
/// never fix them, and ahead of a generic failure because they have a specific remedy.
export function syncReason(outcome: SyncOutcome): EdgeReason | undefined {
  if (outcome.authRequired) return { kind: "auth-required" }
  if (outcome.offline) return { kind: "offline" }
  if (outcome.failure !== undefined) return { kind: "failed", message: outcome.failure }
  return undefined
}

/// Fold a completed sync into data already held locally.
///
/// A failed sync never discards data: it degrades freshness and reports the reason. This
/// is the offline-first rule expressed once, so no screen has to remember it.
export function afterSync<T>(local: T, outcome: SyncOutcome, domainFailed = false): Remote<T> {
  const reason = syncReason(outcome)
  if (reason !== undefined) return unavailable(reason, local)
  return ready(local, domainFailed ? "stale" : "live")
}
