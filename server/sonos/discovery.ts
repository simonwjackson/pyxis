import type { AppConfig } from "@shared/config.js";
import { parseDeviceDescription } from "./description.js";
import type { SonosDevice, SonosGroup, SonosTopology } from "./model.js";
import { parseSonosLocation, seedHostToLocation } from "./networkPolicy.js";
import { getZoneGroupState, type SonosFetch } from "./soap.js";
import { discoverSsdpLocations } from "./ssdp.js";
import { parseZoneGroupState } from "./topology.js";

export type SonosDiscoveryDeps = {
  readonly fetch?: SonosFetch;
  readonly discoverLocations?: (timeoutMs: number) => Promise<readonly string[]>;
  readonly now?: () => number;
};

async function fetchDescription(
  locationUrl: string,
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<SonosDevice | undefined> {
  const location = parseSonosLocation(locationUrl);
  if (!location) return undefined;
  try {
    const response = await fetchImpl(location, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    return parseDeviceDescription(await response.text(), location.toString());
  } catch {
    return undefined;
  }
}

async function fetchKnownDevices(
  locations: readonly string[],
  timeoutMs: number,
  fetchImpl: SonosFetch,
): Promise<Map<string, SonosDevice>> {
  const devices = await Promise.all(
    locations.map((location) =>
      fetchDescription(location, timeoutMs, fetchImpl),
    ),
  );
  return new Map(
    devices
      .filter((device): device is SonosDevice => device !== undefined)
      .map((device) => [device.uuid, device]),
  );
}

function standaloneGroups(devices: ReadonlyMap<string, SonosDevice>): SonosGroup[] {
  return [...devices.values()]
    .map((device) => ({
      id: `standalone:${device.uuid}`,
      coordinatorUuid: device.uuid,
      coordinatorName: device.name,
      rooms: [{ ...device, isCoordinator: true }],
    }))
    .sort((left, right) =>
      left.coordinatorName.localeCompare(right.coordinatorName),
    );
}

export async function discoverSonosTopology(
  config: AppConfig["sonos"],
  deps: SonosDiscoveryDeps = {},
): Promise<SonosTopology> {
  if (!config.enabled) {
    return { enabled: false, available: false, groups: [], refreshedAt: null };
  }

  const fetchImpl = deps.fetch ?? fetch;
  const discoverLocations = deps.discoverLocations ?? discoverSsdpLocations;
  const now = deps.now ?? Date.now;
  const seedLocations = config.seedHosts
    .map(seedHostToLocation)
    .filter((location): location is string => location !== undefined);
  const ssdpLocations = await discoverLocations(
    Math.min(config.requestTimeoutMs, 2000),
  ).catch(() => []);
  const candidateLocations = [
    ...new Set([...seedLocations, ...ssdpLocations]),
  ];
  let knownDevices = await fetchKnownDevices(
    candidateLocations,
    config.requestTimeoutMs,
    fetchImpl,
  );

  for (const location of candidateLocations) {
    try {
      const envelope = await getZoneGroupState(
        location,
        config.requestTimeoutMs,
        fetchImpl,
      );
      const initialGroups = parseZoneGroupState(envelope, knownDevices);
      const memberLocations = initialGroups.flatMap((group) =>
        group.rooms.map((room) => room.locationUrl),
      );
      const topologyDevices = await fetchKnownDevices(
        memberLocations,
        config.requestTimeoutMs,
        fetchImpl,
      );
      knownDevices = new Map([...knownDevices, ...topologyDevices]);
      const groups = parseZoneGroupState(envelope, knownDevices);
      if (groups.length > 0) {
        return { enabled: true, available: true, groups, refreshedAt: now() };
      }
    } catch {
      // Try the next candidate. One reachable room exposes the full topology.
    }
  }

  const groups = standaloneGroups(knownDevices);
  return {
    enabled: true,
    available: groups.length > 0,
    groups,
    refreshedAt: now(),
  };
}
