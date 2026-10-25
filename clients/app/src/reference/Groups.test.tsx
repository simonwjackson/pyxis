import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import type { RpcRequest } from "../../../../contracts/generated/pyxis"
import { createSupportRpc } from "../rpc/support"
import { ReferenceGroupTools } from "./Groups"

afterEach(cleanup)

it("uses opaque group and page cursors instead of interpreting labels", async () => {
  const requests: RpcRequest[] = []
  const rpc = createSupportRpc(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as RpcRequest
    requests.push(request)
    if (request._tag === "library.groups.list")
      return Response.json({
        _tag: request._tag,
        outcome: {
          status: "ready",
          value: [
            {
              id: "opaque-123",
              label: "Any source label",
              kind: "bookmarks",
              count: 2,
              availability: { status: "ready" },
            },
          ],
        },
      })
    if (request._tag !== "library.group.items.list") throw new Error("unexpected operation")
    const last = request.payload.cursor !== undefined
    return Response.json({
      _tag: request._tag,
      outcome: {
        status: "ready",
        value: {
          availability: { status: "ready" },
          items: [
            {
              _tag: "bookmark",
              payload: {
                bookmark: {
                  id: last ? "b" : "a",
                  trackId: last ? "track-b" : "track-a",
                  createdAt: "now",
                },
              },
            },
          ],
          ...(last ? {} : { cursor: "opaque-next" }),
        },
      },
    })
  })
  render(<ReferenceGroupTools token="token" rpc={rpc} />)
  fireEvent.click(screen.getByText("Load groups"))
  fireEvent.click(await screen.findByText("Any source label (2)"))
  await screen.findByText("track-a (unavailable)")
  fireEvent.click(screen.getByText("Next page"))
  await screen.findByText("track-b (unavailable)")
  expect(requests[2]).toEqual({
    _tag: "library.group.items.list",
    payload: { groupId: "opaque-123", limit: 25, cursor: "opaque-next" },
  })
})
