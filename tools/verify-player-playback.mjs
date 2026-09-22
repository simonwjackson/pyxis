#!/usr/bin/env -S nix shell nixpkgs#nodejs --command node

import assert from "node:assert/strict"

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    "/home/simonwjackson/code/github/simonwjackson/caliper/node_modules/playwright-core/index.mjs"
)
const origin = process.argv[2] ?? "http://127.0.0.1:5181"
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/nix/store/zpz1i4yvw469siqssfnpfk4snwz29m3x-chromium-150.0.7871.128/bin/chromium",
  args: ["--no-sandbox", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
})
try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  })
  const errors = []
  const forbidden = []
  page.on("pageerror", (error) => errors.push(error.message))
  // No live API or media requests are permitted, even if the fixture accidentally mounts
  // production wiring. This is a request guard, not a replacement server response.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || /^\/(rpc|realtime|stream)(\/|$)/.test(url.pathname)) {
      forbidden.push(url.pathname)
      await route.abort()
      return
    }
    await route.continue()
  })
  await page.goto(`${origin}/test/playback-browser.html`)
  await page.waitForFunction(async () => {
    const probe = window.playbackProbe
    if (!probe || probe.sent.length < 9) return false
    return (await probe.inspect()).pending === 0
  })
  await page.waitForFunction(() => window.playbackProbe.loads.length > 0)
  const recovered = await page.evaluate(() => [...window.playbackProbe.loads])
  assert.ok(recovered.length > 0)
  assert.ok(
    recovered.every((track) => track === "latest-saved"),
    JSON.stringify(recovered),
  )
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio")
    return audio !== null && !audio.paused && audio.currentTime > 0 && audio.duration === 30
  })

  await page.evaluate(() => window.playbackProbe.choose())
  await page.waitForFunction(async () => {
    const state = await window.playbackProbe.inspect()
    return state.pending === 0 && state.remoteQueue.join(",") === "latest-choice"
  })
  // Allow metadata reporting and delayed acknowledgements to settle before the final
  // snapshot. A transient empty outbox is not convergence.
  await page.waitForTimeout(500)
  const final = await page.evaluate(async () => ({
    ...(await window.playbackProbe.inspect()),
    loads: [...window.playbackProbe.loads],
  }))
  assert.deepEqual(final.queue, ["latest-choice"])
  assert.deepEqual(final.remoteQueue, ["latest-choice"])
  assert.equal(final.pending, 0)
  assert.equal(final.loads.at(-1), "latest-choice")
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio")
    return audio !== null && !audio.paused && audio.currentTime > 0
  })
  assert.deepEqual(forbidden, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: "PASS", recovered, ...final, decodedAudioAdvances: true }))
} finally {
  await browser.close()
}
