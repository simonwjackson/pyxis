/// Typed RPC to the core.
///
/// Everything the client asks the core for that is not media bytes goes through here. It
/// speaks the generated contract and nothing else: the request and response unions come
/// from `contracts/generated`, so a change to the core's surface fails this file to compile
/// rather than producing a request the core will reject at runtime.
///
/// `request` is injected rather than reached for. That is not ceremony: a module below a
/// binding must not reach outside the component tree for its own dependencies, and a
/// transport that closes over the global `fetch` cannot be tested without a network or a
/// monkey-patched global. The composition root supplies the real one.
///
/// This layer returns contract outcomes verbatim. It deliberately does not decide what a
/// `pairingRequired` means for a person, because that reading belongs to the model and
/// duplicating it here would give the product two answers to the same question.

import type {
  DeviceClaimOutcome,
  RpcRequest,
  RpcResponse,
  RpcSession,
  RpcSessionCommand,
} from "../../../../contracts/generated/pyxis"

export interface RpcTransportConfig {
  /// The composition root passes the platform's `fetch`. A test passes a function.
  readonly request: (input: string, init?: RequestInit) => Promise<Response>
}

export interface RpcTransport {
  /// Ask the core to admit this device to the default account.
  ///
  /// Unauthenticated by definition: this is the call that obtains the credential every
  /// other call carries. The outcome is returned whole, including the refusals, because
  /// "the core will not admit a device that merely asks" is a different situation from
  /// "the core could not be reached" and only the model should collapse them.
  claimDevice(name: string): Promise<DeviceClaimOutcome>
  listSessions(token: string): Promise<readonly RpcSession[]>
  createSession(token: string, name: string): Promise<RpcSession>
  runCommand(
    token: string,
    sessionId: string,
    command: RpcSessionCommand,
    commandId?: string,
  ): Promise<RpcSession>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

/// Read the core's failure envelope without trusting its shape.
///
/// A response body is data from the network, so it is narrowed rather than asserted. A
/// failure that cannot be read still has to say something, and "the core rejected this"
/// is more honest than crashing on the shape of the explanation.
function failureMessage(outcome: unknown, fallback: string): string {
  if (!isRecord(outcome)) return fallback
  const value = outcome.value
  if (!isRecord(value)) return fallback
  const { code, message } = value
  if (typeof message !== "string") return fallback
  return typeof code === "string" ? `${code}: ${message}` : message
}

export function createRpcTransport(config: RpcTransportConfig): RpcTransport {
  const { request } = config

  const call = async (payload: RpcRequest, bearer?: string): Promise<RpcResponse> => {
    const response = await request("/rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify(payload),
    })
    // A transport error is not a protocol answer. Reporting the status is what lets the
    // layers above tell "the core said no" from "nothing answered".
    if (!response.ok) {
      throw new Error(`RPC ${payload._tag} failed with HTTP ${response.status}`)
    }
    const value: unknown = await response.json()
    if (!isRecord(value) || typeof value._tag !== "string") {
      throw new Error(`RPC ${payload._tag} returned a body that is not an RPC response`)
    }
    if (value._tag === "rpc.failure") {
      throw new Error(failureMessage(value.outcome, `RPC ${payload._tag} was rejected`))
    }
    // The core answers the question it was asked. A mismatch means the response was routed
    // wrongly, and reading a payload off it would be reading the wrong shape.
    if (value._tag !== payload._tag) {
      throw new Error(`RPC answered '${value._tag}' when asked '${payload._tag}'`)
    }
    return value as RpcResponse
  }

  return {
    async claimDevice(name) {
      const response = await call({ _tag: "auth.device.claim", payload: { name } })
      if (response._tag !== "auth.device.claim") {
        throw new Error("device claim returned another call's response")
      }
      return response.outcome
    },

    async listSessions(token) {
      // The console view: places a command could actually reach right now. Unreachable
      // sessions are other devices' business, and this client only hosts its own.
      const response = await call(
        { _tag: "session.list", payload: { includeUnreachable: false } },
        token,
      )
      if (response._tag !== "session.list" || response.outcome.status !== "ready") {
        throw new Error("the core would not list sessions")
      }
      return response.outcome.value
    },

    async createSession(token, name) {
      const response = await call({ _tag: "session.create", payload: { name } }, token)
      if (response._tag !== "session.create") {
        throw new Error("session create returned another call's response")
      }
      if (response.outcome.status === "notDevice") {
        throw new Error("this credential is not a device, so it cannot host a session")
      }
      if (response.outcome.status !== "ready") {
        throw new Error(failureMessage(response.outcome, "the core would not create a session"))
      }
      return response.outcome.value
    },

    async runCommand(token, sessionId, command, commandId) {
      const response = await call(
        {
          _tag: "session.command.run",
          payload: { sessionId, command, ...(commandId === undefined ? {} : { commandId }) },
        },
        token,
      )
      if (response._tag !== "session.command.run") {
        throw new Error("session command returned another call's response")
      }
      // Every non-applied status is named, so a command that did not take effect can never
      // be mistaken for one that did. Silence here would let the interface show a queue the
      // core never accepted.
      switch (response.outcome.status) {
        case "applied":
          return response.outcome.value
        case "unknownSession":
          throw new Error("the core does not know this session")
        case "notHost":
          throw new Error("this device does not host that session")
        case "notDevice":
          throw new Error("this credential is not a device")
        default:
          throw new Error(
            failureMessage(response.outcome, `session command ${command._tag} was refused`),
          )
      }
    },
  }
}
