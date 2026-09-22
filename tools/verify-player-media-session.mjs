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
  const page = await browser.newPage()
  const errors = []
  const forbidden = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || /^\/(rpc|realtime|stream)(\/|$)/.test(url.pathname)) {
      forbidden.push(url.pathname)
      await route.abort()
      return
    }
    await route.continue()
  })
  await page.goto(`${origin}/test/media-session-browser.html`)
  await page.waitForFunction(() => {
    const audio = document.querySelector("audio")
    return (
      audio !== null &&
      !audio.paused &&
      audio.currentTime > 0 &&
      navigator.mediaSession.playbackState === "playing" &&
      navigator.mediaSession.metadata?.title === "Track 1"
    )
  })
  const before = await page.evaluate(() => ({
    src: document.querySelector("audio").src,
    time: document.querySelector("audio").currentTime,
  }))
  await page.evaluate(() => window.mediaSessionProbe.failSync())
  await page.waitForFunction(() => window.mediaSessionProbe.inspect().committedOffline)
  // Wait through the commit's passive effects before checking the native media session.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
  // Audio must keep advancing after React publishes the failed sync verdict.
  await page.waitForFunction(
    (time) => document.querySelector("audio").currentTime > time + 0.5,
    before.time,
  )
  const after = await page.evaluate(() => ({
    state: navigator.mediaSession.playbackState,
    title: navigator.mediaSession.metadata?.title,
    src: document.querySelector("audio").src,
    time: document.querySelector("audio").currentTime,
    paused: document.querySelector("audio").paused,
    offlineSyncs: window.mediaSessionProbe.inspect().offlineSyncs,
  }))
  assert.equal(after.state, "playing", "sync failure cleared the native media session")
  assert.equal(after.title, "Track 1")
  assert.equal(after.src, before.src)
  assert.equal(after.paused, false)
  assert.ok(after.time > before.time)
  assert.deepEqual(forbidden, [])
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      result: "PASS",
      state: after.state,
      title: after.title,
      audioAdvanced: true,
      offlineSyncs: after.offlineSyncs,
    }),
  )
} finally {
  await browser.close()
}
