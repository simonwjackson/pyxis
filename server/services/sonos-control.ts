import { Effect } from "effect";
import { createLogger } from "../../src/logger.js";
import { getSpeaker, getSpeakers, type SonosSpeaker } from "./sonos-discovery.js";
import {
	SonosControlError,
	SonosDiscoveryError,
	SonosNotFoundError,
} from "./sonos-errors.js";

const log = createLogger("sonos").child({ component: "control" });

type SonosService = "AVTransport" | "RenderingControl" | "ZoneGroupTopology";

const SONOS_SERVICE_INFO: Record<
	SonosService,
	{ serviceType: string; defaultPath: string }
> = {
	AVTransport: {
		serviceType: "urn:schemas-upnp-org:service:AVTransport:1",
		defaultPath: "/MediaRenderer/AVTransport/Control",
	},
	RenderingControl: {
		serviceType: "urn:schemas-upnp-org:service:RenderingControl:1",
		defaultPath: "/MediaRenderer/RenderingControl/Control",
	},
	ZoneGroupTopology: {
		serviceType: "urn:schemas-upnp-org:service:ZoneGroupTopology:1",
		defaultPath: "/ZoneGroupTopology/Control",
	},
};

export type TrackMetadata = {
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly albumArtUrl?: string;
};

export type SonosPlaybackState =
	| "PLAYING"
	| "PAUSED_PLAYBACK"
	| "STOPPED"
	| "TRANSITIONING"
	| "NO_MEDIA_PRESENT";

type SonosCommandError =
	| SonosControlError
	| SonosNotFoundError
	| SonosDiscoveryError;

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\"", "&quot;")
		.replaceAll("'", "&apos;");
}

function parseXmlTag(xml: string, tagName: string): string | undefined {
	const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
	const match = xml.match(regex);
	if (!match?.[1]) return undefined;
	return match[1].trim();
}

function normalizeUuid(uuid: string): string {
	const withoutPrefix = uuid.startsWith("uuid:") ? uuid.slice(5) : uuid;
	const separator = withoutPrefix.indexOf("::");
	return separator === -1 ? withoutPrefix : withoutPrefix.slice(0, separator);
}

function resolveControlPath(speaker: SonosSpeaker, service: SonosService): string {
	switch (service) {
		case "AVTransport":
			return speaker.avTransportControlUrl || SONOS_SERVICE_INFO.AVTransport.defaultPath;
		case "RenderingControl":
			return speaker.renderingControlUrl || SONOS_SERVICE_INFO.RenderingControl.defaultPath;
		case "ZoneGroupTopology":
			return (
				speaker.zoneGroupTopologyControlUrl
				|| SONOS_SERVICE_INFO.ZoneGroupTopology.defaultPath
			);
	}
}

export function createSoapEnvelope(actionBody: string): string {
	return [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"',
		' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">',
		"<s:Body>",
		actionBody,
		"</s:Body>",
		"</s:Envelope>",
	].join("");
}

export function buildDidlLiteMetadata(metadata: TrackMetadata): string {
	const title = escapeXml(metadata.title);
	const artist = escapeXml(metadata.artist);
	const album = escapeXml(metadata.album);
	const albumArt = metadata.albumArtUrl ? escapeXml(metadata.albumArtUrl) : undefined;

	const albumArtLine = albumArt
		? `<upnp:albumArtURI>${albumArt}</upnp:albumArtURI>`
		: "";

	return [
		'<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"',
		' xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"',
		' xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"',
		' xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">',
		'<item id="0" parentID="-1" restricted="true">',
		`<dc:title>${title}</dc:title>`,
		`<upnp:artist>${artist}</upnp:artist>`,
		`<upnp:album>${album}</upnp:album>`,
		albumArtLine,
		"<upnp:class>object.item.audioItem.musicTrack</upnp:class>",
		"</item>",
		"</DIDL-Lite>",
	].join("");
}

async function sendSoapAction(
	speaker: SonosSpeaker,
	service: SonosService,
	action: string,
	actionBody: string,
): Promise<string> {
	const serviceInfo = SONOS_SERVICE_INFO[service];
	const controlPath = resolveControlPath(speaker, service);
	const url = `http://${speaker.ip}:${String(speaker.port)}${controlPath}`;
	const body = createSoapEnvelope(actionBody);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": 'text/xml; charset="utf-8"',
			SOAPACTION: `"${serviceInfo.serviceType}#${action}"`,
		},
		body,
	});

	const responseText = await response.text();
	if (!response.ok) {
		log.warn({ speaker: speaker.uuid, action, status: response.status }, "SOAP call failed");
		throw new SonosControlError({
			message: `Sonos SOAP request failed (${action})`,
			action,
			cause: {
				status: response.status,
				body: responseText.slice(0, 400),
			},
		});
	}
	return responseText;
}

