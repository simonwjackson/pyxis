import type { SonosDevice, SonosGroup, SonosRoom } from "./model.js";
import { normalizeSonosUuid } from "./model.js";
import { parseSonosLocation } from "./networkPolicy.js";
import { extractXmlTag, parseXmlAttributes } from "./xml.js";

export function parseZoneGroupState(
  soapEnvelope: string,
  knownDevices: ReadonlyMap<string, SonosDevice> = new Map(),
): readonly SonosGroup[] {
  const state = extractXmlTag(soapEnvelope, "ZoneGroupState") ?? soapEnvelope;
  const groups: SonosGroup[] = [];
  const groupPattern = /<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/gi;

  for (const groupMatch of state.matchAll(groupPattern)) {
    const groupAttributes = parseXmlAttributes(groupMatch[1] ?? "");
    const groupBody = groupMatch[2] ?? "";
    const coordinatorUuid = normalizeSonosUuid(
      groupAttributes.Coordinator ?? "",
    );
    const id = groupAttributes.ID;
    if (!coordinatorUuid || !id) continue;

    const rooms: SonosRoom[] = [];
    const memberPattern = /<ZoneGroupMember\b([^>]*)\/?\s*>/gi;
    for (const memberMatch of groupBody.matchAll(memberPattern)) {
      const attributes = parseXmlAttributes(memberMatch[1] ?? "");
      const uuid = normalizeSonosUuid(attributes.UUID ?? "");
      const name = attributes.ZoneName?.trim();
      const location = parseSonosLocation(attributes.Location ?? "");
      if (!uuid || !name || !location || attributes.Invisible === "1") {
        continue;
      }
      const known = knownDevices.get(uuid);
      rooms.push({
        uuid,
        name,
        model: known?.model ?? null,
        address: location.hostname,
        locationUrl: location.toString(),
        isCoordinator: uuid === coordinatorUuid,
      });
    }

    const coordinator = rooms.find((room) => room.isCoordinator);
    if (!coordinator || rooms.length === 0) continue;
    groups.push({
      id,
      coordinatorUuid,
      coordinatorName: coordinator.name,
      rooms: [...rooms].sort((left, right) => left.name.localeCompare(right.name)),
    });
  }

  return [...groups].sort((left, right) =>
    left.coordinatorName.localeCompare(right.coordinatorName),
  );
}
