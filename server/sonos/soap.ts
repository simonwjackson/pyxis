import { parseSonosLocation } from "./networkPolicy.js";

export type SonosFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createSoapEnvelope(service: string, action: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ',
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">`,
    `</u:${action}></s:Body></s:Envelope>`,
  ].join("");
}

export async function getZoneGroupState(
  locationUrl: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<string> {
  const location = parseSonosLocation(locationUrl);
  if (!location) throw new Error("Sonos device location is not allowed");
  const controlUrl = new URL("/ZoneGroupTopology/Control", location.origin);
  const action = "GetZoneGroupState";
  const response = await fetchImpl(controlUrl, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPACTION: `"urn:schemas-upnp-org:service:ZoneGroupTopology:1#${action}"`,
    },
    body: createSoapEnvelope("ZoneGroupTopology", action),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Sonos topology request failed (${response.status})`);
  }
  return response.text();
}