function runAction(
	action: string,
	fn: () => Promise<void>,
): Effect.Effect<void, SonosControlError> {
	return Effect.tryPromise({
		try: fn,
		catch: (cause) =>
			cause instanceof SonosControlError
				? cause
				: new SonosControlError({
					message: `Sonos command failed: ${action}`,
					action,
					cause,
				}),
	});
}

function runActionWithResult<T>(
	action: string,
	fn: () => Promise<T>,
): Effect.Effect<T, SonosControlError> {
	return Effect.tryPromise({
		try: fn,
		catch: (cause) =>
			cause instanceof SonosControlError
				? cause
				: new SonosControlError({
					message: `Sonos command failed: ${action}`,
					action,
					cause,
				}),
	});
}

function formatSeekTarget(positionSeconds: number): string {
	const safeSeconds = Math.max(0, Math.floor(positionSeconds));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = safeSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function withSpeaker(
	speakerUuid: string,
	action: (speaker: SonosSpeaker) => Effect.Effect<void, SonosControlError>,
): Effect.Effect<void, SonosCommandError> {
	return Effect.gen(function* () {
		const speaker = yield* getSpeaker(speakerUuid);
		yield* action(speaker);
	});
}

function withSpeakerResult<T>(
	speakerUuid: string,
	action: (speaker: SonosSpeaker) => Effect.Effect<T, SonosControlError>,
): Effect.Effect<T, SonosCommandError> {
	return Effect.gen(function* () {
		const speaker = yield* getSpeaker(speakerUuid);
		return yield* action(speaker);
	});
}

export function play(
	speakerUuid: string,
	streamUrl: string,
	metadata?: TrackMetadata,
	startAtSeconds?: number,
): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("play", async () => {
			const didlLite = metadata ? buildDidlLiteMetadata(metadata) : "";
			const setUriAction = [
				'<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
				"<InstanceID>0</InstanceID>",
				`<CurrentURI>${escapeXml(streamUrl)}</CurrentURI>`,
				`<CurrentURIMetaData>${escapeXml(didlLite)}</CurrentURIMetaData>`,
				"</u:SetAVTransportURI>",
			].join("");

			await sendSoapAction(speaker, "AVTransport", "SetAVTransportURI", setUriAction);
			if (startAtSeconds != null && startAtSeconds > 1) {
				const target = formatSeekTarget(startAtSeconds);
				await sendSoapAction(
					speaker,
					"AVTransport",
					"Seek",
					[
						'<u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
						"<InstanceID>0</InstanceID>",
						"<Unit>REL_TIME</Unit>",
						`<Target>${target}</Target>`,
						"</u:Seek>",
					].join(""),
				);
			}
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Play",
				[
					'<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"<Speed>1</Speed>",
					"</u:Play>",
				].join(""),
			);
		}),
	);
}

export function pause(speakerUuid: string): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("pause", async () => {
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Pause",
				[
					'<u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:Pause>",
				].join(""),
			);
		}),
	);
}

export function stop(speakerUuid: string): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("stop", async () => {
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Stop",
				[
					'<u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:Stop>",
				].join(""),
			);
		}),
	);
}

export function next(speakerUuid: string): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("next", async () => {
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Next",
				[
					'<u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:Next>",
				].join(""),
			);
		}),
	);
}

export function previous(speakerUuid: string): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("previous", async () => {
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Previous",
				[
					'<u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:Previous>",
				].join(""),
			);
		}),
	);
}

export function seek(
	speakerUuid: string,
	positionSeconds: number,
): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("seek", async () => {
			const target = formatSeekTarget(positionSeconds);
			await sendSoapAction(
				speaker,
				"AVTransport",
				"Seek",
				[
					'<u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"<Unit>REL_TIME</Unit>",
					`<Target>${target}</Target>`,
					"</u:Seek>",
				].join(""),
			);
		}),
	);
}

export function setVolume(
	speakerUuid: string,
	volume: number,
): Effect.Effect<void, SonosCommandError> {
	const clamped = Math.max(0, Math.min(100, Math.round(volume)));
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("setVolume", async () => {
			await sendSoapAction(
				speaker,
				"RenderingControl",
				"SetVolume",
				[
					'<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">',
					"<InstanceID>0</InstanceID>",
					"<Channel>Master</Channel>",
					`<DesiredVolume>${String(clamped)}</DesiredVolume>`,
					"</u:SetVolume>",
				].join(""),
			);
		}),
	);
}

