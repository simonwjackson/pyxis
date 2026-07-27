import { describe, expect, it } from "bun:test";
import type { SonosRoom } from "./model.js";
import { joinSonosGroup, leaveSonosGroup } from "./transport.js";

const kitchen: SonosRoom = {
  uuid: "RINCON_KITCHEN",
  name: "Kitchen",
  model: null,
  address: "192.168.1.241",
  locationUrl: "http://192.168.1.241:1400/xml/device_description.xml",
  isCoordinator: false,
};

describe("Sonos group transport", () => {
  it("joins a room using the coordinator x-rincon URI", async () => {
    let request: Request | undefined;
    await joinSonosGroup(kitchen, "RINCON_COORD", 1000, async (input, init) => {
      request = new Request(input, init);
      return new Response("<ok/>");
    });

    expect(request?.url).toBe(
      "http://192.168.1.241:1400/MediaRenderer/AVTransport/Control",
    );
    expect(request?.headers.get("soapaction")).toContain("SetAVTransportURI");
    expect(await request?.text()).toContain(
      "<CurrentURI>x-rincon:RINCON_COORD</CurrentURI>",
    );
  });

  it("ungroups a room with BecomeCoordinatorOfStandaloneGroup", async () => {
    let action = "";
    await leaveSonosGroup(kitchen, 1000, async (_input, init) => {
      action = new Headers(init?.headers).get("soapaction") ?? "";
      return new Response("<ok/>");
    });
    expect(action).toContain("BecomeCoordinatorOfStandaloneGroup");
  });
});
