import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installDialogShim } from "../system-next/dialog-shim.test-support.ts"
import { Sheet } from "../system-next/Sheet.tsx"
import { AccountSheet } from "./AccountSheet.tsx"
import { AlbumSheet } from "./AlbumSheet.tsx"
import { GET_COLOR } from "./album-fixtures.ts"
import { DeviceList } from "./DeviceList.tsx"
import {
  REVIEW_ACCOUNT_PAIRED,
  REVIEW_ACCOUNT_REFUSED,
  REVIEW_ACCOUNT_UNPAIRED,
  REVIEW_DEVICES,
  REVIEW_HISTORY,
  REVIEW_ROOMS,
  REVIEW_SOURCES,
  TROUBLED_ROOMS,
} from "./entity-fixtures.ts"
import { HistoryJournal } from "./HistoryJournal.tsx"
import { PlayerSheet } from "./PlayerSheet.tsx"
import { ProductNav } from "./ProductNav.tsx"
import { RoomsSheet } from "./RoomsSheet.tsx"
import { SearchResults } from "./SearchResults.tsx"
import { SourceList } from "./SourceList.tsx"

// See dialog-shim.test-support.ts: this stands in for a <dialog> jsdom does not implement. It
// proves our wiring drives the platform correctly. The platform's own behaviour -- top layer,
// backdrop painting, inertness, Escape, focus return -- is NOT proven here and is checked in a
// browser instead.
let uninstall = () => {}
beforeAll(() => {
  uninstall = installDialogShim()
})
afterAll(() => uninstall())
afterEach(cleanup)

function OpenSheet({ onClose }: { readonly onClose: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      title="Rooms"
      open={open}
      onClose={() => {
        setOpen(false)
        onClose()
      }}
    >
      <span>Kitchen</span>
    </Sheet>
  )
}