export function getVolume(
	speakerUuid: string,
): Effect.Effect<number, SonosCommandError> {
	return withSpeakerResult(speakerUuid, (speaker) =>
		runActionWithResult("getVolume", async () => {
			const xml = await sendSoapAction(
				speaker,
				"RenderingControl",
				"GetVolume",
				[
					'<u:GetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">',
					"<InstanceID>0</InstanceID>",
					"<Channel>Master</Channel>",
					"</u:GetVolume>",
				].join(""),
			);
			const volumeRaw = parseXmlTag(xml, "CurrentVolume");
			const volume = volumeRaw ? Number.parseInt(volumeRaw, 10) : Number.NaN;
			if (!Number.isFinite(volume)) {
				throw new SonosControlError({
					message: "Invalid volume response from Sonos speaker",
					action: "getVolume",
				});
			}
			return volume;
		}),
	);
}

export function setGroupVolume(
	coordinatorUuid: string,
	volume: number,
): Effect.Effect<void, SonosCommandError> {
	return Effect.gen(function* () {
		const coordinator = yield* getSpeaker(coordinatorUuid);
		const allSpeakers = yield* getSpeakers();
		const members = allSpeakers.filter(
			(speaker) => speaker.groupId === coordinator.groupId,
		);
		const targetUuids = members.length > 0 ? members.map((speaker) => speaker.uuid) : [coordinator.uuid];
		for (const uuid of targetUuids) {
			yield* setVolume(uuid, volume);
		}
	});
}

export function getGroupVolume(
	coordinatorUuid: string,
): Effect.Effect<number, SonosCommandError> {
	return Effect.gen(function* () {
		const coordinator = yield* getSpeaker(coordinatorUuid);
		const allSpeakers = yield* getSpeakers();
		const members = allSpeakers.filter(
			(speaker) => speaker.groupId === coordinator.groupId,
		);
		const targetUuids = members.length > 0 ? members.map((speaker) => speaker.uuid) : [coordinator.uuid];
		let total = 0;
		for (const uuid of targetUuids) {
			total += yield* getVolume(uuid);
		}
		return Math.round(total / targetUuids.length);
	});
}

export function joinGroup(
	speakerUuid: string,
	coordinatorUuid: string,
): Effect.Effect<void, SonosCommandError> {
	return Effect.gen(function* () {
		const speaker = yield* getSpeaker(speakerUuid);
		const coordinator = yield* getSpeaker(coordinatorUuid);
		yield* runAction("joinGroup", async () => {
			const coordinatorTarget = `x-rincon:${normalizeUuid(coordinator.uuid)}`;
			await sendSoapAction(
				speaker,
				"AVTransport",
				"SetAVTransportURI",
				[
					'<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					`<CurrentURI>${escapeXml(coordinatorTarget)}</CurrentURI>`,
					"<CurrentURIMetaData></CurrentURIMetaData>",
					"</u:SetAVTransportURI>",
				].join(""),
			);
		});
	});
}

export function leaveGroup(
	speakerUuid: string,
): Effect.Effect<void, SonosCommandError> {
	return withSpeaker(speakerUuid, (speaker) =>
		runAction("leaveGroup", async () => {
			await sendSoapAction(
				speaker,
				"AVTransport",
				"BecomeCoordinatorOfStandaloneGroup",
				[
					'<u:BecomeCoordinatorOfStandaloneGroup xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:BecomeCoordinatorOfStandaloneGroup>",
				].join(""),
			);
		}),
	);
}

export function getPlaybackState(
	speakerUuid: string,
): Effect.Effect<SonosPlaybackState, SonosCommandError> {
	return withSpeakerResult(speakerUuid, (speaker) =>
		runActionWithResult("getPlaybackState", async () => {
			const xml = await sendSoapAction(
				speaker,
				"AVTransport",
				"GetTransportInfo",
				[
					'<u:GetTransportInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:GetTransportInfo>",
				].join(""),
			);
			const state = parseXmlTag(xml, "CurrentTransportState");
			if (!state) return "STOPPED";
			switch (state) {
				case "PLAYING":
				case "PAUSED_PLAYBACK":
				case "STOPPED":
				case "TRANSITIONING":
				case "NO_MEDIA_PRESENT":
					return state;
				default:
					return "STOPPED";
			}
		}),
	);
}

export function getCurrentUri(
	speakerUuid: string,
): Effect.Effect<string | null, SonosCommandError> {
	return withSpeakerResult(speakerUuid, (speaker) =>
		runActionWithResult("getCurrentUri", async () => {
			const xml = await sendSoapAction(
				speaker,
				"AVTransport",
				"GetPositionInfo",
				[
					'<u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">',
					"<InstanceID>0</InstanceID>",
					"</u:GetPositionInfo>",
				].join(""),
			);
			return parseXmlTag(xml, "TrackURI") ?? null;
		}),
	);
}
