import { parseSonosLocation } from "./networkPolicy.js";

export type SonosFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createSoapEnvelope(
  service: string,
  action: string,
  body = "",
): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ',
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
    `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">`,
    body,
    `</u:${action}></s:Body></s:Envelope>`,
  ].join("");
}

export async function sendSoapAction(
  locationUrl: string,
  service: string,
  controlPath: string,
  action: string,
  body: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<string> {
  const location = parseSonosLocation(locationUrl);
  if (!location) throw new Error("Sonos device location is not allowed");
  const controlUrl = new URL(controlPath, location.origin);
  const response = await fetchImpl(controlUrl, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPACTION: `"urn:schemas-upnp-org:service:${service}:1#${action}"`,
    },
    body: createSoapEnvelope(service, action, body),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Sonos ${action} request failed (${response.status})`);
  }
  return response.text();
}

export async function getZoneGroupState(
  locationUrl: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<string> {
  return sendSoapAction(
    locationUrl,
    "ZoneGroupTopology",
    "/ZoneGroupTopology/Control",
    "GetZoneGroupState",
    "",
    requestTimeoutMs,
    fetchImpl,
  );
}
