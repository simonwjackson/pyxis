/// The device credential's only state reader.
///
/// Nothing else in the product works until this does: every call to the core carries the
/// token this file holds. It opens the durable store, reads a credential already granted,
/// and only asks the core for a new one when there is none.
///
/// The reading order is offline-first, and here that matters more than anywhere else. A
/// device that already holds a credential is authenticated, full stop. Making it wait for
/// the network to confirm what it already knows would sign people out for the length of a
/// timeout every time their connection hiccuped.

import { useCallback, useEffect, useRef, useState } from "react"
import type { WorkerClient } from "../../../app/src/worker/client.ts"
import {
  type AccountSettingsRecord,
  type ClaimResult,
  type Credential,
  claimFailureReason,
  credentialFromSettings,
  settingsFromCredential,
} from "../model/account"
import { type EdgeReason, loading, type Remote, ready, unavailable, unknown } from "../model/edge"

/// The durable half of the edge: where a granted credential is kept.
export interface AccountStore {
  open(): Promise<{ readonly ephemeral?: boolean }>
  settings(): Promise<AccountSettingsRecord>
  writeSettings(patch: AccountSettingsRecord): Promise<AccountSettingsRecord>
}

/// The full edge this binding needs.
///
/// `claim` is separate from the store on purpose. Persistence lives in the worker and the
/// claim is a call to the core, so joining them here would suggest the worker performs
/// device claims, which it does not.
///
/// Callers must pass a stable reference. The read restarts when this identity changes,
/// which is right for a genuine change of edge and wrong for an object rebuilt every
/// render: the latter claims without end.
export interface AccountEdge extends AccountStore {
  claim(name: string): Promise<ClaimResult>
}

/// Proof that the real worker client can keep the credential.
///
/// Written so a mismatch is an error: a conditional yielding `never` would satisfy
/// `extends true` and prove nothing, because `never` is assignable to everything. Yielding
/// `false` is what makes the check bite. Type-level only; emits nothing.
type Assert<T extends true> = T
export type AccountStoreIsSatisfiedByWorkerClient = Assert<
  WorkerClient extends AccountStore ? true : false
>

export interface AccountBinding {
  /// The credential, with how much it is trusted.
  ///
  /// `ready` with `live` was granted during this session. `ready` with `local` was read
  /// from this device and has not been confirmed, which is the normal state of a returning
  /// device and is not a problem. `ready` with `stale` means a fresh claim was attempted
  /// and did not finish, so the older credential is still being used.
  ///
  /// `unavailable` with `auth-required` means the core refused, and no amount of waiting
  /// will change it: a person has to pair this device.
  readonly credential: Remote<Credential>
  /// Whether the credential will still be here after a reload. False when the store is
  /// ephemeral, or when writing it back failed. The credential is usable either way.
  readonly persisted: boolean
  /// Re-read the held credential, claiming only if there is none.
  readonly refresh: () => void
  /// Claim again from scratch, discarding a credential the core has refused. Without this
  /// a refused device is a dead end, because the ordinary read short-circuits on the
  /// credential that is being refused.
  readonly reclaim: () => void
}

export function useAccount(edge: AccountEdge, deviceName: string): AccountBinding {
  const [credential, setCredential] = useState<Remote<Credential>>(unknown<Credential>)
  const [persisted, setPersisted] = useState(false)

  /// Guards against a slow earlier read overwriting a newer one, and cancels in-flight
  /// work on unmount so a late claim cannot write a credential into a dead tree.
  const generation = useRef(0)

  const run = useCallback(
    async (force: boolean) => {
      generation.current += 1
      const mine = generation.current
      const current = () => generation.current === mine
      setCredential(loading<Credential>())

      let ephemeral = false
      try {
        const report = await edge.open()
        if (!current()) return
        // An ephemeral store keeps nothing after the page closes. The credential still
        // works right now, so this is reported rather than treated as a failure.
        ephemeral = report.ephemeral === true
      } catch (cause) {
        if (!current()) return
        setPersisted(false)
        setCredential(unavailable({ kind: "failed", message: message(cause) }))
        return
      }

      let held: Credential | undefined
      try {
        held = credentialFromSettings(await edge.settings())
        if (!current()) return
      } catch (cause) {
        if (!current()) return
        setPersisted(false)
        setCredential(unavailable({ kind: "failed", message: message(cause) }))
        return
      }

      if (held !== undefined && !force) {
        // Published before any network call. This is the cold offline boot: the credential
        // is on disk, so the person is signed in, and an RPC timeout must not stand
        // between them and their music.
        setPersisted(!ephemeral)
        setCredential(ready(held, "local"))
        return
      }

      /// Keep an older credential alive when a fresh claim could not be completed, but
      /// never when the core refused: a refused credential will be refused again, and
      /// offering it back would loop instead of asking the person to pair.
      const fallBack = (reason: EdgeReason) => {
        if (reason.kind !== "auth-required" && held !== undefined) {
          setPersisted(!ephemeral)
          setCredential(ready(held, "stale"))
          return
        }
        setPersisted(false)
        setCredential(unavailable(reason))
      }

      let result: ClaimResult
      try {
        result = await edge.claim(deviceName)
        if (!current()) return
      } catch (cause) {
        if (!current()) return
        fallBack(claimFailureReason(isOnline(), message(cause)))
        return
      }

      if (result.status === "pairingRequired") {
        fallBack({ kind: "auth-required" })
        return
      }
      if (result.status === "unavailable") {
        // The core said whether this can ever succeed. Passing it on is what stops the screen
        // offering a retry that is guaranteed to fail.
        fallBack(claimFailureReason(isOnline(), result.message, result.retryable))
        return
      }

      const granted = result.credential
      try {
        await edge.writeSettings(settingsFromCredential(granted))
        if (!current()) return
        setPersisted(!ephemeral)
      } catch {
        if (!current()) return
        // The credential is real and usable for this session; it simply will not survive a
        // reload. Discarding a working credential over a storage fault would be the worse
        // of the two failures, so it is reported instead.
        setPersisted(false)
      }
      if (!current()) return
      setCredential(ready(granted, "live"))
    },
    [edge, deviceName],
  )

  useEffect(() => {
    void run(false)
    return () => {
      generation.current += 1
    }
  }, [run])

  const refresh = useCallback(() => {
    void run(false)
  }, [run])
  const reclaim = useCallback(() => {
    void run(true)
  }, [run])

  return { credential, persisted, refresh, reclaim }
}

/// Trusted in one direction. A browser saying it is offline is telling the truth; a
/// browser saying it is online has only established that an interface is up.
function isOnline(): boolean {
  return globalThis.navigator?.onLine ?? true
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
