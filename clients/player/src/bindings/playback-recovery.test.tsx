import { act, cleanup, waitFor } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { initialSession, playbackSource } from "../../test/playback-source"
import { renderPlayback as renderHook } from "../../test/render-playback"
import { usePlayback } from "./usePlayback.binding"

afterEach(cleanup)

test("replaying saved Play requests never renders the historical albums", async () => {
  const source = await playbackSource()
  let local = initialSession()
  for (const track of ["old-album-a", "old-album-b", "latest-album"]) {
    local = await source.worker.queueSessionCommand(local, { _tag: "queue.clear", payload: {} })
    local = await source.worker.queueSessionCommand(local, {
      _tag: "queue.add",
      payload: { trackIds: [track] },
    })
    local = await source.worker.queueSessionCommand(local, { _tag: "transport.play", payload: {} })
  }

  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "phone" }))
  source.subscribe((session) => result.current.applySession(session))

  await waitFor(() => expect(source.sent).toHaveLength(9))
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
  await waitFor(() => expect(source.loads).toContain("latest-album"))
  expect(source.loads.every((track) => track === "latest-album")).toBe(true)
})

test("an album choice reaches the core without a reload or reconnect", async () => {
  const source = await playbackSource()
  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "phone" }))
  source.subscribe((session) => result.current.applySession(session))
  await waitFor(() => expect(result.current.playback.state).toBe("ready"))

  act(() => result.current.playAlbum(["latest-album"]))

  await waitFor(() => expect(source.sent).toEqual(["queue.clear", "queue.add", "transport.play"]))
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
})

test("concurrent album choices leave only the last album in the worker queue", async () => {
  const source = await playbackSource()
  const { result } = renderHook(() => usePlayback(source.edge, { deviceId: "phone" }))
  source.subscribe((session) => result.current.applySession(session))
  await waitFor(() => expect(result.current.playback.state).toBe("ready"))

  act(() => {
    result.current.playAlbum(["old-album-a"])
    result.current.playAlbum(["old-album-b"])
    result.current.playAlbum(["latest-album"])
  })

  await waitFor(() => expect(source.loads.at(-1)).toBe("latest-album"))
  await waitFor(async () => expect(await source.database.outbox()).toEqual([]))
  expect((await source.worker.sessions())[0]?.queue).toEqual(["latest-album"])
  expect(source.remote().queue).toEqual(["latest-album"])
})
