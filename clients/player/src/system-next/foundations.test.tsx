import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FoundationsBinding } from "../bindings/Foundations.binding.tsx"
import { AlbumTile } from "../shapes/AlbumTile.tsx"
import { Action } from "./Action.tsx"
import { Artwork } from "./Artwork.tsx"
import { ChoiceChip } from "./ChoiceChip.tsx"
import { CoverButton } from "./CoverButton.tsx"
import { Field } from "./Field.tsx"
import { IconButton } from "./IconButton.tsx"
import { Notice } from "./Notice.tsx"
import { Progress } from "./Progress.tsx"
import { SearchForm } from "./SearchForm.tsx"

afterEach(cleanup)
describe("production foundations", () => {
  it("preserves real action callbacks and native disabled semantics", () => {
    const callback = vi.fn()
    const view = render(<Action label="Play" onClick={callback} />)
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(callback).toHaveBeenCalledTimes(1)
    view.rerender(<Action label="Play" onClick={callback} disabled />)
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(callback).toHaveBeenCalledTimes(1)
  })
  it("names drawn icon controls without duplicate SVG announcements", () => {
    render(<IconButton label="Pause" icon="pause" />)
    expect(
      screen
        .getByRole("button", { name: "Pause" })
        .querySelector("svg")
        ?.getAttribute("aria-hidden"),
    ).toBe("true")
  })
  it("distinguishes selection from unavailable controls and keeps zero counts", () => {
    render(<ChoiceChip label="Downloaded" count={0} selected />)
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByText("0")).toBeDefined()
  })
  it("keeps label and error attached to the actual native field", () => {
    render(<Field id="password" label="Password" type="password" error="Wrong password" />)
    const input = screen.getByLabelText("Password")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id)
  })
  it("submits typed search text through the real form, never empty or disabled", () => {
    const submit = vi.fn()
    const view = render(<SearchForm id="search" label="Find an album" onSearch={submit} />)
    const form = view.container.querySelector("form")
    if (!form) throw new Error("SearchForm rendered no form element")
    const input = screen.getByRole("searchbox")
    fireEvent.change(input, { target: { value: "  FEZ  " } })
    fireEvent.submit(form)
    expect(submit).toHaveBeenCalledWith("FEZ")
    fireEvent.change(input, { target: { value: " " } })
    fireEvent.submit(form)
    view.rerender(<SearchForm id="search" label="Find an album" onSearch={submit} disabled />)
    fireEvent.submit(form)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("marks downloaded bytes only when the supplied fact is available", () => {
    const view = render(<CoverButton label="FEZ" availability="unknown" />)
    expect(screen.queryByRole("img", { name: "Downloaded on this device" })).toBeNull()
    view.rerender(<CoverButton label="FEZ" availability="downloading" />)
    expect(screen.getByRole("img", { name: "Downloading" })).toBeDefined()
    expect(screen.queryByRole("img", { name: "Downloaded on this device" })).toBeNull()
    view.rerender(<CoverButton label="FEZ" availability="available" />)
    expect(screen.getByRole("img", { name: "Downloaded on this device" })).toBeDefined()
  })
  it("keeps album identity and offline facts in the accessible button name", () => {
    const open = vi.fn()
    render(
      <AlbumTile
        title="FEZ"
        artist="Disasterpeace"
        availability="missing"
        sounding
        onOpen={open}
      />,
    )
    fireEvent.click(
      screen.getByRole("button", { name: "FEZ by Disasterpeace, playing now, not on this device" }),
    )
    expect(open).toHaveBeenCalledOnce()
  })
  it("retains accessible artwork identity after an image load failure", () => {
    const view = render(<Artwork src="/missing.jpg" label="GET COLOR by HEALTH" />)
    fireEvent.error(screen.getByRole("presentation"))
    expect(view.container.querySelector("img")?.hidden).toBe(true)
    expect(screen.getByRole("img", { name: "GET COLOR by HEALTH" })).toBeDefined()
    expect(screen.getByText("No artwork")).toBeDefined()
  })
  it("uses honest progress bounds and failure announcements", () => {
    render(
      <>
        <Progress label="Download" percentage={37} />
        <Notice tone="failure" message="Not moved" />
      </>,
    )
    expect(screen.getByRole("progressbar").getAttribute("max")).toBe("100")
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("37")
    expect(screen.getByRole("alert").textContent).toBe("Not moved")
  })
  it("mounts two independent bindings with real content and isolated interaction state", () => {
    const first = render(<FoundationsBinding scopeId="one" artworkUrl="/cover.jpg" />)
    const second = render(<FoundationsBinding scopeId="two" artworkUrl="/cover.jpg" />)
    const one = within(first.container)
    const two = within(second.container)
    fireEvent.click(one.getByRole("button", { name: "Downloaded 8" }))
    expect(one.getByRole("button", { name: "Downloaded 8" }).getAttribute("aria-pressed")).toBe(
      "true",
    )
    expect(two.getByRole("button", { name: "Downloaded 8" }).getAttribute("aria-pressed")).toBe(
      "false",
    )
    expect(one.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
    expect(two.getByRole("heading", { name: "GET COLOR" })).toBeDefined()
    expect(one.getByLabelText("Password").id).not.toBe(two.getByLabelText("Password").id)
  })
})
