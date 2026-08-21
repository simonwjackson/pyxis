import { createLiveTransport, createPandoraApi } from "./src/api"
import { createFixtureTransport } from "./src/fixtures"

const username = process.env.PYXIS_PANDORA_USERNAME
const password = process.env.PYXIS_PANDORA_PASSWORD
if (username === undefined || password === undefined) {
  throw new Error("PYXIS_PANDORA_USERNAME and PYXIS_PANDORA_PASSWORD are required")
}
const directory =
  process.env.PYXIS_PANDORA_FIXTURE_DIR ?? new URL("./fixtures", import.meta.url).pathname
const api = createPandoraApi(
  createFixtureTransport({ mode: "record", directory, live: createLiveTransport() }),
)
const session = await api.login({ username, password })
const stations = await api.stations(session)
if (stations[0] !== undefined) await api.stationTracks(session, stations[0].stationToken)
await api.search(session, "David Bowie")
process.stdout.write(`Recorded Pandora fixtures for ${stations.length} stations\n`)
