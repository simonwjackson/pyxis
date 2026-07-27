import dgram from "node:dgram";
import { parseSonosLocation } from "./networkPolicy.js";

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const SEARCH_TARGET = "urn:schemas-upnp-org:device:ZonePlayer:1";

function locationFromResponse(message: Buffer): string | undefined {
  const match = message.toString("utf8").match(/^LOCATION:\s*(.+)$/im);
  const location = match?.[1]?.trim();
  return location && parseSonosLocation(location) ? location : undefined;
}

export async function discoverSsdpLocations(
  timeoutMs: number,
): Promise<readonly string[]> {
  return new Promise((resolve) => {
    const locations = new Set<string>();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Ignore close races after a socket error.
      }
      resolve([...locations]);
    };
    const timer = setTimeout(finish, timeoutMs);

    socket.on("message", (message) => {
      const location = locationFromResponse(message);
      if (location) locations.add(location);
    });
    socket.on("error", finish);
    socket.bind(SSDP_PORT, "0.0.0.0", () => {
      const payload = Buffer.from(
        [
          "M-SEARCH * HTTP/1.1",
          `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
          'MAN: "ssdp:discover"',
          "MX: 2",
          `ST: ${SEARCH_TARGET}`,
          "",
          "",
        ].join("\r\n"),
      );
      socket.send(payload, SSDP_PORT, SSDP_ADDRESS);
      socket.send(payload, SSDP_PORT, SSDP_ADDRESS);
    });
  });
}
