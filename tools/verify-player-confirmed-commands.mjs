#!/usr/bin/env -S nix shell nixpkgs#nodejs_22 --command node

import assert from "node:assert/strict"

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ??
    "/home/simonwjackson/code/github/simonwjackson/caliper/node_modules/playwright-core/index.mjs"
)
const origin = process.argv[2] ?? "http://127.0.0.1:5182"
const play = { _tag: "transport.play", payload: {} }
const pause = { _tag: "transport.pause", payload: {} }
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/nix/store/zpz1i4yvw469siqssfnpfk4snwz29m3x-chromium-150.0.7871.128/bin/chromium",
  args: ["--no-sandbox", "--mute-audio", "--autoplay-policy=document-user-activation-required"],
})
try {
  const page = await browser.newPage()
  const errors = []
  const forbidden = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || /^\/(rpc|realtime|stream)(\/|$)/.test(url.pathname)) {
      forbidden.push(url.href)
      await route.abort()
      return
    }
    await route.continue()
  })
  const cdp = await page.context().newCDPSession(page)
  // Playwright evaluate/waitForFunction can grant activation. Read and drive the remote
  // directive with userGesture:false so the test cannot unlock the host by inspecting it.
  const inert = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      userGesture: false,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      )
    }
    return result.result.value
  }
  const inspect = () => inert("window.confirmedCommandProbe?.inspect()")
  const waitFor = async (predicate, label) => {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`${label}: ${JSON.stringify(await inspect())}`)
  }
  const direct = (id, command) =>
    inert(`window.confirmedCommandProbe.direct(${JSON.stringify(id)}, ${JSON.stringify(command)})`)
  const click = async (action) => {
    await inert(`window.confirmedCommandProbe.armClick(${JSON.stringify(action)})`)
    await page.mouse.click(10, 10)
  }
  const frames = () =>
    inert("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  await page.goto(`${origin}/test/confirmed-command-browser.html`)
  await waitFor(async () => (await inspect())?.ready === true, "fixture readiness")
  assert.equal(await inert("navigator.userActivation.hasBeenActive"), false)

  // This is a native browser refusal, not a replacement HTMLMediaElement.play().
  await direct("remote-play", play)
  await waitFor(async () => {
    const current = await inspect()
    return (
      current.state?.state === "unavailable" &&
      current.state.reason.kind === "failed" &&
      current.pending === 0
    )
  }, "native autoplay refusal must appear on host")
  const refused = await inspect()
  assert.equal(refused.transport, "stopped")
  assert.equal(refused.remoteTransport, "stopped")
  assert.equal(refused.pending, 0)
  assert.ok(!refused.sent.includes("transport.play"))
  assert.match(
    refused.state.reason.message,
    /NotAllowedError:/,
    "the host must report Chromium's native permission refusal",
  )
  assert.deepEqual(refused.loads, ["first-track"])
  assert.ok(refused.nativeAudio, "the refused native media element must exist")
  assert.equal(refused.nativeAudio.paused, true)
  assert.equal(refused.nativeAudio.currentTime, 0)
  assert.equal(refused.nativeAudio.volume, 1)
  assert.equal(refused.nativeAudio.muted, false)
  assert.equal(
    await inert(`window.confirmedCommandProbe.receipt("remote-play", ${JSON.stringify(play)})`),
    false,
  )
  assert.equal(await inert("navigator.userActivation.hasBeenActive"), false)

  await direct("retained-volume", { _tag: "volume.set", payload: { volume: 70 } })
  await waitFor(async () => {
    const current = await inspect()
    return current.volume === 70 && current.pending === 0
  }, "unrelated volume directive settlement")
  await inert("window.confirmedCommandProbe.refresh()")
  await frames()
  const retainedFailure = await inspect()
  assert.equal(retainedFailure.state.state, "unavailable")
  assert.equal(retainedFailure.state.reason.message, refused.state.reason.message)
  assert.equal(retainedFailure.transport, "stopped")
  assert.equal(retainedFailure.nativeAudio.paused, true)
  assert.equal(await inert("navigator.userActivation.hasBeenActive"), false)

  // Exercise the real local click path through worker preview and source attachment.
  await click({ kind: "Album", track: "click-album" })
  await waitFor(async () => {
    const state = await inspect()
    return (
      state.remoteTransport === "playing" &&
      (await inert(
        "Boolean(document.querySelector('audio') && !document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0)",
      ))
    )
  }, "native click must start decoded audio")
  assert.deepEqual((await inspect()).queue, ["click-album"])

  const clickPause = async () => {
    await click({ kind: "Pause" })
    await waitFor(async () => (await inspect()).remoteTransport === "paused", "local Pause")
  }
  await clickPause()
  // The failed delivery remains retryable under the SAME public command identity.
  await direct("remote-play", play)
  await waitFor(async () => {
    const state = await inspect()
    return state.remoteTransport === "playing" && state.pending === 0
  }, "retry refused directive")
  assert.equal(
    await inert(`window.confirmedCommandProbe.receipt("remote-play", ${JSON.stringify(play)})`),
    true,
  )
  await clickPause()
  const beforeDuplicate = await inspect()
  await direct("remote-play", play)
  await frames()
  const duplicate = await inspect()
  assert.equal(duplicate.transport, "paused")
  assert.equal(duplicate.remoteTransport, "paused")
  assert.equal(await inert("document.querySelector('audio')?.paused"), true)
  assert.equal(
    duplicate.sent.filter((tag) => tag === "transport.play").length,
    beforeDuplicate.sent.filter((tag) => tag === "transport.play").length,
  )
  assert.deepEqual(duplicate.loads, beforeDuplicate.loads)

  const beforeStorageFailure = duplicate.sent.filter((tag) => tag === "transport.play").length
  await inert("window.confirmedCommandProbe.failNextPlayWrite()")
  await click({ kind: "Album", track: "failed-album" })
  await waitFor(async () => {
    const state = (await inspect()).state
    return (
      state?.state === "unavailable" &&
      state.reason.kind === "failed" &&
      state.reason.message.includes("storage failure")
    )
  }, "storage failure must appear on host")
  const rollback = await inspect()
  assert.deepEqual(
    rollback.queue,
    ["failed-album"],
    "Play failure must not undo successful album selection",
  )
  assert.equal(rollback.transport, "stopped")
  assert.equal(await inert("document.querySelector('audio')?.paused"), true)
  assert.equal(rollback.sent.filter((tag) => tag === "transport.play").length, beforeStorageFailure)
  await click({ kind: "Play" })
  await waitFor(async () => (await inspect()).remoteTransport === "playing", "retry failed album")

  const beforeCancellation = await inspect()
  await inert("window.confirmedCommandProbe.holdStreams()")
  await click({ kind: "Album", track: "held-album" })
  await waitFor(async () => (await inspect()).loads.includes("held-album"), "held stream")
  await direct("cancel-load", pause)
  // Unconfirmed Play is not durable Playing. Cancellation must not invent a Pause
  // receipt or wait for a stream that this test deliberately leaves unresolved.
  await waitFor(async () => {
    const state = await inspect()
    return (
      state.transport === "stopped" && state.remoteTransport === "stopped" && state.pending === 0
    )
  }, "Pause must interrupt an unresolved explicit Play")
  await inert("window.confirmedCommandProbe.releaseStream()")
  await frames()
  const cancelled = await inspect()
  assert.deepEqual(cancelled.queue, ["held-album"])
  assert.equal(cancelled.transport, "stopped")
  assert.equal(cancelled.remoteTransport, "stopped")
  assert.equal(
    cancelled.sent.filter((tag) => tag === "transport.play").length,
    beforeCancellation.sent.filter((tag) => tag === "transport.play").length,
  )
  assert.equal(
    cancelled.sent.filter((tag) => tag === "transport.pause").length,
    beforeCancellation.sent.filter((tag) => tag === "transport.pause").length,
  )
  assert.equal(await inert("document.querySelector('audio')?.paused ?? true"), true)
  // Real decoded media and native seeked/ended events, without a service or speaker.
  await click({ kind: "Album", track: "mode-album" })
  await waitFor(async () => {
    const state = await inspect()
    return state.transport === "playing" && state.durationMs === 30000 && state.pending === 0
  }, "native metadata must establish seek duration")
  await direct("native-repeat-mode", { _tag: "repeat.set", payload: { mode: "one" } })
  await direct("native-shuffle-mode", { _tag: "shuffle.set", payload: { enabled: true } })
  await waitFor(async () => {
    const state = await inspect()
    return state.repeat === "one" && state.shuffle === true && state.pending === 0
  }, "native host mode commands")
  await direct("native-seek", { _tag: "transport.seek", payload: { positionMs: 5000 } })
  await waitFor(async () => {
    const state = await inspect()
    return (
      state.positionMs === 5000 &&
      state.nativeAudio?.currentTime >= 5 &&
      state.nativeAudio.currentTime < 7 &&
      state.pending === 0
    )
  }, "native seek confirmation must precede durable state")
  assert.equal(
    await inert(
      `window.confirmedCommandProbe.receipt("native-seek", ${JSON.stringify({ _tag: "transport.seek", payload: { positionMs: 5000 } })})`,
    ),
    true,
  )
  await direct("native-duplicates", {
    _tag: "queue.add",
    payload: { trackIds: ["mode-album", "tail"] },
  })
  await direct("native-restore-order", { _tag: "shuffle.set", payload: { enabled: false } })
  await waitFor(async () => {
    const state = await inspect()
    return state.shuffle === false && state.queue?.length === 3 && state.pending === 0
  }, "native host restores duplicate queue order")
  const ordered = await inspect()
  assert.deepEqual(ordered.queue, ["mode-album", "mode-album", "tail"])
  assert.deepEqual(ordered.queueOrder, [0, 1, 2])
  assert.equal(ordered.cursor, 0)
  assert.equal(ordered.positionMs, 5000)
  const endedBefore = ordered.sent.filter((tag) => tag === "transport.trackEnded").length
  await direct("native-seek-near-end", { _tag: "transport.seek", payload: { positionMs: 29500 } })
  await waitFor(async () => {
    const state = await inspect()
    return (
      state.sent.filter((tag) => tag === "transport.trackEnded").length > endedBefore &&
      state.transport === "playing" &&
      state.nativeAudio?.paused === false &&
      state.nativeAudio.currentTime < 5
    )
  }, "native repeat-one must restart decoded audio at natural end")
  assert.equal((await inspect()).cursor, 0)

  assert.deepEqual(forbidden, [])
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      result: "PASS",
      nativeAutoplayRefusal: true,
      hostErrorSurvivesUnrelatedDirectiveAndRefresh: true,
      nativeClickStartsDecodedAudio: true,
      failedDirectiveRetriesWithSameId: true,
      durableReceiptDoesNotRestartPausedAudio: true,
      failedPlayKeepsSelectedAlbum: true,
      storageRollbackPausesAudio: true,
      pauseCancelsUnresolvedPlay: true,
      nativeSeekConfirmedBeforeReceipt: true,
      reversibleDuplicateQueueOrder: true,
      nativeRepeatOneAtNaturalEnd: true,
      forbiddenRequests: 0,
    }),
  )
} finally {
  await browser.close()
}
