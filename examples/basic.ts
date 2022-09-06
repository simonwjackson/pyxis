import { Effect, Console } from "effect"
import * as Pandora from "../src/index.js"

const program = Effect.gen(function* () {
  // Login
  const session = yield* Pandora.login(
    process.env.PANDORA_USERNAME!,
    process.env.PANDORA_PASSWORD!
  )

  yield* Console.log("Logged in successfully")

  // Get stations
  const stations = yield* Pandora.getStationList(session)
  yield* Console.log(`Found ${stations.stations.length} stations`)

  const firstStation = stations.stations[0]
  if (!firstStation) {
    return yield* Console.log("No stations found")
  }

  // Get playlist
  const playlist = yield* Pandora.getPlaylist(session, {
    stationToken: firstStation.stationToken,
    additionalAudioUrl: "HTTP_128_MP3"
  })

  // Extract audio URLs
  const urls = playlist.items
    .map((item) => item.audioUrlMap?.highQuality.audioUrl)
    .filter(Boolean)

  for (const url of urls) {
    yield* Console.log(url)
  }
})

Effect.runPromise(program).catch(console.error)
