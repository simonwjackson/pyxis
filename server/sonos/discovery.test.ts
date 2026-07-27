import { describe, expect, it } from "bun:test";
import { decodeConfig } from "@shared/config.js";
import { discoverSonosTopology } from "./discovery.js";
import { parseDeviceDescription } from "./description.js";
import { parseSonosLocation } from "./networkPolicy.js";
import { parseZoneGroupState } from "./topology.js";

const basementLocation =
  "http://192.168.1.118:1400/xml/device_description.xml";
const kitchenLocation =
  "http://192.168.1.241:1400/xml/device_description.xml";

function description(
  uuid: string,
  name: string,
  model = "SYMFONISK Bookshelf",
): string {
  return `<root><device><roomName>${name}</roomName><modelName>${model}</modelName><UDN>uuid:${uuid}_MR</UDN></device></root>`;
}

const topologyState = [
  '<ZoneGroups><ZoneGroup Coordinator="RINCON_KITCHEN" ID="group-1">',
  `<ZoneGroupMember UUID="RINCON_BASEMENT" Location="${basementLocation}" ZoneName="Basement"/>`,
  `<ZoneGroupMember UUID="RINCON_KITCHEN" Location="${kitchenLocation}" ZoneName="Kitchen"/>`,
  "</ZoneGroup></ZoneGroups>",
].join("");
const topologyEnvelope = `<s:Envelope><s:Body><u:GetZoneGroupStateResponse><ZoneGroupState>${topologyState
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")}</ZoneGroupState></u:GetZoneGroupStateResponse></s:Body></s:Envelope>`;

describe("fresh Sonos discovery", () => {
  it("accepts only private HTTP Sonos description locations", () => {
    expect(parseSonosLocation(basementLocation)?.hostname).toBe("192.168.1.118");
    expect(
      parseSonosLocation("https://192.168.1.118:1400/xml/device_description.xml"),
    ).toBeUndefined();
    expect(
      parseSonosLocation("http://example.com:1400/xml/device_description.xml"),
    ).toBeUndefined();
  });

  it("normalizes device-description UUIDs", () => {
    expect(
      parseDeviceDescription(
        description("RINCON_BASEMENT", "Basement"),
        basementLocation,
      ),
    ).toMatchObject({
      uuid: "RINCON_BASEMENT",
      name: "Basement",
      address: "192.168.1.118",
    });
  });

  it("parses existing groups and identifies the coordinator", () => {
    const groups = parseZoneGroupState(topologyEnvelope);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.coordinatorUuid).toBe("RINCON_KITCHEN");
    expect(groups[0]?.rooms.map((room) => room.name)).toEqual([
      "Basement",
      "Kitchen",
    ]);
    expect(groups[0]?.rooms.find((room) => room.isCoordinator)?.name).toBe(
      "Kitchen",
    );
  });

  it("uses configured seeds when SSDP returns no results", async () => {
    const responses = new Map<string, string>([
      [basementLocation, description("RINCON_BASEMENT", "Basement")],
      [kitchenLocation, description("RINCON_KITCHEN", "Kitchen")],
      ["http://192.168.1.118:1400/ZoneGroupTopology/Control", topologyEnvelope],
    ]);
    const topology = await discoverSonosTopology(
      decodeConfig({
        sonos: { enabled: true, seedHosts: ["192.168.1.118"] },
      }).sonos,
      {
        discoverLocations: async () => [],
        now: () => 123,
        fetch: async (input) => {
          const url = String(input);
          const body = responses.get(url);
          return body === undefined
            ? new Response("missing", { status: 404 })
            : new Response(body, { status: 200 });
        },
      },
    );

    expect(topology).toMatchObject({
      enabled: true,
      available: true,
      refreshedAt: 123,
    });
    expect(topology.groups[0]?.coordinatorName).toBe("Kitchen");
    expect(topology.groups[0]?.rooms[0]?.model).toBe("SYMFONISK Bookshelf");
  });
});
