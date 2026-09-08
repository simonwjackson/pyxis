/// The account and this device's credential, as a screen needs them.
///
/// One account. The core creates a default account on first boot and this client claims
/// onto it; there is no account list, no switcher and no account id threaded through the
/// product, because multi-account does not exist yet and plumbing for it would be building
/// a feature nobody can use.
///
/// Like the rest of `model/`, this file is free of React, worker and transport imports. It
/// describes shapes and maps between them. The binding owns every actual read.

import type { DeviceClaimOutcome, RpcAuthGrant } from "../../../../contracts/generated/pyxis"
import { type EdgeReason, failureReason } from "./edge"

/// The account this device belongs to.
export interface AccountIdentity {
  readonly id: string
  readonly name: string
  /// True for the account the core creates on first boot. Exactly one carries this.
  readonly isDefault: boolean
  readonly createdAt: string
}

/// This device, as the account knows it.
///
/// `id` is minted locally once and never re-minted, because listen events and session
/// ownership are attributed to it. `name` is only a label a person reads when choosing
/// where to play, and it is safe to change.
export interface DeviceIdentity {
  readonly id: string
  readonly name: string
}

/// Proof that this device may talk to the core, and who it is when it does.
export interface Credential {
  readonly account: AccountIdentity
  readonly device: DeviceIdentity
  /// Returned by the core exactly once and held from then on.
  readonly token: string
}

/// The fields this layer needs from the durable settings row.
///
/// Declared structurally rather than imported so the model never reaches for the worker. A
/// real `WorkerSettings` is assignable to it, and the binding performs that assignment, so
/// a drift in the worker's shape becomes a compile error at the seam.
export interface AccountSettingsRecord {
  readonly deviceId?: string
  readonly deviceName?: string
  readonly accountId?: string
  readonly accountName?: string
  readonly accountIsDefault?: boolean
  readonly accountCreatedAt?: string
  readonly bearerToken?: string
}

/// What the core said when this device asked to join.
///
/// `pairingRequired` is not a failure to retry. The core is refusing to hand a credential
/// to a device that just asks, and it will keep refusing until a person pairs it. Folding
/// it into a generic error, as the reference client does, turns a solvable situation into
/// an unexplained one.
///
/// `retryable` is carried rather than dropped. The contract provides it so a client can
/// tell a temporary fault from a permanent one without parsing code strings, and throwing
/// it away here would force exactly the string parsing it exists to prevent.
export type ClaimResult =
  | { readonly status: "granted"; readonly credential: Credential }
  | { readonly status: "pairingRequired" }
  | { readonly status: "unavailable"; readonly message: string; readonly retryable: boolean }

export function readGrant(grant: RpcAuthGrant): Credential {
  return {
    account: {
      id: grant.account.id,
      name: grant.account.name,
      isDefault: grant.account.isDefault,
      createdAt: grant.account.createdAt,
    },
    device: { id: grant.device.id, name: grant.device.name },
    token: grant.bearerToken,
  }
}

/// Read the core's answer to a claim.
///
/// The switch is exhaustive by construction: a status added to the contract fails this
/// file to compile rather than falling through to a default that guesses.
export function readClaimOutcome(outcome: DeviceClaimOutcome): ClaimResult {
  switch (outcome.status) {
    case "ready":
      return { status: "granted", credential: readGrant(outcome.value) }
    case "pairingRequired":
      return { status: "pairingRequired" }
    case "unavailable":
      return {
        status: "unavailable",
        message: `${outcome.value.code}: ${outcome.value.message}`,
        retryable: outcome.value.retryable,
      }
    default: {
      const unhandled: never = outcome
      throw new Error(`unhandled claim outcome ${JSON.stringify(unhandled)}`)
    }
  }
}

/// Rebuild the held credential from durable settings.
///
/// Every field is required. A half-written grant is not a weaker credential, it is not a
/// credential, and treating a partial row as usable would send a request that cannot be
/// authorised and report it as a network problem.
export function credentialFromSettings(settings: AccountSettingsRecord): Credential | undefined {
  const {
    accountId,
    accountName,
    accountIsDefault,
    accountCreatedAt,
    deviceId,
    deviceName,
    bearerToken,
  } = settings
  if (
    accountId === undefined ||
    accountName === undefined ||
    accountIsDefault === undefined ||
    accountCreatedAt === undefined ||
    deviceId === undefined ||
    deviceName === undefined ||
    bearerToken === undefined
  ) {
    return undefined
  }
  return {
    account: {
      id: accountId,
      name: accountName,
      isDefault: accountIsDefault,
      createdAt: accountCreatedAt,
    },
    device: { id: deviceId, name: deviceName },
    token: bearerToken,
  }
}

/// The durable row for a credential, ready to persist.
export function settingsFromCredential(credential: Credential): AccountSettingsRecord {
  return {
    accountId: credential.account.id,
    accountName: credential.account.name,
    accountIsDefault: credential.account.isDefault,
    accountCreatedAt: credential.account.createdAt,
    deviceId: credential.device.id,
    deviceName: credential.device.name,
    bearerToken: credential.token,
  }
}

/// Why a claim did not produce a credential.
///
/// `online` is trusted in one direction only. A browser reporting that it is offline is
/// telling the truth and waiting is the right advice; a browser reporting that it is
/// online has only established that an interface is up, which says nothing about the core
/// being reachable. So a false means offline, and a true means we genuinely do not know
/// and must say what went wrong instead of guessing at the network.
/// `retryable` comes from the core's own failure envelope, which carries it so a client can
/// tell a temporary fault from a permanent one without parsing code strings. Defaulting to
/// true keeps the cautious answer for callers that genuinely do not know: inviting a retry
/// that fails is a smaller harm than refusing one that would have worked.
export function claimFailureReason(online: boolean, message: string, retryable = true): EdgeReason {
  return online ? failureReason(message, retryable) : { kind: "offline" }
}

/// What to call this device in the account.
///
/// A label, not an identity, and deliberately dull. It is read by a person deciding where
/// to play something, so it should say what they would say: the browser they are in and
/// the machine they are at. Hints are passed in rather than read here, because a model
/// that reads `navigator` stops being testable and starts being a second state reader.
export interface DeviceNameHints {
  readonly browser?: string
  readonly platform?: string
}

export function deviceNameFrom(hints: DeviceNameHints): string {
  const browser = hints.browser?.trim()
  const platform = hints.platform?.trim()
  if (browser && platform) return `${browser} on ${platform}`
  if (browser) return browser
  if (platform) return platform
  // Neither hint survived. "Browser" is honest about all that is actually known, where a
  // generated nickname would invent a fact about hardware this code cannot see.
  return "Browser"
}
