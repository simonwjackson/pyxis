import { describe, expect, it } from "bun:test";
import { buildDidlLiteMetadata, createSoapEnvelope } from "./sonos-control.js";

describe("buildDidlLiteMetadata", () => {
	it("includes title, artist, album and class", () => {
		const didl = buildDidlLiteMetadata({
			title: "Song Title",
			artist: "Artist Name",
			album: "Album Name",
		});
		expect(didl).toContain("<dc:title>Song Title</dc:title>");
		expect(didl).toContain("<upnp:artist>Artist Name</upnp:artist>");
		expect(didl).toContain("<upnp:album>Album Name</upnp:album>");
		expect(didl).toContain("object.item.audioItem.musicTrack");
	});

	it("escapes XML-sensitive characters", () => {
		const didl = buildDidlLiteMetadata({
			title: 'A&B <Track> "One"',
			artist: "O'Connor",
			album: "Main & Side",
		});
		expect(didl).toContain("A&amp;B &lt;Track&gt; &quot;One&quot;");
		expect(didl).toContain("O&apos;Connor");
		expect(didl).toContain("Main &amp; Side");
	});

	it("includes album art when provided", () => {
		const didl = buildDidlLiteMetadata({
			title: "Song",
			artist: "Artist",
			album: "Album",
			albumArtUrl: "https://example.com/art.jpg",
		});
		expect(didl).toContain("<upnp:albumArtURI>https://example.com/art.jpg</upnp:albumArtURI>");
	});
});

describe("createSoapEnvelope", () => {
	it("wraps action body in SOAP envelope", () => {
		const actionBody = '<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"></u:Play>';
		const xml = createSoapEnvelope(actionBody);
		expect(xml).toContain("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
		expect(xml).toContain("<s:Envelope");
		expect(xml).toContain("<s:Body>");
		expect(xml).toContain(actionBody);
		expect(xml).toContain("</s:Body>");
		expect(xml).toContain("</s:Envelope>");
	});
});
