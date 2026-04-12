import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { Effect } from "effect";
import { createLogger } from "../../src/logger.js";
import { getAppConfig } from "./sourceManager.js";
import { SonosDiscoveryError, SonosNotFoundError } from "./sonos-errors.js";

const log = createLogger("sonos").child({ component: "discovery" });

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const SONOS_SEARCH_TARGET = "urn:schemas-upnp-org:device:ZonePlayer:1";
const SONOS_DEVICE_DESCRIPTION_PATH = "/xml/device_description.xml";
const DEFAULT_DISCOVERY_TIMEOUT_MS = 1500;
const DEFAULT_DISCOVERY_INTERVAL_SECONDS = 30;
const SUBNET_PROBE_TIMEOUT_MS = 400;
const SUBNET_PROBE_MAX_HOSTS = 512;
const SUBNET_PROBE_CONCURRENCY = 64;
const EMPTY_DISCOVERY_GRACE_REFRESHES = 5;

export type SonosSpeaker = {
	readonly uuid: string;
	readonly name: string;
	readonly ip: string;
	readonly port: number;
	readonly groupId: string;
	readonly isCoordinator: boolean;
	readonly model: string;
	readonly avTransportControlUrl: string;
	readonly avTransportEventSubUrl: string;
	readonly renderingControlUrl: string;
	readonly zoneGroupTopologyControlUrl: string;
};

type GroupStatus = {
	readonly groupId: string;
	readonly coordinatorUuid: string;
};

type SubnetProbeInterface = {
	readonly family: string | number;
	readonly internal: boolean;
	readonly address: string;
	readonly netmask: string;
};

let cachedSpeakers: readonly SonosSpeaker[] = [];
let lastRefreshAt = 0;
let refreshInFlight: Promise<void> | undefined;
let refreshInterval: ReturnType<typeof setInterval> | undefined;
let consecutiveEmptyRefreshes = 0;

function normalizeUuid(uuid: string): string {
	const trimmed = uuid.trim();
	const withoutPrefix = trimmed.startsWith("uuid:") ? trimmed.slice(5) : trimmed;
	const separatorIndex = withoutPrefix.indexOf("::");
	return separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, separatorIndex);
}

function getSonosConfig(): { enabled: boolean; discoveryInterval: number } {
	const config = getAppConfig();
	if (!config) {
		return {
			enabled: true,
			discoveryInterval: DEFAULT_DISCOVERY_INTERVAL_SECONDS,
		};
	}
	return {
		enabled: config.sonos.enabled,
		discoveryInterval: config.sonos.discoveryInterval,
	};
}

function extractXmlTag(xml: string, tagName: string): string | undefined {
	const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
	const match = xml.match(regex);
	if (!match?.[1]) return undefined;
	return match[1].trim();
}

function parseXmlAttributes(tagAttributes: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const attrRegex = /([a-zA-Z_][\w:.-]*)="([^"]*)"/g;
	for (const match of tagAttributes.matchAll(attrRegex)) {
		const key = match[1];
		const value = match[2];
		if (!key || value == null) continue;
		attrs[key] = value;
	}
	return attrs;
}

function parseSsdpHeaders(packet: string): Record<string, string> {
	const result: Record<string, string> = {};
	const lines = packet.split(/\r?\n/);
	for (const line of lines) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) continue;
		const key = line.slice(0, separatorIndex).trim().toLowerCase();
		const value = line.slice(separatorIndex + 1).trim();
		if (!key) continue;
		result[key] = value;
	}
	return result;
}

function resolveServicePath(
	path: string | undefined,
	location: URL,
	fallback: string,
): string {
	if (!path) return fallback;
	try {
		const resolved = new URL(path, location);
		return `${resolved.pathname}${resolved.search}`;
	} catch {
		return fallback;
	}
}

function extractServiceField(
	xml: string,
	serviceTypeSuffix: string,
	field: "controlURL" | "eventSubURL",
): string | undefined {
	const serviceRegex = /<service[^>]*>([\s\S]*?)<\/service>/gi;
	for (const match of xml.matchAll(serviceRegex)) {
		const serviceBlock = match[1];
		if (!serviceBlock) continue;
		const serviceType = extractXmlTag(serviceBlock, "serviceType");
		if (!serviceType?.includes(serviceTypeSuffix)) continue;
		return extractXmlTag(serviceBlock, field);
	}
	return undefined;
}

function decodeXmlEntities(text: string): string {
	return text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", "\"")
		.replaceAll("&#39;", "'")
		.replaceAll("&amp;", "&");
}

