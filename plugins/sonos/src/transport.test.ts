import { describe, expect, test } from "bun:test"
import type { SonosFetch } from "./soap"
import type { TopologyEnvironment } from "./topology"
import { planGroupUpdate, SonosController } from "./transport"

const alpha = "http://192.168.1.10:1400/xml/device_description.xml"
const beta = "http://192.168.1.11:1400/xml/device_description.xml"
const delta = "http://192.168.1.12:1400/xml/device_description.xml"

const description = (id: string, name: string) =>
  `<root><device><roomName>${name}</roomName><modelName>Era 100</modelName><UDN>uuid:${id}_MR</UDN></device></root>`

const zoneState = [
  '<ZoneGroups><ZoneGroup Coordinator="A" ID="group-a">',
  `<ZoneGroupMember UUID="A" Location="${alpha}" ZoneName="Alpha"/>`,
  `<ZoneGroupMember UUID="B" Location="${beta}" ZoneName="Beta"/>`,
  "</ZoneGroup>",
  '<ZoneGroup Coordinator="D" ID="group-d">',
  `<ZoneGroupMember UUID="D" Location="${delta}" ZoneName="Delta"/>`,
  "</ZoneGroup></ZoneGroups>",
].join("")
function zoneEnvelope(state: string): string {
  return `<s:Envelope><ZoneGroupState>${state
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")}</ZoneGroupState></s:Envelope>`
}