describe("the modal surface", () => {
  it("shows and hides through the dialog itself rather than by hiding a div", () => {
    const { rerender } = render(
      <Sheet title="Rooms" open={false} onClose={() => {}}>
        <span>body</span>
      </Sheet>,
    )
    const dialog = screen.getByRole("dialog", { hidden: true })
    expect((dialog as HTMLDialogElement).open).toBe(false)
    rerender(
      <Sheet title="Rooms" open onClose={() => {}}>
        <span>body</span>
      </Sheet>,
    )
    expect((dialog as HTMLDialogElement).open).toBe(true)
  })

  it("raises onClose once per dismissal, not once per route into it", () => {
    const onClose = vi.fn()
    render(<OpenSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    // Both the click handler and the platform's close event lead here. If the button called
    // the prop directly as well, a caller counting dismissals would see two.
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("dismisses on the backdrop but not on the content", () => {
    const onClose = vi.fn()
    render(<OpenSheet onClose={onClose} />)
    fireEvent.click(screen.getByText("Kitchen"))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("dialog"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("names the surface for a screen reader", () => {
    render(
      <Sheet title="Now playing" open onClose={() => {}}>
        <span>body</span>
      </Sheet>,
    )
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeDefined()
  })
})

describe("rooms", () => {
  it("offers a move only where the sound could go", () => {
    render(<RoomsSheet rooms={REVIEW_ROOMS} open onClose={() => {}} onMove={() => {}} />)
    // Idle and reachable, with something playing elsewhere.
    expect(screen.getByRole("button", { name: "Move here, Desk" })).toBeDefined()
    // Playing here already: moving to where it is would be a control that does nothing.
    expect(screen.queryByRole("button", { name: "Move here, Kitchen" })).toBeNull()
    // Cannot be reached: the verb is to try the connection, not to send audio into the dark.
    expect(screen.getByRole("button", { name: "Retry Living room" })).toBeDefined()
  })

  it("says which room failed and offers that room the retry", () => {
    const onMove = vi.fn()
    render(<RoomsSheet rooms={TROUBLED_ROOMS} open onClose={() => {}} onMove={onMove} />)
    expect(screen.getByText("Could not move here — still playing in Kitchen")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Try again, Living room" }))
    expect(onMove).toHaveBeenCalledWith("living")
  })

  it("reports a move in progress without claiming it finished", () => {
    render(
      <RoomsSheet
        rooms={REVIEW_ROOMS}
        open
        movingRoomId="desk"
        onClose={() => {}}
        onMove={() => {}}
      />,
    )
    expect(screen.getByText("Moving…")).toBeDefined()
    // No button on a row that is already moving, and no invented success.
    expect(screen.queryByRole("button", { name: "Move here, Desk" })).toBeNull()
    // Both idle rooms still read as idle. The row being moved to is not optimistically
    // flipped to playing, because the move has not happened yet and might not.
    expect(screen.getAllByText("Nothing playing")).toHaveLength(2)
  })
})

describe("the player", () => {
  it("asks to continue at the end of an album rather than moving on by itself", () => {
    const { rerender } = render(
      <PlayerSheet
        album={GET_COLOR}
        open
        room="Kitchen"
        transport="playing"
        percentage={38}
        elapsed="2:41"
        remaining="-4:22"
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: "Pause" })).toBeDefined()
    rerender(
      <PlayerSheet
        album={GET_COLOR}
        open
        room="Kitchen"
        transport="ended"
        percentage={100}
        elapsed="7:03"
        remaining="0:00"
        onClose={() => {}}
      />,
    )
    // Silence by default, one tap to carry on.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined()
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull()
    expect(screen.getByText("Ended in Kitchen")).toBeDefined()
  })

  it("offers the collection only when adding is possible", () => {
    const { rerender } = render(
      <PlayerSheet
        album={GET_COLOR}
        open
        room="Kitchen"
        transport="paused"
        percentage={0}
        elapsed="0:00"
        remaining="-7:03"
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "Add to collection" })).toBeNull()
    const onAdd = vi.fn()
    rerender(
      <PlayerSheet
        album={GET_COLOR}
        open
        room="Kitchen"
        transport="paused"
        percentage={0}
        elapsed="0:00"
        remaining="-7:03"
        onClose={() => {}}
        onAddToCollection={onAdd}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Add to collection" }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })
})

describe("one album", () => {
  it("keeps an unknown tracklist different from an empty one", () => {
    const { rerender } = render(<AlbumSheet album={GET_COLOR} open onClose={() => {}} />)
    // Not loaded: claiming "Tracks, 0" would assert this album has none.
    expect(screen.queryByRole("region", { name: /^Tracks/ })).toBeNull()
    expect(screen.getByText("Track listing not loaded.")).toBeDefined()
    rerender(
      <AlbumSheet
        album={GET_COLOR}
        open
        onClose={() => {}}
        tracks={[{ id: "1", title: "In Heat", duration: "3:12" }]}
      />,
    )
    expect(screen.getByRole("region", { name: "Tracks, 1" })).toBeDefined()
  })

  it("leads with the record and demotes the titles beneath it", () => {
    render(
      <AlbumSheet
        album={GET_COLOR}
        open
        onClose={() => {}}
        tracks={[{ id: "1", title: "In Heat", duration: "3:12" }]}
      />,
    )
    const heading = screen.getByRole("heading", { name: "GET COLOR" })
    const tracks = screen.getByRole("region", { name: "Tracks, 1" })
    // The album's name is a display heading above; the tracks are a named group below it.
    expect(heading.compareDocumentPosition(tracks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("configuration", () => {
  it("names the one account and this device, and offers nothing to switch to", () => {
    render(<AccountSheet standing={REVIEW_ACCOUNT_PAIRED} open onClose={() => {}} />)
    expect(screen.getByText("Default")).toBeDefined()
    expect(screen.getByText("This device is Firefox on Linux")).toBeDefined()
    expect(screen.getByRole("img", { name: "Paired" })).toBeDefined()
    // Counted rather than named. Asserting the absence of a button called "Switch" would
    // pass again the moment somebody added one called "Change account", so the claim is
    // that a paired sheet offers no control at all beyond the sheet's own dismissal.
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined()
  })

  it("says why an unpaired device cannot read the library, and offers to pair it", () => {
    const onPair = vi.fn()
    render(
      <AccountSheet standing={REVIEW_ACCOUNT_UNPAIRED} open onClose={() => {}} onPair={onPair} />,
    )
    // The device is still named. It is the one thing that is known before a grant, and a
    // person needs it to recognise which device they are pairing.
    expect(screen.getByText("Firefox on Linux")).toBeDefined()
    expect(screen.getByRole("img", { name: "Not paired" })).toBeDefined()
    expect(screen.getByRole("alert")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Pair this device" }))
    expect(onPair).toHaveBeenCalledTimes(1)
  })

  it("withholds the pairing button when asking again could not help", () => {
    const onPair = vi.fn()
    render(
      <AccountSheet standing={REVIEW_ACCOUNT_REFUSED} open onClose={() => {}} onPair={onPair} />,
    )
    // The reason is still stated: a permanent refusal is the case a person most needs
    // explained, precisely because there is nothing on screen for them to press.
    expect(screen.getByText("unsupported: claims are disabled on this server.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Pair this device" })).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("asks for a verb only from the sources that need one", () => {
    const onConnect = vi.fn()
    render(<SourceList sources={REVIEW_SOURCES} onConnect={onConnect} onInstall={() => {}} />)
    // Working: a mark, no button.
    expect(screen.queryByRole("button", { name: /YouTube Music/ })).toBeNull()
    expect(screen.getByText("Session expired — sign in again to keep playing")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Reconnect Pandora" }))
    expect(onConnect).toHaveBeenCalledWith("pandora")
    expect(screen.getByRole("button", { name: "Install Soulseek" })).toBeDefined()
  })

  it("keeps an unreachable device listed rather than making it disappear", () => {
    const onRetry = vi.fn()
    render(<DeviceList devices={REVIEW_DEVICES} onRetry={onRetry} />)
    expect(screen.getByRole("region", { name: "Devices, 3" })).toBeDefined()
    expect(screen.getByText("This device")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Retry Living room" }))
    expect(onRetry).toHaveBeenCalledWith("living")
  })

  it("counts a waiting destination only when something is waiting", () => {
    const { rerender } = render(<ProductNav current="stacks" accountName="Default" waiting={3} />)
    const nav = screen.getByRole("navigation", { name: "Sections" })
    expect(within(nav).getByText("3")).toBeDefined()
    expect(within(nav).getByRole("link", { name: /Stacks/ })).toHaveProperty("ariaCurrent", "page")
    rerender(<ProductNav current="stacks" accountName="Default" />)
    // Zero waiting is not a small permanent alarm.
    expect(within(nav).queryByText("0")).toBeNull()
  })
})

describe("looking back and looking for", () => {
  it("names the query when nothing matched", () => {
    render(<SearchResults query="radiohed" albums={[]} />)
    expect(screen.getByRole("heading", { name: "Nothing matched radiohed" })).toBeDefined()
  })

  it("draws history as shelves of records, one per named day", () => {
    render(<HistoryJournal days={REVIEW_HISTORY} />)
    expect(screen.getByRole("region", { name: "Today, 2" })).toBeDefined()
    expect(screen.getByRole("region", { name: "Yesterday, 1" })).toBeDefined()
  })

  it("says nothing has been played rather than drawing an empty journal", () => {
    render(<HistoryJournal days={[]} />)
    expect(screen.getByRole("heading", { name: "Nothing played yet" })).toBeDefined()
    expect(screen.queryByRole("region")).toBeNull()
  })
})