async function fetchWithTimeout(
	url: string,
	timeoutMs: number,
	init?: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function toSpeakerDescriptionUrl(ip: string, port = 1400): string {
	return `http://${ip}:${String(port)}${SONOS_DEVICE_DESCRIPTION_PATH}`;
}

function ipv4ToInt(address: string): number | undefined {
	const parts = address.split(".").map((part) => Number.parseInt(part, 10));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
		return undefined;
	}
	const [a = 0, b = 0, c = 0, d = 0] = parts;
	return (((a * 256 + b) * 256 + c) * 256 + d) >>> 0;
}

function intToIpv4(value: number): string {
	return [
		(value >>> 24) & 255,
		(value >>> 16) & 255,
		(value >>> 8) & 255,
		value & 255,
	].join(".");
}

function listSubnetProbeCandidates(): readonly string[] {
	const candidates = new Set<string>();
	const interfaces = networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		const entries = (interfaces[name] ?? []) as SubnetProbeInterface[];
		for (const entry of entries) {
			const family = typeof entry.family === "string" ? entry.family : String(entry.family);
			if (family !== "IPv4" || entry.internal) continue;
			const addressInt = ipv4ToInt(entry.address);
			const netmaskInt = ipv4ToInt(entry.netmask);
			if (addressInt == null || netmaskInt == null) continue;

			const hostMask = (~netmaskInt) >>> 0;
			const hostCount = Math.max(0, hostMask - 1);
			if (hostCount === 0 || hostCount > SUBNET_PROBE_MAX_HOSTS) continue;

			const network = (addressInt & netmaskInt) >>> 0;
			const broadcast = (network | hostMask) >>> 0;
			for (let current = network + 1; current < broadcast; current += 1) {
				if (current === addressInt) continue;
				candidates.add(intToIpv4(current >>> 0));
			}
		}
	}
	return [...candidates];
}

async function probeSpeakerDescriptionUrl(locationUrl: string): Promise<string | undefined> {
	try {
		const speaker = await fetchSpeakerDescription(locationUrl, SUBNET_PROBE_TIMEOUT_MS);
		return speaker ? locationUrl : undefined;
	} catch {
		return undefined;
	}
}

async function discoverLocationUrlsViaSsdp(): Promise<readonly string[]> {
	return new Promise((resolve, reject) => {
		const socket = createSocket("udp4");
		const locations = new Set<string>();
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			try {
				socket.close();
			} catch {
				// ignore socket close errors
			}
			resolve([...locations]);
		};

		socket.on("error", (cause) => {
			if (settled) return;
			settled = true;
			try {
				socket.close();
			} catch {
				// ignore socket close errors
			}
			reject(cause);
		});

		socket.on("message", (message) => {
			const headers = parseSsdpHeaders(message.toString("utf-8"));
			const location = headers["location"];
			const searchTarget = headers["st"] ?? headers["nt"];
			if (!location || !searchTarget) return;
			if (!searchTarget.includes("ZonePlayer")) return;
			locations.add(location);
		});

		socket.bind(() => {
			const request = [
				"M-SEARCH * HTTP/1.1",
				`HOST: ${SSDP_ADDRESS}:${String(SSDP_PORT)}`,
				'MAN: "ssdp:discover"',
				"MX: 1",
				`ST: ${SONOS_SEARCH_TARGET}`,
				"",
				"",
			].join("\r\n");

			socket.send(request, SSDP_PORT, SSDP_ADDRESS, (err) => {
				if (err && !settled) {
					settled = true;
					try {
						socket.close();
					} catch {
						// ignore socket close errors
					}
					reject(err);
					return;
				}
				setTimeout(finish, DEFAULT_DISCOVERY_TIMEOUT_MS);
			});
		});
	});
}

async function discoverLocationUrlsViaSubnetProbe(): Promise<readonly string[]> {
	const candidates = new Set<string>(
		cachedSpeakers.map((speaker) => toSpeakerDescriptionUrl(speaker.ip, speaker.port)),
	);
	for (const ip of listSubnetProbeCandidates()) {
		candidates.add(toSpeakerDescriptionUrl(ip));
	}
	if (candidates.size === 0) return [];

	const found = new Set<string>();
	const urls = [...candidates];
	for (let offset = 0; offset < urls.length; offset += SUBNET_PROBE_CONCURRENCY) {
		const batch = urls.slice(offset, offset + SUBNET_PROBE_CONCURRENCY);
		const results = await Promise.all(batch.map((url) => probeSpeakerDescriptionUrl(url)));
		for (const result of results) {
			if (result) found.add(result);
		}
	}
	return [...found];
}

