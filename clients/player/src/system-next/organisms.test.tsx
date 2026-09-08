import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AlbumLead } from "../shapes/AlbumLead.tsx"
import { AlbumShelf } from "../shapes/AlbumShelf.tsx"
import { AlbumWall } from "../shapes/AlbumWall.tsx"
import type { AlbumSummary } from "../shapes/album.ts"
import { NowBarPlaying } from "../shapes/NowBarPlaying.tsx"
import { NowBarResting } from "../shapes/NowBarResting.tsx"
import { BlankState } from "./BlankState.tsx"
import { Shelf } from "./Shelf.tsx"

afterEach(cleanup)

const album = (over: Partial<AlbumSummary> & Pick<AlbumSummary, "id">): AlbumSummary => ({
  title: `Title ${over.id}`,
  artist: `Artist ${over.id}`,
  availability: "unknown",
  ...over,
})
const THREE = [album({ id: "a" }), album({ id: "b" }), album({ id: "c" })]

describe("library organisms", () => {
  it("counts every album it holds, not the slice it shows", () => {
    render(<AlbumShelf title="Recently added" albums={THREE} limit={1} />)
    // The rail is cut to one, but a shelf claiming "1" would be lying about the library.
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("region", { name: "Recently added, 3" })).toBeDefined()
  })

  it("renders nothing at all for an empty shelf rather than an empty heading", () => {
    const { container } = render(<AlbumShelf title="Recently added" albums={[]} />)
    // An absent shelf, not an empty one: a heading with no records invents a category.
    expect(container.innerHTML).toBe("")
    expect(screen.queryByText("Recently added")).toBeNull()
  })

  it("distinguishes a shelf that is empty from one whose count is genuinely zero", () => {
    render(
      <Shelf title="Downloaded" count={0}>
        {null}
      </Shelf>,
    )
    // The system organism still draws, because the caller asserted the category exists.
    expect(screen.getByRole("region", { name: "Downloaded, 0" })).toBeDefined()
  })

  it("announces availability and sounding state in the tile's accessible name", () => {
    render(
      <AlbumWall
        label="All albums"
        albums={[
          album({ id: "a", title: "Kid A", artist: "Radiohead", availability: "missing" }),
          album({ id: "b", title: "Loveless", artist: "MBV", availability: "available" }),
        ]}
        soundingAlbumId="b"
      />,
    )
    expect(
      screen.getByRole("button", { name: "Kid A by Radiohead, not on this device" }),
    ).toBeDefined()
    expect(
      screen.getByRole("button", {
        name: "Loveless by MBV, playing now, downloaded on this device",
      }),
    ).toBeDefined()
  })

  it("puts the real count in the wall's region name", () => {
    render(<AlbumWall label="All albums" albums={THREE} />)
    const wall = screen.getByRole("region", { name: "All albums, 3" })
    expect(within(wall).getAllByRole("button")).toHaveLength(3)
  })

  it("reports which album was opened rather than that something was", () => {
    const onOpen = vi.fn()
    render(<AlbumWall label="All albums" albums={THREE} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole("button", { name: "Title b by Artist b" }))
    expect(onOpen).toHaveBeenCalledWith("b")
  })

  it("omits the play action entirely when there is no handler for it", () => {
    const { rerender } = render(<AlbumLead album={album({ id: "a" })} />)
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull()
    rerender(<AlbumLead album={album({ id: "a" })} onPlay={() => {}} />)
    expect(screen.getByRole("button", { name: "Play" })).toBeDefined()
  })

  it("drops the year from the credit when the album has none", () => {
    const { rerender } = render(
      <AlbumLead album={album({ id: "a", artist: "HEALTH", year: 2009 })} />,
    )
    expect(screen.getByText("HEALTH · 2009")).toBeDefined()
    rerender(<AlbumLead album={album({ id: "a", artist: "HEALTH" })} />)
    // No dangling separator: a missing year is absent, not an empty slot.
    expect(screen.getByText("HEALTH")).toBeDefined()
    expect(screen.queryByText("HEALTH · ")).toBeNull()
  })

  it("keeps the empty-state recovery composable instead of configured", () => {
    const onAct = vi.fn()
    render(
      <BlankState
        title="Nothing here yet"
        message="Connect a source."
        actions={
          <button type="button" onClick={onAct}>
            Add a source
          </button>
        }
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Add a source" }))
    expect(onAct).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeDefined()
  })
})

describe("playback presence", () => {
  it("names the transport control for the action it will take, not the state it is in", () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <NowBarPlaying
        album={album({ id: "a" })}
        room="Kitchen"
        transport="playing"
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<NowBarPlaying album={album({ id: "a" })} room="Kitchen" transport="paused" />)
    expect(screen.getByRole("button", { name: "Play" })).toBeDefined()
  })

  it("says how many other rooms are live rather than implying only one", () => {
    const { rerender } = render(
      <NowBarPlaying
        album={album({ id: "a" })}
        room="Kitchen"
        transport="playing"
        otherRooms={2}
      />,
    )
    expect(screen.getByRole("button", { name: "Rooms, playing in Kitchen +2" })).toBeDefined()
    rerender(<NowBarPlaying album={album({ id: "a" })} room="Kitchen" transport="playing" />)
    expect(screen.getByRole("button", { name: "Rooms, playing in Kitchen" })).toBeDefined()
  })

  it("keeps its footprint with nothing playing and offers no dead resume control", () => {
    const { rerender } = render(<NowBarResting />)
    expect(screen.getByText("Nothing playing")).toBeDefined()
    // Nothing to resume means no control at all, rather than a disabled one.
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Add an album to get started")).toBeDefined()
    const onResume = vi.fn()
    rerender(<NowBarResting resumeTitle="GET COLOR" onResume={onResume} />)
    fireEvent.click(screen.getByRole("button", { name: "Resume GET COLOR" }))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Last played GET COLOR")).toBeDefined()
  })

  it("opens the player from the whole bar without nesting a button inside a button", () => {
    const onOpenPlayer = vi.fn()
    render(
      <NowBarPlaying
        album={album({ id: "a", title: "GET COLOR", artist: "HEALTH" })}
        room="Kitchen"
        transport="playing"
        onOpenPlayer={onOpenPlayer}
      />,
    )
    const open = screen.getByRole("button", { name: "Open player, GET COLOR by HEALTH" })
    fireEvent.click(open)
    expect(onOpenPlayer).toHaveBeenCalledTimes(1)
    expect(open.querySelector("button")).toBeNull()
  })
})
