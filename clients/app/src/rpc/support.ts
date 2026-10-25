import type { RpcRequest, RpcResponse } from "../../../../contracts/generated/pyxis"
import { assertRpcRequest, assertRpcResponse } from "./validation"

// New library primitives use the same generated trust boundary as the worker and page.
export function createSupportRpc(
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = globalThis.fetch,
) {
  return async <Tag extends RpcRequest["_tag"]>(
    token: string,
    operation: Extract<RpcRequest, { _tag: Tag }>,
  ): Promise<Extract<RpcResponse, { _tag: Tag }>> => {
    assertRpcRequest(operation)
    const response = await request("/rpc", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(operation),
    })
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`)
    const body: unknown = await response.json()
    assertRpcResponse(body)
    if (body._tag !== operation._tag) throw new Error("RPC operation mismatch")
    return body as Extract<RpcResponse, { _tag: Tag }>
  }
}
