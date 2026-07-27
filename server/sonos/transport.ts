import type { SonosRoom } from "./model.js";
import { sendSoapAction, type SonosFetch } from "./soap.js";
import { escapeXml } from "./xml.js";

const AV_TRANSPORT = "AVTransport";
const AV_TRANSPORT_CONTROL = "/MediaRenderer/AVTransport/Control";

export async function joinSonosGroup(
  room: SonosRoom,
  coordinatorUuid: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  const target = `x-rincon:${coordinatorUuid}`;
  await sendSoapAction(
    room.locationUrl,
    AV_TRANSPORT,
    AV_TRANSPORT_CONTROL,
    "SetAVTransportURI",
    [
      "<InstanceID>0</InstanceID>",
      `<CurrentURI>${escapeXml(target)}</CurrentURI>`,
      "<CurrentURIMetaData></CurrentURIMetaData>",
    ].join(""),
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function leaveSonosGroup(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await sendSoapAction(
    room.locationUrl,
    AV_TRANSPORT,
    AV_TRANSPORT_CONTROL,
    "BecomeCoordinatorOfStandaloneGroup",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
}
