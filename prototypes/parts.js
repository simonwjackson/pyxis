// System components: structure and behaviour with no domain in them.
//
// Everything here should survive having the words "album", "room" and "play" removed. If a
// function stops making sense once the domain nouns are gone, it belongs in a page instead.

import { element, reveal } from "./common.js"

// A windowed grid. Only the rows near the viewport exist in the DOM; spacers above and below
// hold the scroll height, so 5,000 items cost the same as 50.
//
// Geometry is read back from the stylesheet rather than restated here. `auto-fill` keeps its
// empty tracks, so the resolved column list is readable even while the grid is empty — which
// means the cell size and column count can never drift from the CSS that produced them.
//
// `render` turns one row into one element. This module must not know what a row is.
export function mountWindow(container, rows, render) {
  let frame = 0

  const paint = () => {
    // A rebuilt page leaves its old grid detached. Retire with it rather than repainting a
    // node nobody can see.
    if (!container.isConnected) return container.teardown?.()

    const width = container.clientWidth
    if (width === 0) return

    const styles = getComputedStyle(container)
    const tracks = styles.gridTemplateColumns.split(" ").filter(Boolean)
    const columns = Math.max(1, tracks.length)
    const gap = Number.parseFloat(styles.rowGap) || 0
    const rowHeight = Number.parseFloat(tracks[0]) + gap
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) return

    const totalRows = Math.ceil(rows.length / columns)
    const top = container.getBoundingClientRect().top
    const firstRow = Math.max(0, Math.floor((-top - innerHeight) / rowHeight))
    const lastRow = Math.min(totalRows, Math.ceil((-top + innerHeight * 2) / rowHeight))

    const spacer = (height) =>
      element(`<div style="grid-column:1/-1;height:${Math.max(0, height)}px"></div>`)

    const painted = []
    container.innerHTML = ""
    if (firstRow > 0) container.append(spacer(firstRow * rowHeight - gap))
    for (const row of rows.slice(firstRow * columns, lastRow * columns)) {
      const node = render(row)
      painted.push(node)
      container.append(node)
    }
    if (totalRows > lastRow) container.append(spacer((totalRows - lastRow) * rowHeight - gap))
    reveal(painted)
  }

  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(paint)
  }

  // Remounting is normal: every filter change rebuilds the grid. Without this, each rebuild
  // would leave its listeners behind, repainting containers that are no longer on the page.
  container.teardown?.()
  container.teardown = () => {
    cancelAnimationFrame(frame)
    removeEventListener("scroll", schedule)
    removeEventListener("resize", schedule)
  }

  addEventListener("scroll", schedule, { passive: true })
  addEventListener("resize", schedule, { passive: true })
  paint()
}
