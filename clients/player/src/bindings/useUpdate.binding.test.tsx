import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import type { UpdateWatcher } from "../rpc/updates.ts"
import { UpdateNotice } from "../shapes/UpdateNotice.tsx"
import { type UpdateEdge, useUpdate } from "./useUpdate.binding.tsx"

afterEach(cleanup)

/// A watcher whose "newer build" moment is fired by the test, so nothing here waits on a
/// timer or a network.
function watcher() {
  let fire: (() => void) | undefined
  const stop = vi.fn()
  const instance: UpdateWatcher = {
    start(onUpdate) {
      fire = onUpdate
      return stop
    },
  }
  return { instance, stop, fire: () => fire?.() }
}

function Probe({ edge }: { readonly edge: UpdateEdge }) {
  const { available, apply } = useUpdate(edge)
  return available ? <UpdateNotice onApply={apply} /> : <span>on the current build</span>
}

test("says nothing until the server serves a newer build, then offers a reload", () => {
  const watch = watcher()
  const reload = vi.fn()
  const edge: UpdateEdge = { request: vi.fn(), reload, watcher: watch.instance }
  render(<Probe edge={edge} />)

  expect(screen.getByText("on the current build")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Reload now" })).toBeNull()

  act(() => watch.fire())

  expect(screen.getByRole("status").textContent).toContain("A newer Pyxis is ready")
  // Nothing reloaded by itself. The notice is the whole mechanism; the person chooses.
  expect(reload).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "Reload now" }))
  expect(reload).toHaveBeenCalledTimes(1)
})

test("stops watching when the shell goes away", () => {
  const watch = watcher()
  const edge: UpdateEdge = { request: vi.fn(), reload: vi.fn(), watcher: watch.instance }
  const { unmount } = render(<Probe edge={edge} />)

  unmount()

  expect(watch.stop).toHaveBeenCalledTimes(1)
})

test("without an edge there is nothing to watch and nothing to say", () => {
  function Bare() {
    const { available } = useUpdate(undefined)
    return <span>{String(available)}</span>
  }
  render(<Bare />)
  expect(screen.getByText("false")).toBeTruthy()
})
