import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { createPluginRuntime } from "@pyxis/plugin-sdk"
import { createLiveTransport, createPandoraApi } from "./api"
import { createFixtureTransport } from "./fixtures"
import { createPandoraPlugin } from "./index"

const directory =
  process.env.PYXIS_PANDORA_FIXTURE_DIR ?? new URL("../fixtures", import.meta.url).pathname
const required = [
  "auth.partnerLogin.json",
  "auth.userLogin.json",
  "user.getStationList.json",
  "station.getPlaylist.json",
  "music.search.json",
]
const available = required.every((file) => existsSync(join(directory, file)))

test.skipIf(!available)(
  "fresh local fixtures replay login, stations, playlist, and search",
  async () => {
    const api = createPandoraApi(
      createFixtureTransport({ mode: "replay", directory, live: createLiveTransport() }),
    )
    // Replay fixtures contain the encrypted request-independent API responses, so credentials
    // are placeholders. No network request is made in replay mode.
    const session = await api.login({ username: "fixture", password: "fixture" })
    const stations = await api.stations(session)
    expect(stations.length).toBeGreaterThan(0)
    const tracks = await api.stationTracks(session, stations[0]?.stationToken ?? "")
    expect(tracks.some((track) => track.trackToken && track.songName && track.artistName)).toBe(
      true,
    )
    const search = await api.search(session, "David Bowie")
    expect(search).toBeTruthy()
  },
)

test.skipIf(!available)("fresh fixtures replay through the public plugin capability", async () => {
  const api = createPandoraApi(
    createFixtureTransport({ mode: "replay", directory, live: createLiveTransport() }),
  )
  const runtime = createPluginRuntime(createPandoraPlugin(api))
  const call = (operation: string, input: unknown) =>
    runtime.handleLine(
      JSON.stringify({
        id: operation,
        request: {
          _tag: "capability.call",
          payload: {
            capability: "source",
            operation,
            input,
            accountId: "default",
            config: { username: "fixture", password: "fixture" },
          },
        },
      }),
    )

  const stations = await call("stations.list", {})
  expect(stations).toMatchObject({
    _tag: "response",
    envelope: { response: { outcome: { status: "ready" } } },
  })
  const stationId =
    stations._tag === "response" &&
    stations.envelope.response._tag === "capability.call" &&
    stations.envelope.response.outcome.status === "ready" &&
    typeof stations.envelope.response.outcome.value === "object" &&
    stations.envelope.response.outcome.value !== null &&
    "stations" in stations.envelope.response.outcome.value &&
    Array.isArray(stations.envelope.response.outcome.value.stations)
      ? stations.envelope.response.outcome.value.stations[0]?.id
      : undefined
  expect(typeof stationId).toBe("string")
  const tracks = await call("station.tracks", { stationId })
  expect(tracks).toMatchObject({
    _tag: "response",
    envelope: { response: { outcome: { status: "ready" } } },
  })
})
