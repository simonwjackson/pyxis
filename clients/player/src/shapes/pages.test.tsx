import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Action } from "../system-next/Action.tsx"
import { GET_COLOR, REVIEW_ALBUMS } from "./album-fixtures.ts"
import { LibraryPage } from "./LibraryPage.tsx"
import { type StacksContent, StacksPage } from "./StacksPage.tsx"
import type { SurfaceState } from "./surface.ts"

afterEach(cleanup)

const CONTENT: StacksContent = {
  lead: GET_COLOR,
  leadContext: "Most recently added",
  shelves: [{ id: "recent", title: "Recently added", albums: REVIEW_ALBUMS.slice(1, 4) }],
}

const stacks = (library: SurfaceState<StacksContent>) =>
  render(
    <StacksPage
      library={library}
      emptyAction={<Action label="Add music" />}
      onRetry={() => undefined}
    />,
  )

// The four states have to be four different things on screen. These assertions are written
// as "what is readable" rather than "which branch ran", because the bug being guarded
// against is a screen that renders the wrong sentence, not one that takes the wrong path.
describe("a surface says which kind of nothing it has", () => {
  it("says it is still reading rather than claiming the library is empty", () => {
    stacks({ state: "pending" })
    expect(screen.getByText("Reading your library")).toBeDefined()
    // The specific failure this guards: a spinner that tells someone their music is gone.
    expect(screen.queryByText("No albums yet")).toBeNull()
  })

  it("offers a way out of a genuinely empty library", () => {
    stacks({ state: "empty" })
    expect(screen.getByText("No albums yet")).toBeDefined()
    expect(screen.getByRole("button", { name: "Add music" })).toBeDefined()
    expect(screen.queryByText("Reading your library")).toBeNull()
  })

  it("says both that the library is empty and that it could not be checked", () => {
    stacks({ state: "empty", reason: "This device is offline. Showing what it already has." })
    // Two true things at once. Dropping either one misleads: the library really is empty
    // here, and we really could not confirm that with the server.
    expect(screen.getByText("No albums yet")).toBeDefined()
    expect(screen.getByText("This device is offline. Showing what it already has.")).toBeDefined()
  })

  it("treats an unreadable library as a failure to retry, not as an empty one", () => {
    stacks({ state: "blocked", reason: "Could not reach your library: refused" })
    expect(screen.getByText("This library cannot be read here")).toBeDefined()
    expect(screen.getByText("Could not reach your library: refused")).toBeDefined()
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined()
    // Offering "add music" here would blame the person for a failure that is not theirs.
    expect(screen.queryByText("No albums yet")).toBeNull()
    expect(screen.queryByRole("button", { name: "Add music" })).toBeNull()
  })
})

describe("data that is shown is captioned with how much to trust it", () => {
  it("shows live data with no caption at all", () => {
    stacks({ state: "shown", value: CONTENT, freshness: "live" })
    expect(screen.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
    expect(screen.queryByText("Not checked with your library yet")).toBeNull()
    expect(screen.queryByText("Showing what this device already had")).toBeNull()
  })

  it("shows local data and says it has not been checked, without calling it stale", () => {
    stacks({ state: "shown", value: CONTENT, freshness: "local" })
    // `local` is real data the person put here. Saying "stale" about it would be a lie.
    expect(screen.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
    expect(screen.getByText("Not checked with your library yet")).toBeDefined()
  })

  it("keeps showing albums when reconciling failed, and says why", () => {
    stacks({
      state: "shown",
      value: CONTENT,
      freshness: "stale",
      reason: "This device is offline. Showing what it already has.",
    })
    // The whole offline-first promise in one assertion: the failure degrades the caption
    // and does not blank the surface.
    expect(screen.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
    expect(screen.getByRole("region", { name: "Recently added, 3" })).toBeDefined()
    expect(screen.getByText("This device is offline. Showing what it already has.")).toBeDefined()
  })

  it("does not stack a freshness caption on top of a stated failure", () => {
    stacks({
      state: "shown",
      value: CONTENT,
      freshness: "stale",
      reason: "Could not reach your library: refused",
    })
    expect(screen.getByText("Could not reach your library: refused")).toBeDefined()
    expect(screen.queryByText("Showing what this device already had")).toBeNull()
  })
})

describe("the all-albums surface answers a different question", () => {
  it("draws every album as one field and counts it truthfully", () => {
    render(
      <LibraryPage
        library={{ state: "shown", value: REVIEW_ALBUMS, freshness: "live" }}
        onRetry={() => undefined}
      />,
    )
    expect(
      screen.getByRole("region", { name: `All albums, ${REVIEW_ALBUMS.length}` }),
    ).toBeDefined()
  })

  it("waits rather than claiming an empty library", () => {
    render(<LibraryPage library={{ state: "pending" }} onRetry={() => undefined} />)
    expect(screen.getByText("Reading your library")).toBeDefined()
    expect(screen.queryByText("No albums yet")).toBeNull()
  })
})
