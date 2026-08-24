import { describe, expect, test } from "bun:test"
import { discoverTopology, parseDeviceDescription, parseZoneGroupState } from "./topology"

const basement = "http://192.168.1.118:1400/xml/device_description.xml"
const kitchen = "http://192.168.1.241:1400/xml/device_description.xml"
const unreachable = "http://192.168.1.242:1400/xml/device_description.xml"

function description(id: string, name: string, model = "Era 100"): string {
  return `<root><device><roomName>${name}</roomName><modelName>${model}</modelName><UDN>uuid:${id}_MR</UDN></device></root>`
}

const state = [
  '<ZoneGroups><ZoneGroup Coordinator="RINCON_KITCHEN" ID="group-1">',
  `<ZoneGroupMember UUID="RINCON_BASEMENT" Location="${basement}" ZoneName="Basement"/>`,
  `<ZoneGroupMember UUID="RINCON_KITCHEN" Location="${kitchen}" ZoneName="Kitchen"/>`,
  `<ZoneGroupMember UUID="RINCON_GONE" Location="${unreachable}" ZoneName="Gone"/>`,
  "</ZoneGroup></ZoneGroups>",
].join("")
const encoded = state.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const topologyEnvelope = `<s:Envelope><s:Body><u:GetZoneGroupStateResponse><ZoneGroupState>${encoded}</ZoneGroupState></u:GetZoneGroupStateResponse></s:Body></s:Envelope>`

describe("Sonos topology", () => {
  test("normalizes device identity", () => {
    expect(parseDeviceDescription(description("RINCON_BASEMENT", "Basement"), basement)).toEqual({
      id: "RINCON_BASEMENT",
      name: "Basement",
      model: "Era 100",
      address: "192.168.1.118",
      locationUrl: basement,
      coordinator: false,
    })
  })

  test("parses groups and drops rooms that were not reachable during discovery", () => {
    const devices = new Map(
      [
        parseDeviceDescription(description("RINCON_BASEMENT", "Basement"), basement),
        parseDeviceDescription(description("RINCON_KITCHEN", "Kitchen"), kitchen),
      ].flatMap((device) => (device === undefined ? [] : [[device.id, device] as const])),
    )

    const groups = parseZoneGroupState(topologyEnvelope, devices)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.coordinatorId).toBe("RINCON_KITCHEN")
    expect(groups[0]?.rooms.map((room) => room.name)).toEqual(["Basement", "Kitchen"])
  })

  test("fills in reachable topology members missed by SSDP", async () => {
    const topology = await discoverTopology(
      { seedHosts: [], discoveryTimeoutMs: 10, requestTimeoutMs: 100 },
      {
        ssdp: { discover: async () => [kitchen] },
        now: () => 100,
        fetch: async (input, init) => {
          if (init?.method === "POST") return new Response(topologyEnvelope)
          if (String(input) === kitchen) {
            return new Response(description("RINCON_KITCHEN", "Kitchen"))
          }
          if (String(input) === basement) {
            return new Response(description("RINCON_BASEMENT", "Basement"))
          }
          return new Response("unreachable", { status: 503 })
        },
      },
    )

    expect(topology.groups[0]?.rooms.map((room) => room.name)).toEqual(["Basement", "Kitchen"])
  })

  test("uses seed hosts and ignores an unreachable speaker", async () => {
    const responses = new Map<string, Response>([
      [basement, new Response(description("RINCON_BASEMENT", "Basement"))],
      [kitchen, new Response(description("RINCON_KITCHEN", "Kitchen"))],
      [unreachable, new Response("unreachable", { status: 503 })],
    ])
    const topology = await discoverTopology(
      {
        seedHosts: ["192.168.1.118", "192.168.1.241", "192.168.1.242"],
        discoveryTimeoutMs: 10,
        requestTimeoutMs: 100,
      },
      {
        ssdp: { discover: async () => [] },
        now: () => 123,
        fetch: async (input, init) => {
          if (init?.method === "POST") return new Response(topologyEnvelope)
          return responses.get(String(input)) ?? new Response("missing", { status: 404 })
        },
      },
    )

    expect(topology.refreshedAt).toBe(123)
    expect(topology.groups[0]?.coordinatorName).toBe("Kitchen")
    expect(topology.groups[0]?.rooms.map((room) => room.name)).toEqual(["Basement", "Kitchen"])
  })
})
