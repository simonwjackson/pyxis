import {
  definePlugin,
  PluginCapability,
  runPlugin,
  StationSeedKind,
} from "../../../../packages/plugin-sdk/src"

const track = (title: string) => ({
  title,
  externalId: title,
  source: "catalog",
  artist: "Fixture",
  durationMs: 180_000,
})
await runPlugin(
  definePlugin({
    manifest: {
      id: "catalog",
      name: "Fixture",
      version: "1",
      configSchema: {},
      capabilities: [PluginCapability.Source],
      source: { stationSeedKinds: [StationSeedKind.Track] },
    },
    capabilities: {
      source: {
        search: () => ({ tracks: [track("First"), track("Best"), track("Outside")] }),
        "station.create": () => ({ station: { externalId: "radio", name: "Radio" } }),
        "station.next": () => ({ tracks: [track("First"), track("Best")], exhausted: true }),
        "stream.resolve": () => ({
          kind: "remote",
          url: "http://127.0.0.1:1/never-fetched",
          headers: {},
          format: "mp3",
          lossless: false,
        }),
      },
    },
  }),
)
