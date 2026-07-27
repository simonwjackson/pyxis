import { parseSonosLocation } from "./networkPolicy.js";
import { extractXmlLocalTag } from "./xml.js";

export type SonosFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SonosSoapFault = {
  readonly faultCode: string | null;
  readonly faultString: string | null;
  readonly upnpErrorCode: number | null;
  readonly upnpErrorDescription: string | null;
};

export class SonosSoapError extends Error {
  readonly action: string;
  readonly status: number;
  readonly fault: SonosSoapFault | null;

  constructor(action: string, status: number, fault: SonosSoapFault | null) {
    const detail =
      fault?.upnpErrorCode !== null && fault?.upnpErrorCode !== undefined
        ? ` UPnP ${fault.upnpErrorCode}${fault.upnpErrorDescription ? ` (${fault.upnpErrorDescription})` : ""}`
        : fault?.faultString
          ? ` (${fault.faultString})`
          : "";
    super(`Sonos ${action} request failed (${status})${detail}`);
    this.name = "SonosSoapError";
    this.action = action;
    this.status = status;
    this.fault = fault;
  }
}

export function parseSoapFault(xml: string): SonosSoapFault | null {
  const faultBody = extractXmlLocalTag(xml, "Fault");
  if (faultBody === undefined) return null;
  const errorCodeSource = extractXmlLocalTag(faultBody, "errorCode");
  const errorCode = errorCodeSource === undefined
    ? null
    : Number.parseInt(errorCodeSource, 10);
  return {
    faultCode: extractXmlLocalTag(faultBody, "faultcode") ?? null,
    faultString: extractXmlLocalTag(faultBody, "faultstring") ?? null,
    upnpErrorCode: Number.isFinite(errorCode) ? errorCode : null,
    upnpErrorDescription:
      extractXmlLocalTag(faultBody, "errorDescription") ?? null,
  };
}

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
    redirect: "error",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const responseBody = await response.text();
  const fault = parseSoapFault(responseBody);
  if (!response.ok || fault !== null) {
    throw new SonosSoapError(action, response.status, fault);
  }
  return responseBody;
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
