import { describe, expect, it } from "bun:test";
import type { SonosRoom } from "./model.js";
import type { SonosFetch } from "./soap.js";
import {
  buildDidlLiteMetadata,
  formatSonosTime,
  getSonosMute,
  getSonosPositionInfo,
  getSonosTransportInfo,
  getSonosVolume,
  joinSonosGroup,
  leaveSonosGroup,
  parseSonosTime,
  pauseSonos,
  playSonos,
  seekSonos,
  setSonosMute,
  setSonosTransportUri,
  setSonosVolume,
  stopSonos,
} from "./transport.js";

const kitchen: SonosRoom = {
  uuid: "RINCON_KITCHEN",
  name: "Kitchen",
  model: null,
  address: "192.168.1.241",
  locationUrl: "http://192.168.1.241:1400/xml/device_description.xml",
  isCoordinator: false,
};

function recorder(responseBody = "<ok/>") {
  const requests: Request[] = [];
  const fetchImpl: SonosFetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(responseBody);
  };
  return { requests, fetchImpl };
}

describe("Sonos playback transport", () => {
  it("builds escaped DIDL-Lite music-track metadata", () => {
    const didl = buildDidlLiteMetadata("http://host/stream?id=1&format=mp3", {
      title: "A < B",
      creator: "One & Two",
      album: "Album",
      artworkUrl: "http://host/art?id=1&size=large",
    });
    expect(didl).toContain("<dc:title>A &lt; B</dc:title>");
    expect(didl).toContain("<dc:creator>One &amp; Two</dc:creator>");
    expect(didl).toContain("object.item.audioItem.musicTrack");
    expect(didl).toContain('protocolInfo="http-get:*:audio/mpeg:*"');
    expect(didl).toContain("id=1&amp;format=mp3");
  });

  it("sets the stream URI with SOAP-escaped DIDL metadata", async () => {
    const { requests, fetchImpl } = recorder();
    await setSonosTransportUri(
      kitchen,
      "http://192.168.1.243:8765/stream/track?format=mp3",
      { title: "Track & Title", creator: "Artist" },
      1000,
      fetchImpl,
    );
    const request = requests[0];
    expect(request?.headers.get("soapaction")).toContain("SetAVTransportURI");
    const body = await request?.text();
    expect(body).toContain("<CurrentURI>http://192.168.1.243:8765/stream/track?format=mp3</CurrentURI>");
    expect(body).toContain("&lt;DIDL-Lite");
    expect(body).toContain("Track &amp;amp; Title");
  });

  it("sends play, pause, stop, and relative seek actions", async () => {
    const { requests, fetchImpl } = recorder();
    await playSonos(kitchen, 1000, fetchImpl);
    await pauseSonos(kitchen, 1000, fetchImpl);
    await stopSonos(kitchen, 1000, fetchImpl);
    await seekSonos(kitchen, 3723.9, 1000, fetchImpl);
    expect(requests.map((request) => request.headers.get("soapaction"))).toEqual([
      expect.stringContaining("#Play"),
      expect.stringContaining("#Pause"),
      expect.stringContaining("#Stop"),
      expect.stringContaining("#Seek"),
    ]);
    expect(await requests[3]?.text()).toContain("<Target>1:02:03</Target>");
  });

  it("parses transport and position responses including encoded DIDL", async () => {
    const transportXml = `<GetTransportInfoResponse>
      <CurrentTransportState>PLAYING</CurrentTransportState>
      <CurrentTransportStatus>OK</CurrentTransportStatus><CurrentSpeed>1</CurrentSpeed>
    </GetTransportInfoResponse>`;
    const metadata = `&lt;DIDL-Lite&gt;&lt;item&gt;&lt;dc:title&gt;Title &amp;amp; More&lt;/dc:title&gt;&lt;dc:creator&gt;Artist&lt;/dc:creator&gt;&lt;upnp:album&gt;Album&lt;/upnp:album&gt;&lt;upnp:albumArtURI&gt;/art.jpg&lt;/upnp:albumArtURI&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`;
    const positionXml = `<GetPositionInfoResponse><Track>2</Track>
      <TrackDuration>1:02:03</TrackDuration><RelTime>0:00:09</RelTime>
      <TrackURI>http://host/stream</TrackURI><TrackMetaData>${metadata}</TrackMetaData>
    </GetPositionInfoResponse>`;
    const transport = await getSonosTransportInfo(
      kitchen,
      1000,
      async () => new Response(transportXml),
    );
    const position = await getSonosPositionInfo(
      kitchen,
      1000,
      async () => new Response(positionXml),
    );
    expect(transport).toEqual({ state: "PLAYING", status: "OK", speed: "1" });
    expect(position).toEqual({
      track: 2,
      durationSeconds: 3723,
      positionSeconds: 9,
      uri: "http://host/stream",
      title: "Title & More",
      creator: "Artist",
      album: "Album",
      artworkUrl: "/art.jpg",
    });
  });

  it("gets and sets master volume and mute", async () => {
    expect(
      await getSonosVolume(
        kitchen,
        1000,
        async () => new Response("<CurrentVolume>37</CurrentVolume>"),
      ),
    ).toBe(37);
    expect(
      await getSonosMute(
        kitchen,
        1000,
        async () => new Response("<CurrentMute>1</CurrentMute>"),
      ),
    ).toBe(true);

    const { requests, fetchImpl } = recorder();
    await setSonosVolume(kitchen, 42, 1000, fetchImpl);
    await setSonosMute(kitchen, false, 1000, fetchImpl);
    expect(await requests[0]?.text()).toContain("<DesiredVolume>42</DesiredVolume>");
    expect(await requests[1]?.text()).toContain("<DesiredMute>0</DesiredMute>");
    await expect(setSonosVolume(kitchen, 101, 1000, fetchImpl)).rejects.toThrow(
      "integer from 0 to 100",
    );
  });

  it("parses and formats Sonos times defensively", () => {
    expect(parseSonosTime("12:34:56")).toBe(45_296);
    expect(parseSonosTime("NOT_IMPLEMENTED")).toBeNull();
    expect(parseSonosTime("0:60:00")).toBeNull();
    expect(formatSonosTime(45_296.8)).toBe("12:34:56");
    expect(() => formatSonosTime(-1)).toThrow("non-negative");
  });
});

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
