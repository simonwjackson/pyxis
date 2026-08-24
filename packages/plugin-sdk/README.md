# `@pyxis/plugin-sdk`

Write a Pyxis plugin in TypeScript without knowing Rust, stdio framing, restart policy, or
wire error shapes.

```ts
#!/usr/bin/env bun
import { PluginCapability, definePlugin, runPlugin } from "@pyxis/plugin-sdk"

await runPlugin(
  definePlugin({
    manifest: {
      id: "example",
      name: "Example",
      version: "1.0.0",
      capabilities: [PluginCapability.Source],
      configSchema: {},
    },
    capabilities: {
      source: {
        search: async input => {
          // Validate and narrow `input` for this operation here.
          return { results: [] }
        },
      },
    },
  }),
)
```

The SDK writes protocol responses to stdout. Do not write logs to stdout. That stream is
reserved for line-delimited protocol envelopes. `runPlugin` writes malformed-input
diagnostics to stderr and stays alive for the next request.

## Failures

Throw `PluginOperationError` for an expected provider failure:

```ts
throw new PluginOperationError("source.rateLimited", "try again later", true)
```

The third argument states whether the core can retry. Any other thrown value becomes the
permanent `plugin.defect` failure. The process remains alive in both cases.

## Conformance

The conformance helper runs without a Pyxis core:

```ts
import { verifyPlugin } from "@pyxis/plugin-sdk/testing"

const report = await verifyPlugin(plugin, [
  {
    capability: PluginCapability.Source,
    operation: "search",
    input: { query: "Bowie" },
  },
])
```

It verifies the handshake, declared capabilities, malformed-input recovery, and each
provided operation case. Passing this harness proves the plugin contract. It does not
prove provider correctness, credentials, or audio playback.

## Install discovery

Ship an executable named `pyxis-plugin-<id>`. Pyxis scans its plugin directory and every
PATH directory. Installation can therefore be as small as a Nix package that places the
executable in `bin/`.

Media bytes never travel over this protocol. Source operations return a URL plus required
headers. Provider operations such as Soulseek return a completed local file path.

## Output operations

Output plugins receive absolute LAN media URLs; the speaker fetches bytes directly from the
core's HTTP stream endpoint. The Sonos plugin defines the first output operation set:

- `discover` returns groups, coordinators, and reachable rooms.
- `transport.play` accepts `targetId`, `streamUrl`, track `metadata`, and optional `positionMs`.
- `transport.pause`, `transport.stop`, and `transport.state` accept `targetId`.
- `volume.set` accepts `targetId` and an integer `volume` from 0 through 100.
- `group.set` accepts `coordinatorId` and the complete desired `memberIds` list.

These operation bodies remain capability-specific JSON, so plugins must validate them before
performing network or device effects. Expected UPnP faults should use `PluginOperationError`;
the Sonos plugin preserves numeric fault codes as values such as `sonos.upnp.701`.
