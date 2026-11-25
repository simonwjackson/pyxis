import {
  definePlugin,
  PluginCapability,
  runPlugin,
} from "../../../../packages/plugin-sdk/src/index"

const album = {
  externalId: "album-ref",
  title: "Station Album",
  artist: "Station Artist",
  year: 2020,
}
const track = { externalId: "track-ref", title: "Station Song", artist: album.artist }
const results = {
  tracks: [{ source: "catalog", ...track, album: album.title, albumExternalId: album.externalId }],
}
await runPlugin(
  definePlugin({
    manifest: {
      id: "catalog",
      name: "Catalog fixture",
      version: "1",
      configSchema: {},
      capabilities: [PluginCapability.Source],
      source: { operations: ["artist.discography", "track.related"] },
    },
    capabilities: {
      source: {
        search: () => results,
        "artist.discography": () => ({ items: [album] }),
        "track.related": () => ({ items: results.tracks }),
        "album.search": () => ({ albums: [album] }),
        "artist.search": () => ({ artists: [{ externalId: "artist-ref", name: album.artist }] }),
        "album.get": () => ({ ...album, tracks: [{ ...track, trackNumber: 1 }] }),
        "station.list": () => ({ stations: [{ externalId: "station-ref", name: "The station" }] }),
        "station.next": () => ({ ...results, exhausted: true }),
      },
    },
  }),
)