function harness() {
  const calls: { action: string; body: string; url: string }[] = []
  const standalone = new Set<string>()
  let deltaJoined = false
  const descriptions = new Map([
    [alpha, description("A", "Alpha")],
    [beta, description("B", "Beta")],
    [delta, description("D", "Delta")],
  ])
  const fetcher: SonosFetch = async (input, init) => {
    const url = String(input)
    if (init?.method !== "POST") {
      const body = descriptions.get(url)
      return body === undefined ? new Response("missing", { status: 404 }) : new Response(body)
    }
    const header = String(new Headers(init.headers).get("soapaction"))
    const action = header.match(/#([^"']+)/u)?.[1] ?? "unknown"
    const body = String(init.body ?? "")
    calls.push({ action, body, url })
    if (action === "GetZoneGroupState") {
      if (standalone.size === 0 && !deltaJoined) return new Response(zoneEnvelope(zoneState))
      const alphaMembers = [
        `<ZoneGroupMember UUID="A" Location="${alpha}" ZoneName="Alpha"/>`,
        ...(standalone.has("B")
          ? []
          : [`<ZoneGroupMember UUID="B" Location="${beta}" ZoneName="Beta"/>`]),
        ...(deltaJoined
          ? [`<ZoneGroupMember UUID="D" Location="${delta}" ZoneName="Delta"/>`]
          : []),
      ]
      const groups = [
        '<ZoneGroups><ZoneGroup Coordinator="A" ID="group-a">',
        ...alphaMembers,
        "</ZoneGroup>",
        ...(standalone.has("B")
          ? [
              '<ZoneGroup Coordinator="B" ID="group-b">',
              `<ZoneGroupMember UUID="B" Location="${beta}" ZoneName="Beta"/>`,
              "</ZoneGroup>",
            ]
          : []),
        ...(deltaJoined
          ? []
          : [
              '<ZoneGroup Coordinator="D" ID="group-d">',
              `<ZoneGroupMember UUID="D" Location="${delta}" ZoneName="Delta"/>`,
              "</ZoneGroup>",
            ]),
        "</ZoneGroups>",
      ].join("")
      return new Response(zoneEnvelope(groups))
    }
    if (action === "BecomeCoordinatorOfStandaloneGroup") {
      if (url.includes("192.168.1.11")) standalone.add("B")
    }
    if (action === "SetAVTransportURI" && body.includes("x-rincon:A")) deltaJoined = true
    if (action === "GetTransportInfo") {
      return new Response("<CurrentTransportState>PLAYING</CurrentTransportState>")
    }
    if (action === "GetPositionInfo") {
      return new Response(
        "<RelTime>0:00:12</RelTime><TrackDuration>0:03:00</TrackDuration><TrackURI>http://192.168.1.2/stream/track</TrackURI>",
      )
    }
    return new Response("<ok/>")
  }
  const environment: TopologyEnvironment = {
    ssdp: { discover: async () => [alpha, beta, delta] },
    fetch: fetcher,
    now: () => 1,
  }
  return {
    calls,
    controller: new SonosController(
      { seedHosts: [], discoveryTimeoutMs: 10, requestTimeoutMs: 100 },
      environment,
    ),
  }
}

describe("Sonos transport", () => {
  test("loads, seeks, and plays on the group coordinator", async () => {
    const test = harness()

    await test.controller.play({
      targetId: "B",
      streamUrl: "http://192.168.1.2:4488/stream/track",
      positionMs: 12_000,
      metadata: { title: "Heroes", artist: "David Bowie", album: "Heroes" },
    })

    expect(
      test.calls.filter((call) => call.action !== "GetZoneGroupState").map((call) => call.action),
    ).toEqual(["SetAVTransportURI", "Seek", "Play"])
    expect(test.calls.find((call) => call.action === "SetAVTransportURI")?.url).toContain(
      "192.168.1.10",
    )
    expect(test.calls.find((call) => call.action === "SetAVTransportURI")?.body).toContain(
      "David Bowie",
    )
  })

  test("sets group volume through the coordinator", async () => {
    const test = harness()

    await test.controller.setVolume("A", 35)

    expect(test.calls.find((call) => call.action === "SetGroupVolume")).toMatchObject({
      url: expect.stringContaining("192.168.1.10"),
      body: expect.stringContaining("<DesiredVolume>35</DesiredVolume>"),
    })
  })

  test("reads transport position without guessing malformed fields", async () => {
    const test = harness()

    await expect(test.controller.state("A")).resolves.toEqual({
      state: "PLAYING",
      positionMs: 12_000,
      durationMs: 180_000,
      streamUrl: "http://192.168.1.2/stream/track",
    })
  })

  test("plans grouping by leaving rooms before joining new members", async () => {
    const test = harness()
    const topology = await test.controller.topology()

    expect(planGroupUpdate(topology, "A", ["A", "D"])).toMatchObject([
      { type: "leave", room: { id: "B" } },
      { type: "join", room: { id: "D" }, coordinatorId: "A" },
    ])
  })

  test("detaches a desired non-coordinator before joining it elsewhere", async () => {
    const test = harness()
    const topology = await test.controller.topology()

    expect(planGroupUpdate(topology, "D", ["D", "B"])).toMatchObject([
      { type: "leave", room: { id: "B" } },
      { type: "join", room: { id: "B" }, coordinatorId: "D" },
    ])
  })

  test("detaches a joining coordinator's companions before joining it", async () => {
    const test = harness()
    const topology = await test.controller.topology()
    const withCompanion = {
      ...topology,
      groups: topology.groups.map((group) =>
        group.coordinatorId === "D"
          ? {
              ...group,
              rooms: [
                ...group.rooms,
                {
                  id: "E",
                  name: "Echo",
                  model: "Era 100",
                  address: "192.168.1.13",
                  locationUrl: "http://192.168.1.13:1400/xml/device_description.xml",
                  coordinator: false,
                },
              ],
            }
          : group,
      ),
    }

    expect(planGroupUpdate(withCompanion, "A", ["A", "D"])).toMatchObject([
      { type: "leave", room: { id: "B" } },
      { type: "leave", room: { id: "E" } },
      { type: "join", room: { id: "D" }, coordinatorId: "A" },
    ])
  })

  test("applies ungrouping before grouping", async () => {
    const test = harness()

    const updated = await test.controller.setGroup("A", ["A", "D"])

    const actions = test.calls
      .filter((call) => call.action !== "GetZoneGroupState")
      .map((call) => call.action)
    expect(actions).toEqual(["BecomeCoordinatorOfStandaloneGroup", "SetAVTransportURI"])
    expect(
      updated.groups.find((group) => group.coordinatorId === "A")?.rooms.map((room) => room.id),
    ).toEqual(["A", "D"])
  })
})
