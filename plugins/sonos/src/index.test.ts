import { describe, expect, test } from "bun:test"
import { createPluginRuntime, PluginCapability } from "@pyxis/plugin-sdk"
import { verifyPlugin } from "@pyxis/plugin-sdk/testing"
import { createSonosPlugin } from "./index"
import type { TopologyEnvironment } from "./topology"

const location = "http://192.168.1.10:1400/xml/device_description.xml"
const description =
  "<root><device><roomName>Kitchen</roomName><modelName>Era 100</modelName><UDN>uuid:RINCON_KITCHEN_MR</UDN></device></root>"
const groupState = `<ZoneGroups><ZoneGroup Coordinator="RINCON_KITCHEN" ID="group"><ZoneGroupMember UUID="RINCON_KITCHEN" Location="${location}" ZoneName="Kitchen"/></ZoneGroup></ZoneGroups>`
const topology = `<ZoneGroupState>${groupState
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")}</ZoneGroupState>`

function environment(fault = false): TopologyEnvironment {
  return {
    ssdp: { discover: async () => [location] },
    now: () => 123,
    fetch: async (_input, init) => {
      if (init?.method !== "POST") return new Response(description)
      const action = String(new Headers(init.headers).get("soapaction"))
      if (action.includes("GetZoneGroupState")) return new Response(topology)
      if (fault) {
        return new Response(
          "<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><errorCode>701</errorCode><errorDescription>Transition not available</errorDescription></detail></s:Fault>",
          { status: 500 },
        )
      }
      return new Response("<ok/>")
    },
  }
}

function call(operation: string, input: unknown, id = operation): string {
  return JSON.stringify({
    id,
    request: {
      _tag: "capability.call",
      payload: { capability: "output", operation, input },
    },
  })
}

describe("Sonos output plugin", () => {
  test("passes SDK conformance as an output-only plugin", async () => {
    await expect(
      verifyPlugin(createSonosPlugin(environment()), [
        { capability: PluginCapability.Output, operation: "discover", input: {} },
      ]),
    ).resolves.toEqual({ passed: true, checks: 4 })
  })

  test("discovers rooms through the public output capability", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const result = await runtime.handleLine(call("discover", {}))

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "ready",
            value: {
              refreshedAt: 123,
              groups: [
                {
                  coordinatorId: "RINCON_KITCHEN",
                  rooms: [{ id: "RINCON_KITCHEN", name: "Kitchen" }],
                },
              ],
            },
          },
        },
      },
    })
  })

  test("dispatches transport and volume operations", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const play = await runtime.handleLine(
      call("transport.play", {
        targetId: "RINCON_KITCHEN",
        streamUrl: "http://192.168.1.2:4488/stream/track",
        metadata: { title: "Heroes" },
      }),
    )
    const volume = await runtime.handleLine(
      call("volume.set", { targetId: "RINCON_KITCHEN", volume: 35 }),
    )

    expect(play).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready" } } },
    })
    expect(volume).toMatchObject({
      _tag: "response",
      envelope: { response: { outcome: { status: "ready", value: { volume: 35 } } } },
    })
  })

  test("preserves a UPnP fault's numeric code", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment(true)))

    const result = await runtime.handleLine(
      call("transport.play", {
        targetId: "RINCON_KITCHEN",
        streamUrl: "http://192.168.1.2:4488/stream/track",
        metadata: { title: "Heroes" },
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "sonos.upnp.701", retryable: true },
          },
        },
      },
    })
  })

  test("rejects malformed and semantic operation input permanently", async () => {
    const runtime = createPluginRuntime(createSonosPlugin(environment()))

    const result = await runtime.handleLine(call("volume.set", { volume: 101 }))
    const semantic = await runtime.handleLine(
      call("group.set", {
        coordinatorId: "RINCON_KITCHEN",
        memberIds: ["RINCON_KITCHEN", "RINCON_KITCHEN"],
      }),
    )

    expect(result).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.invalidInput", retryable: false },
          },
        },
      },
    })
    expect(semantic).toMatchObject({
      _tag: "response",
      envelope: {
        response: {
          outcome: {
            status: "unavailable",
            value: { code: "capability.invalidInput", retryable: false },
          },
        },
      },
    })
  })
})
