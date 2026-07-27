import type { SonosRoom } from "./model.js";
import { sendSoapAction, type SonosFetch } from "./soap.js";
import { escapeXml, extractXmlLocalTag } from "./xml.js";

const AV_TRANSPORT = "AVTransport";
const AV_TRANSPORT_CONTROL = "/MediaRenderer/AVTransport/Control";
const RENDERING_CONTROL = "RenderingControl";
const RENDERING_CONTROL_PATH = "/MediaRenderer/RenderingControl/Control";

export type SonosTrackMetadata = {
  readonly title: string;
  readonly creator?: string | null;
  readonly album?: string | null;
  readonly artworkUrl?: string | null;
  readonly mimeType?: string;
};

export type SonosTransportInfo = {
  readonly state: string;
  readonly status: string;
  readonly speed: string;
};

export type SonosPositionInfo = {
  readonly track: number | null;
  readonly durationSeconds: number | null;
  readonly positionSeconds: number | null;
  readonly uri: string | null;
  readonly title: string | null;
  readonly creator: string | null;
  readonly album: string | null;
  readonly artworkUrl: string | null;
};

function optionalElement(name: string, value: string | null | undefined): string {
  return value ? `<${name}>${escapeXml(value)}</${name}>` : "";
}

export function buildDidlLiteMetadata(
  streamUrl: string,
  metadata: SonosTrackMetadata,
): string {
  const mimeType = metadata.mimeType?.trim() || "audio/mpeg";
  return [
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ',
    'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ',
    'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">',
    '<item id="-1" parentID="-1" restricted="true">',
    `<dc:title>${escapeXml(metadata.title)}</dc:title>`,
    optionalElement("dc:creator", metadata.creator),
    optionalElement("upnp:album", metadata.album),
    optionalElement("upnp:albumArtURI", metadata.artworkUrl),
    "<upnp:class>object.item.audioItem.musicTrack</upnp:class>",
    `<res protocolInfo="http-get:*:${escapeXml(mimeType)}:*">${escapeXml(streamUrl)}</res>`,
    "</item></DIDL-Lite>",
  ].join("");
}

function parseUnsignedInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseSonosTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);
  const seconds = Number.parseInt(match[3] ?? "", 10);
  if (
    !Number.isSafeInteger(hours) ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatSonosTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Sonos seek time must be a non-negative finite number");
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

async function avTransportAction(
  room: SonosRoom,
  action: string,
  body: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<string> {
  return sendSoapAction(
    room.locationUrl,
    AV_TRANSPORT,
    AV_TRANSPORT_CONTROL,
    action,
    body,
    requestTimeoutMs,
    fetchImpl,
  );
}

async function renderingControlAction(
  room: SonosRoom,
  action: string,
  body: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<string> {
  return sendSoapAction(
    room.locationUrl,
    RENDERING_CONTROL,
    RENDERING_CONTROL_PATH,
    action,
    body,
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function setSonosTransportUri(
  room: SonosRoom,
  streamUrl: string,
  metadata: SonosTrackMetadata,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  const didl = buildDidlLiteMetadata(streamUrl, metadata);
  await avTransportAction(
    room,
    "SetAVTransportURI",
    [
      "<InstanceID>0</InstanceID>",
      `<CurrentURI>${escapeXml(streamUrl)}</CurrentURI>`,
      `<CurrentURIMetaData>${escapeXml(didl)}</CurrentURIMetaData>`,
    ].join(""),
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function playSonos(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await avTransportAction(
    room,
    "Play",
    "<InstanceID>0</InstanceID><Speed>1</Speed>",
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function pauseSonos(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await avTransportAction(
    room,
    "Pause",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function stopSonos(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await avTransportAction(
    room,
    "Stop",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function seekSonos(
  room: SonosRoom,
  positionSeconds: number,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await avTransportAction(
    room,
    "Seek",
    [
      "<InstanceID>0</InstanceID>",
      "<Unit>REL_TIME</Unit>",
      `<Target>${formatSonosTime(positionSeconds)}</Target>`,
    ].join(""),
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function getSonosTransportInfo(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<SonosTransportInfo> {
  const response = await avTransportAction(
    room,
    "GetTransportInfo",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
  return {
    state: extractXmlLocalTag(response, "CurrentTransportState") ?? "UNKNOWN",
    status: extractXmlLocalTag(response, "CurrentTransportStatus") ?? "UNKNOWN",
    speed: extractXmlLocalTag(response, "CurrentSpeed") ?? "1",
  };
}

export async function getSonosPositionInfo(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<SonosPositionInfo> {
  const response = await avTransportAction(
    room,
    "GetPositionInfo",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
  const metadata = extractXmlLocalTag(response, "TrackMetaData") ?? "";
  return {
    track: parseUnsignedInteger(extractXmlLocalTag(response, "Track")),
    durationSeconds: parseSonosTime(
      extractXmlLocalTag(response, "TrackDuration"),
    ),
    positionSeconds: parseSonosTime(extractXmlLocalTag(response, "RelTime")),
    uri: extractXmlLocalTag(response, "TrackURI") ?? null,
    title: extractXmlLocalTag(metadata, "title") ?? null,
    creator: extractXmlLocalTag(metadata, "creator") ?? null,
    album: extractXmlLocalTag(metadata, "album") ?? null,
    artworkUrl: extractXmlLocalTag(metadata, "albumArtURI") ?? null,
  };
}

export async function getSonosVolume(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<number | null> {
  const response = await renderingControlAction(
    room,
    "GetVolume",
    "<InstanceID>0</InstanceID><Channel>Master</Channel>",
    requestTimeoutMs,
    fetchImpl,
  );
  return parseUnsignedInteger(extractXmlLocalTag(response, "CurrentVolume"));
}

export async function setSonosVolume(
  room: SonosRoom,
  volume: number,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
    throw new Error("Sonos volume must be an integer from 0 to 100");
  }
  await renderingControlAction(
    room,
    "SetVolume",
    `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>${volume}</DesiredVolume>`,
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function getSonosMute(
  room: SonosRoom,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<boolean | null> {
  const response = await renderingControlAction(
    room,
    "GetMute",
    "<InstanceID>0</InstanceID><Channel>Master</Channel>",
    requestTimeoutMs,
    fetchImpl,
  );
  const value = extractXmlLocalTag(response, "CurrentMute")?.trim();
  if (value === "1" || value?.toLowerCase() === "true") return true;
  if (value === "0" || value?.toLowerCase() === "false") return false;
  return null;
}

export async function setSonosMute(
  room: SonosRoom,
  muted: boolean,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  await renderingControlAction(
    room,
    "SetMute",
    `<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>${muted ? 1 : 0}</DesiredMute>`,
    requestTimeoutMs,
    fetchImpl,
  );
}

export async function joinSonosGroup(
  room: SonosRoom,
  coordinatorUuid: string,
  requestTimeoutMs: number,
  fetchImpl: SonosFetch = fetch,
): Promise<void> {
  const target = `x-rincon:${coordinatorUuid}`;
  await avTransportAction(
    room,
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
  await avTransportAction(
    room,
    "BecomeCoordinatorOfStandaloneGroup",
    "<InstanceID>0</InstanceID>",
    requestTimeoutMs,
    fetchImpl,
  );
}