async function discoverLocationUrls(): Promise<readonly string[]> {
	const ssdpLocations = await discoverLocationUrlsViaSsdp();
	if (ssdpLocations.length > 0) {
		return ssdpLocations;
	}

	const fallbackLocations = await discoverLocationUrlsViaSubnetProbe();
	if (fallbackLocations.length > 0) {
		log.info({ count: fallbackLocations.length }, "SSDP discovery returned no speakers, subnet probe succeeded");
	}
	return fallbackLocations;
}

async function fetchSpeakerDescription(
	locationUrl: string,
	timeoutMs = 2000,
): Promise<SonosSpeaker | undefined> {
	const response = await fetchWithTimeout(locationUrl, timeoutMs);
	if (!response.ok) {
		throw new Error(`Device description request failed with status ${String(response.status)}`);
	}
	const xml = await response.text();
	const location = new URL(locationUrl);
	const udn = extractXmlTag(xml, "UDN");
	const uuid = udn ? normalizeUuid(udn) : undefined;
	if (!uuid) return undefined;

	const avTransportControlUrl = resolveServicePath(
		extractServiceField(xml, "AVTransport:1", "controlURL"),
		location,
		"/MediaRenderer/AVTransport/Control",
	);
	const avTransportEventSubUrl = resolveServicePath(
		extractServiceField(xml, "AVTransport:1", "eventSubURL"),
		location,
		"/MediaRenderer/AVTransport/Event",
	);
	const renderingControlUrl = resolveServicePath(
		extractServiceField(xml, "RenderingControl:1", "controlURL"),
		location,
		"/MediaRenderer/RenderingControl/Control",
	);
	const zoneGroupTopologyControlUrl = resolveServicePath(
		extractServiceField(xml, "ZoneGroupTopology:1", "controlURL"),
		location,
		"/ZoneGroupTopology/Control",
	);

	const name = extractXmlTag(xml, "roomName")
		?? extractXmlTag(xml, "friendlyName")
		?? location.hostname;
	const model = extractXmlTag(xml, "modelName") ?? "Sonos";
	const parsedPort = Number.parseInt(location.port, 10);
	const port = Number.isFinite(parsedPort) ? parsedPort : 1400;

	return {
		uuid,
		name,
		ip: location.hostname,
		port,
		groupId: uuid,
		isCoordinator: true,
		model,
		avTransportControlUrl,
		avTransportEventSubUrl,
		renderingControlUrl,
		zoneGroupTopologyControlUrl,
	};
}

async function fetchZoneGroupState(speaker: SonosSpeaker): Promise<Map<string, GroupStatus>> {
	const body = [
		'<u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1">',
		"</u:GetZoneGroupState>",
	].join("");

	const envelope = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"',
		' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
		"<s:Body>",
		body,
		"</s:Body>",
		"</s:Envelope>",
	].join("");

	const url = `http://${speaker.ip}:${String(speaker.port)}${speaker.zoneGroupTopologyControlUrl}`;
	const response = await fetchWithTimeout(url, 2000, {
		method: "POST",
		headers: {
			"Content-Type": 'text/xml; charset="utf-8"',
			SOAPACTION: '"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"',
		},
		body: envelope,
	});
	if (!response.ok) {
		throw new Error(`ZoneGroupTopology request failed with status ${String(response.status)}`);
	}

	const xml = await response.text();
	const encodedZoneGroupState = extractXmlTag(xml, "ZoneGroupState");
	if (!encodedZoneGroupState) return new Map();
	const decoded = decodeXmlEntities(encodedZoneGroupState);
	return parseZoneGroupState(decoded);
}

function parseZoneGroupState(xml: string): Map<string, GroupStatus> {
	const result = new Map<string, GroupStatus>();
	const groupRegex = /<ZoneGroup\b([^>]*)>([\s\S]*?)<\/ZoneGroup>/gi;
	for (const groupMatch of xml.matchAll(groupRegex)) {
		const groupAttributes = parseXmlAttributes(groupMatch[1] ?? "");
		const groupBody = groupMatch[2] ?? "";
		const coordinator = groupAttributes["Coordinator"];
		const groupId = groupAttributes["ID"];
		if (!coordinator || !groupId) continue;
		const normalizedCoordinator = normalizeUuid(coordinator);

		for (const memberMatch of groupBody.matchAll(/<ZoneGroupMember\b([^>]*?)\/?>/gi)) {
			const memberAttributes = parseXmlAttributes(memberMatch[1] ?? "");
			const memberUuid = memberAttributes["UUID"];
			if (!memberUuid) continue;
			const normalizedMemberUuid = normalizeUuid(memberUuid);
			result.set(normalizedMemberUuid, {
				groupId,
				coordinatorUuid: normalizedCoordinator,
			});
		}
	}
	return result;
}

