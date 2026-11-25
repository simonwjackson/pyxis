import {
  RPC_CONTRACT_ID,
  type RpcFailure,
  type RpcRequest,
  type RpcResponse,
} from "../../../contracts/generated/pyxis"
import { assertRpcRequest, assertRpcResponse } from "../../../contracts/validation"

export class PyxisError extends Error {
  constructor(readonly failure: RpcFailure) {
    super(failure.message)
  }
}

type Outcome<R extends RpcRequest> = Exclude<
  Extract<RpcResponse, { _tag: R["_tag"] }>["outcome"],
  { value: RpcFailure }
>

export class PyxisClient {
  constructor(
    private readonly baseUrl: URL,
    private readonly authorization?: string,
    private readonly signal?: AbortSignal,
  ) {}

  async call<R extends RpcRequest>(body: R): Promise<Outcome<R>> {
    assertRpcRequest(body)
    const timeout = AbortSignal.timeout(60_000)
    let parsed: unknown
    try {
      const response = await fetch(new URL("/rpc", this.baseUrl), {
        method: "POST",
        redirect: "error",
        signal: this.signal ? AbortSignal.any([this.signal, timeout]) : timeout,
        headers: {
          "content-type": "application/json",
          "x-pyxis-contract": RPC_CONTRACT_ID,
          ...(this.authorization && { authorization: this.authorization }),
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      parsed = await response.json()
      assertRpcResponse(parsed)
    } catch {
      throw new PyxisError({
        code: "mcp.upstreamUnavailable",
        message: "No valid response from Pyxis",
        retryable: true,
      })
    }
    if (parsed._tag === "rpc.failure") throw new PyxisError(parsed.outcome.value)
    if (parsed._tag !== body._tag) {
      throw new PyxisError({
        code: "mcp.unexpectedResponse",
        message: "Pyxis answered a different operation",
        retryable: true,
      })
    }
    const value = parsed.outcome.value
    if (value && typeof value === "object" && "code" in value && "retryable" in value) {
      throw new PyxisError(value)
    }
    // TypeScript cannot narrow a discriminated union against a generic's tag.
    return parsed.outcome as Outcome<R>
  }

  async authenticate(): Promise<void> {
    // system.status.get is public. Probe a protected read even for discovery; scope
    // refusal proves the bearer was authenticated without requiring account:read.
    try {
      await this.call({ _tag: "account.list", payload: {} })
    } catch (error) {
      if (!(error instanceof PyxisError && error.failure.code === "auth.insufficientScope"))
        throw error
    }
  }
}
