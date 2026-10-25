import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import type { RpcRequest } from "../../../../contracts/generated/pyxis"
import { createSupportRpc } from "../rpc/support"
import { ReferencePlaylistTools } from "./Playlists"

afterEach(cleanup)

it("retries an uncertain append with the same content-bound command ID", async () => {
  const requests: RpcRequest[] = []
  let attempts = 0
  const rpc = createSupportRpc(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as RpcRequest
    requests.push(request)
    if (request._tag === "library.playlists.list")
      return Response.json({
        _tag: request._tag,
        outcome: {
          status: "ready",
          value: [{ id: "p", title: "Bowie", trackIds: [], revision: 1 }],
        },
      })
    if (request._tag !== "library.playlist.tracks.add") throw new Error("unexpected operation")
    attempts += 1
    if (attempts === 1) throw new Error("response lost")
    return Response.json({
      _tag: request._tag,
      outcome: {
        status: "applied",
        value: { id: "p", title: "Bowie", trackIds: ["a", "a"], revision: 2 },
      },
    })
  })
  render(<ReferencePlaylistTools token="token" queue={["a", "a"]} rpc={rpc} />)
  fireEvent.click(screen.getByText("Load playlists"))
  fireEvent.click(await screen.findByText("Append queue"))
  await screen.findByText("response lost")
  fireEvent.click(screen.getByText("Retry append"))
  await waitFor(() => expect(screen.getByText("Bowie (2 tracks)")).toBeDefined())
  expect(requests[1]).toEqual(requests[2])
})