async function discoverSpeakersOnce(): Promise<readonly SonosSpeaker[]> {
	const locations = await discoverLocationUrls();
	if (locations.length === 0) return [];

	const descriptionResults = await Promise.allSettled(
		locations.map((location) => fetchSpeakerDescription(location)),
	);
	const speakers = descriptionResults
		.flatMap((result) => {
			if (result.status !== "fulfilled") return [];
			return result.value ? [result.value] : [];
		})
		.filter((speaker, index, array) => array.findIndex((other) => other.uuid === speaker.uuid) === index);

	if (speakers.length === 0) return [];
	const firstSpeaker = speakers[0];
	if (!firstSpeaker) return [];

	try {
		const groupMap = await fetchZoneGroupState(firstSpeaker);
		return speakers
			.map((speaker) => {
				const groupState = groupMap.get(normalizeUuid(speaker.uuid));
				if (!groupState) return speaker;
				return {
					...speaker,
					groupId: groupState.groupId,
					isCoordinator: groupState.coordinatorUuid === normalizeUuid(speaker.uuid),
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch (cause) {
		log.warn({ err: String(cause) }, "Zone group topology fetch failed");
		return speakers.sort((a, b) => a.name.localeCompare(b.name));
	}
}

async function refreshCache(force: boolean): Promise<void> {
	const { enabled, discoveryInterval } = getSonosConfig();
	if (!enabled) {
		cachedSpeakers = [];
		lastRefreshAt = Date.now();
		return;
	}

	const staleAfterMs = discoveryInterval * 1000;
	if (!force && Date.now() - lastRefreshAt < staleAfterMs && cachedSpeakers.length > 0) {
		return;
	}

	if (refreshInFlight) {
		return refreshInFlight;
	}

	refreshInFlight = (async () => {
		const discovered = await discoverSpeakersOnce();
		if (discovered.length > 0) {
			cachedSpeakers = discovered;
			consecutiveEmptyRefreshes = 0;
		} else {
			consecutiveEmptyRefreshes += 1;
			if (
				cachedSpeakers.length === 0
				|| consecutiveEmptyRefreshes >= EMPTY_DISCOVERY_GRACE_REFRESHES
			) {
				cachedSpeakers = [];
			} else {
				log.warn(
					{
						cachedCount: cachedSpeakers.length,
						consecutiveEmptyRefreshes,
					},
					"Discovery returned zero speakers, keeping cached speakers",
				);
			}
		}
		lastRefreshAt = Date.now();
		log.info(
			{
				discoveredCount: discovered.length,
				cachedCount: cachedSpeakers.length,
				consecutiveEmptyRefreshes,
			},
			"Discovery completed",
		);
	})()
		.catch((cause) => {
			throw new SonosDiscoveryError({
				message: "Failed to discover Sonos speakers",
				cause,
			});
		})
		.finally(() => {
			refreshInFlight = undefined;
		});

	return refreshInFlight;
}

function ensureDiscoveryInterval(): void {
	const { enabled, discoveryInterval } = getSonosConfig();
	if (!enabled) {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = undefined;
		}
		return;
	}

	if (refreshInterval) return;
	refreshInterval = setInterval(() => {
		void refreshCache(false).catch((cause) => {
			log.warn({ err: String(cause) }, "Background discovery refresh failed");
		});
	}, discoveryInterval * 1000);
}

export function discoverSpeakers(): Effect.Effect<
	readonly SonosSpeaker[],
	SonosDiscoveryError
> {
	return Effect.tryPromise({
		try: async () => {
			ensureDiscoveryInterval();
			await refreshCache(true);
			return cachedSpeakers;
		},
		catch: (cause) =>
			cause instanceof SonosDiscoveryError
				? cause
				: new SonosDiscoveryError({
					message: "Failed to discover Sonos speakers",
					cause,
				}),
	});
}

export function getSpeakers(): Effect.Effect<readonly SonosSpeaker[], never> {
	ensureDiscoveryInterval();
	void refreshCache(false).catch((cause) => {
		log.warn({ err: String(cause) }, "Background discovery refresh failed");
	});
	return Effect.succeed(cachedSpeakers);
}

export function getSpeaker(
	uuid: string,
): Effect.Effect<SonosSpeaker, SonosNotFoundError | SonosDiscoveryError> {
	return Effect.gen(function* () {
		if (cachedSpeakers.length === 0) {
			yield* discoverSpeakers();
		}

		const normalized = normalizeUuid(uuid);
		const speaker = cachedSpeakers.find((item) => normalizeUuid(item.uuid) === normalized);
		if (!speaker) {
			return yield* Effect.fail(
				new SonosNotFoundError({
					message: `Sonos speaker not found: ${uuid}`,
					uuid,
				}),
			);
		}
		return speaker;
	});
}
