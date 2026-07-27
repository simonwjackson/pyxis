import type { SonosDevice } from "./model.js";
import { normalizeSonosUuid } from "./model.js";
import { parseSonosLocation } from "./networkPolicy.js";
import { extractXmlTag } from "./xml.js";

export function parseDeviceDescription(
  xml: string,
  locationUrl: string,
): SonosDevice | undefined {
  const location = parseSonosLocation(locationUrl);
  const uuid = extractXmlTag(xml, "UDN");
  const name = extractXmlTag(xml, "roomName");
  if (!location || !uuid || !name) return undefined;

  return {
    uuid: normalizeSonosUuid(uuid),
    name,
    model: extractXmlTag(xml, "modelName") ?? null,
    address: location.hostname,
    locationUrl: location.toString(),
  };
}
