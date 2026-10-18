import { describe, expect, test } from "bun:test"
import {
  discoverTopology,
  parseDeviceDescription,
  parseZoneGroupState,
  refreshKnownTopology,
  type SonosTopology,
  type TopologyEnvironment,
} from "./topology"

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

const config = { seedHosts: [], discoveryTimeoutMs: 10, requestTimeoutMs: 100 }
const knownTopology: SonosTopology = {
  groups: [
    {
      id: "previous-group",
      coordinatorId: "RINCON_BASEMENT",
      coordinatorName: "Basement",
      rooms: [
        {
          id: "RINCON_BASEMENT",
          name: "Basement",
          model: "Era 100",
          address: "192.168.1.118",
          locationUrl: basement,
          coordinator: true,
        },
        {
          id: "RINCON_KITCHEN",
          name: "Kitchen",
          model: "Era 100",
          address: "192.168.1.241",
          locationUrl: kitchen,
          coordinator: false,
        },
      ],
    },
  ],
  refreshedAt: 10,
  authoritative: true,
}

const topologyReaders = [
  {
    name: "discoverTopology",
    read: (environment: TopologyEnvironment, _previous: SonosTopology) =>
      discoverTopology(config, environment),
  },
  {
    name: "refreshKnownTopology",
    read: (environment: TopologyEnvironment, previous: SonosTopology) =>
      refreshKnownTopology(previous, config, environment),
  },
]

for (const { name, read } of topologyReaders) {
  describe(name, () => {
    test.each([
      {
        name: "HTTP failure",
        reply: async () => new Response("unavailable", { status: 503 }),
      },
      {
        name: "network failure",
        reply: async () => {
          throw new Error("connection refused")
        },
      },
      {
        name: "SOAP fault in HTTP 200",
        reply: async () =>
          new Response(
            "<s:Envelope><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError><errorCode>501</errorCode><errorDescription>Action Failed</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>",
          ),
      },
    ])("rejects instead of inventing standalone groups after $name", async ({ reply }) => {
      const environment: TopologyEnvironment = {
        ssdp: { discover: async () => [kitchen, basement] },
        now: () => 123,
        fetch: async (input, init) => {
          if (init?.method === "POST") return reply()
          if (String(input) === basement) {
            return new Response(description("RINCON_BASEMENT", "Basement"))
          }
          if (String(input) === kitchen) {
            return new Response(description("RINCON_KITCHEN", "Kitchen"))
          }
          return new Response("missing", { status: 404 })
        },
      }

      await expect(read(environment, knownTopology)).rejects.toEqual(
        new Error("no Sonos room answered topology refresh"),
      )
    })

    test("rejects when no rooms are known", async () => {
      const environment: TopologyEnvironment = {
        ssdp: { discover: async () => [] },
        now: () => 123,
        fetch: async () => {
          throw new Error("no rooms available")
        },
      }

      await expect(read(environment, { ...knownTopology, groups: [] })).rejects.toEqual(
        new Error("no Sonos room answered topology refresh"),
      )
    })

    test("returns authoritative topology from the second room when the first fails", async () => {
      const environment: TopologyEnvironment = {
        ssdp: { discover: async () => [kitchen, basement] },
        now: () => 123,
        fetch: async (input, init) => {
          const url = new URL(String(input))
          if (init?.method === "POST") {
            return url.hostname === "192.168.1.118"
              ? new Response("unavailable", { status: 503 })
              : new Response(topologyEnvelope)
          }
          if (String(input) === basement) {
            return new Response(description("RINCON_BASEMENT", "Basement"))
          }
          if (String(input) === kitchen) {
            return new Response(description("RINCON_KITCHEN", "Kitchen"))
          }
          return new Response("unreachable", { status: 503 })
        },
      }

      expect(await read(environment, knownTopology)).toEqual({
        groups: [
          {
            id: "group-1",
            coordinatorId: "RINCON_KITCHEN",
            coordinatorName: "Kitchen",
            rooms: knownTopology.groups
              .flatMap((group) => group.rooms)
              .map((room) => ({
                ...room,
                coordinator: room.id === "RINCON_KITCHEN",
              })),
          },
        ],
        refreshedAt: 123,
        authoritative: true,
      })
    })
  })
}

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
