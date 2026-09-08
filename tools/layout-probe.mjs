/// Does the shell actually own the viewport, and does scrolling happen inside it?
///
/// jsdom has no layout engine, so nothing in the unit suite can see any of this. Three layout
/// defects in a row -- a page that scrolled and carried the player bar away, half-applied safe
/// areas, and a bar positioned one pixel below the fold -- reached a phone with 222 tests
/// passing, because all three are facts about rendered boxes and there were no rendered boxes.
///
/// Run against the deployed URL, so what is measured is what is served rather than what a
/// developer build happens to produce.

import { chromium } from "/home/simonwjackson/code/github/simonwjackson/caliper/node_modules/playwright-core/index.mjs"

const url = process.argv[2] ?? "https://pyxis.hummingbird-lake.ts.net/"
const browser = await chromium.launch({
  executablePath:
    "/nix/store/zpz1i4yvw469siqssfnpfk4snwz29m3x-chromium-150.0.7871.128/bin/chromium",
  args: ["--no-sandbox"],
})
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
})
const page = await context.newPage()
await page.goto(url, { waitUntil: "networkidle" })
await page.waitForTimeout(2500)

const report = await page.evaluate(() => {
  const frame = document.querySelector(".px-frame")
  const outlet = document.querySelector(".px-frame-outlet")
  const bar = document.querySelector(".px-frame-bar")
  const box = (el) => (el ? el.getBoundingClientRect() : undefined)
  const style = (el, prop) => (el ? getComputedStyle(el)[prop] : undefined)
  return {
    viewport: { width: innerWidth, height: innerHeight },
    documentScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    htmlOverflow: style(document.documentElement, "overflow"),
    bodyOverscroll: style(document.body, "overscrollBehavior"),
    frame: box(frame),
    outlet: outlet
      ? { rect: box(outlet), scrollHeight: outlet.scrollHeight, clientHeight: outlet.clientHeight }
      : undefined,
    bar: box(bar),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
  }
})

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]')?.getAttribute("href")
  if (!href) return undefined
  return await (await fetch(href, { cache: "no-store" })).json()
})

const v = report.viewport
const frame = report.frame
console.log(`url                 ${url}`)
console.log(`viewport            ${v.width}x${v.height}`)
console.log(`html overflow       ${report.htmlOverflow}`)
console.log(`overscroll          ${report.bodyOverscroll}`)
console.log(`document scrolls    ${report.documentScrolls}   (must be false)`)
console.log(
  `frame height        ${frame ? Math.round(frame.height) : "MISSING"}  vs viewport ${v.height}`,
)
if (report.outlet)
  console.log(
    `outlet              ${Math.round(report.outlet.rect.height)}px tall, content ${report.outlet.scrollHeight}px -> ${report.outlet.scrollHeight > report.outlet.clientHeight ? "scrolls" : "does not scroll"}`,
  )
if (report.bar)
  console.log(
    `bar                 ${Math.round(report.bar.top)}-${Math.round(report.bar.bottom)}  (viewport bottom ${v.height})`,
  )
console.log(
  `manifest display    ${manifest?.display}  override ${JSON.stringify(manifest?.display_override)}`,
)
console.log(`viewport meta       ${report.viewportMeta}`)

const failures = []
if (report.documentScrolls) failures.push("the document scrolls; the shell should own the viewport")
if (report.htmlOverflow !== "hidden")
  failures.push(`html overflow is ${report.htmlOverflow}, not hidden`)
if (report.bodyOverscroll !== "none")
  failures.push(`overscroll-behavior is ${report.bodyOverscroll}, not none`)
if (!frame || Math.abs(frame.height - v.height) > 1)
  failures.push(`frame is ${frame ? Math.round(frame.height) : "missing"}, viewport is ${v.height}`)
if (report.bar && Math.abs(report.bar.bottom - v.height) > 1)
  failures.push(`bar bottom is ${Math.round(report.bar.bottom)}, viewport is ${v.height}`)
if (manifest?.display !== "fullscreen") failures.push(`manifest display is ${manifest?.display}`)

console.log(failures.length === 0 ? "\nPASS" : `\nFAIL\n  - ${failures.join("\n  - ")}`)
await page.screenshot({ path: process.env.PYXIS_PROBE_SHOT ?? "/tmp/pyxis-layout-probe.png" })
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
