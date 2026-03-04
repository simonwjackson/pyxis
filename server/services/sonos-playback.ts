import { Effect } from "effect";
import * as PlayerService from "./player.js";
import type { PlayerState } from "./player.js";
import * as SonosControl from "./sonos-control.js";
import { getSpeaker } from "./sonos-discovery.js";
import { buildExternalStreamUrl, resolveExternalBaseUrl } from "./external-url.js";
import { getAppConfig } from "./sourceManager.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("sonos").child({ component: "playback" });

type RuntimeSpeakerState = {
	readonly sid?: string;
	readonly timeoutAtMs?: number;
	readonly transportState?: SonosControl.SonosPlaybackState;
	readonly suppressStopUntilMs?: number;
};

const activeSpeakers = new Set<string>();
const runtimeBySpeaker = new Map<string, RuntimeSpeakerState>();
const speakerBySid = new Map<string, string>();

let initialized = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let syncInFlight = false;
let lastSyncedTrackId: string | null = null;
let lastSyncedStatus: PlayerService.PlayerStatus | null = null;
let lastSyncedProgress = 0;
let lastAdvanceAtMs = 0;

const SUBSCRIPTION_TTL_SECONDS = 300;
const RENEW_AHEAD_MS = 60_000;
const POLL_INTERVAL_MS = 5_000;
const ADVANCE_DEBOUNCE_MS = 1500;

function isSonosEnabled(): boolean {
	return getAppConfig()?.sonos.enabled ?? true;
}

function parseXmlTag(xml: string, tagName: string): string | undefined {
	const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
	const match = xml.match(regex);
	if (!match?.[1]) return undefined;
	return match[1].trim();
}

function decodeXmlEntities(text: string): string {
	return text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", "\"")
		.replaceAll("&#39;", "'")
		.replaceAll("&amp;", "&");
}

function normalizeSid(sid: string): string {
	return sid.trim().toLowerCase();
}

function parseTimeoutSeconds(timeoutHeader: string | null): number {
	if (!timeoutHeader) return SUBSCRIPTION_TTL_SECONDS;
	const match = timeoutHeader.match(/Second-(\d+)/i);
	if (!match?.[1]) return SUBSCRIPTION_TTL_SECONDS;
	const seconds = Number.parseInt(match[1], 10);
	return Number.isFinite(seconds) ? seconds : SUBSCRIPTION_TTL_SECONDS;
}

function toPlaybackState(value: string): SonosControl.SonosPlaybackState | undefined {
	switch (value) {
		case "PLAYING":
		case "PAUSED_PLAYBACK":
		case "STOPPED":
		case "TRANSITIONING":
		case "NO_MEDIA_PRESENT":
			return value;
		default:
			return undefined;
	}
}

function parseTransportStateFromNotify(xml: string): SonosControl.SonosPlaybackState | undefined {
	const lastChangeRaw = parseXmlTag(xml, "LastChange");
	const payload = lastChangeRaw ? decodeXmlEntities(lastChangeRaw) : xml;
	const match = payload.match(
		/<(?:TransportState|CurrentTransportState)\b[^>]*\bval=(?:"([^"]+)"|'([^']+)')/i,
	);
	const value = match?.[1] ?? match?.[2];
	if (!value) return undefined;
	return toPlaybackState(value);
}

function buildCallbackUrl(): string {
	const baseUrl = new URL(resolveExternalBaseUrl());
	// Sonos local eventing expects plain HTTP callbacks on LAN.
	baseUrl.protocol = "http:";
	baseUrl.pathname = "/sonos/events";
	baseUrl.search = "";
	baseUrl.hash = "";
	return baseUrl.toString();
}

function setSpeakerRuntime(uuid: string, partial: Partial<RuntimeSpeakerState>): void {
	const current = runtimeBySpeaker.get(uuid) ?? {};
	const next: RuntimeSpeakerState = {
		...current,
		...partial,
	};
	runtimeBySpeaker.set(uuid, next);
}

function suppressStopTransitions(uuid: string, ms: number): void {
	setSpeakerRuntime(uuid, { suppressStopUntilMs: Date.now() + ms });
}

async function subscribeSpeaker(uuid: string): Promise<void> {
	const speaker = await Effect.runPromise(getSpeaker(uuid));
	const endpoint = `http://${speaker.ip}:${String(speaker.port)}${speaker.avTransportEventSubUrl}`;
	const callbackUrl = buildCallbackUrl();

	const response = await fetch(endpoint, {
		method: "SUBSCRIBE",
		headers: {
			CALLBACK: `<${callbackUrl}>`,
			NT: "upnp:event",
			TIMEOUT: `Second-${String(SUBSCRIPTION_TTL_SECONDS)}`,
		},
	});

	if (!response.ok) {
		log.warn({ speaker: uuid, status: response.status }, "Failed to subscribe to Sonos events");
		return;
	}

	const sid = response.headers.get("sid");
	if (!sid) {
		log.warn({ speaker: uuid }, "Sonos subscribe response missing SID");
		return;
	}

	const normalizedSid = normalizeSid(sid);
	const timeoutSeconds = parseTimeoutSeconds(response.headers.get("timeout"));
	setSpeakerRuntime(uuid, {
		sid: normalizedSid,
		timeoutAtMs: Date.now() + timeoutSeconds * 1000,
	});
	speakerBySid.set(normalizedSid, uuid);
	log.info({ speaker: uuid, sid: normalizedSid, timeoutSeconds }, "Subscribed to Sonos AVTransport events");
}

async function renewSpeaker(uuid: string): Promise<void> {
	const runtime = runtimeBySpeaker.get(uuid);
	const sid = runtime?.sid;
	if (!sid) {
		await subscribeSpeaker(uuid);
		return;
	}

	const speaker = await Effect.runPromise(getSpeaker(uuid));
	const endpoint = `http://${speaker.ip}:${String(speaker.port)}${speaker.avTransportEventSubUrl}`;
	const response = await fetch(endpoint, {
		method: "SUBSCRIBE",
		headers: {
			SID: sid,
			TIMEOUT: `Second-${String(SUBSCRIPTION_TTL_SECONDS)}`,
		},
	});

	if (!response.ok) {
		log.warn({ speaker: uuid, sid, status: response.status }, "Failed to renew Sonos event subscription");
		await subscribeSpeaker(uuid);
		return;
	}

	const responseSid = normalizeSid(response.headers.get("sid") ?? sid);
	const timeoutSeconds = parseTimeoutSeconds(response.headers.get("timeout"));
	setSpeakerRuntime(uuid, {
		sid: responseSid,
		timeoutAtMs: Date.now() + timeoutSeconds * 1000,
	});
	speakerBySid.set(responseSid, uuid);
	if (responseSid !== sid) {
		speakerBySid.delete(sid);
	}
}

async function unsubscribeSpeaker(uuid: string): Promise<void> {
	const runtime = runtimeBySpeaker.get(uuid);
	const sid = runtime?.sid;
	if (!sid) {
		runtimeBySpeaker.delete(uuid);
		return;
	}

	try {
		const speaker = await Effect.runPromise(getSpeaker(uuid));
		const endpoint = `http://${speaker.ip}:${String(speaker.port)}${speaker.avTransportEventSubUrl}`;
		await fetch(endpoint, {
			method: "UNSUBSCRIBE",
			headers: { SID: sid },
		});
	} catch (err) {
		log.warn({ speaker: uuid, err: String(err) }, "Sonos unsubscribe failed");
	} finally {
		speakerBySid.delete(sid);
		runtimeBySpeaker.delete(uuid);
	}
}

function shouldAdvanceTrackFromStop(uuid: string, previousState?: SonosControl.SonosPlaybackState): boolean {
	if (!activeSpeakers.has(uuid)) return false;
	if (previousState !== "PLAYING") return false;

	const runtime = runtimeBySpeaker.get(uuid);
	const suppressStopUntil = runtime?.suppressStopUntilMs ?? 0;
	if (Date.now() < suppressStopUntil) return false;

	const now = Date.now();
	if (now - lastAdvanceAtMs < ADVANCE_DEBOUNCE_MS) return false;

	const playerState = PlayerService.getState();
	if (playerState.status !== "playing" || !playerState.currentTrack) return false;
	if (playerState.progress < 5) return false;

	if (playerState.duration > 0) {
		const remaining = playerState.duration - playerState.progress;
		if (remaining > 6) return false;
	}

	lastAdvanceAtMs = now;
	return true;
}

function handleTransportState(
	uuid: string,
	newState: SonosControl.SonosPlaybackState,
	source: "notify" | "poll",
): void {
	const previousState = runtimeBySpeaker.get(uuid)?.transportState;
	setSpeakerRuntime(uuid, { transportState: newState });

	if (newState === "STOPPED" && shouldAdvanceTrackFromStop(uuid, previousState)) {
		log.info({ speaker: uuid, source }, "Detected end-of-track on Sonos, advancing queue");
		PlayerService.trackEnded();
	}
}

async function applyStateToSpeaker(uuid: string, state: PlayerState): Promise<void> {
	if (state.status === "playing" && state.currentTrack) {
		const streamUrl = buildExternalStreamUrl(state.currentTrack.id);
		const metadata: SonosControl.TrackMetadata = {
			title: state.currentTrack.title,
			artist: state.currentTrack.artist,
			album: state.currentTrack.album,
			...(state.currentTrack.artworkUrl ? { albumArtUrl: state.currentTrack.artworkUrl } : {}),
		};
		await Effect.runPromise(
			SonosControl.play(uuid, streamUrl, metadata, state.progress),
		);
		suppressStopTransitions(uuid, 3000);
		return;
	}

	if (state.status === "paused") {
		await Effect.runPromise(SonosControl.pause(uuid));
		suppressStopTransitions(uuid, 1500);
		return;
	}

	await Effect.runPromise(SonosControl.stop(uuid));
	suppressStopTransitions(uuid, 2000);
}

async function syncActiveSpeakersToPlayerState(
	state: PlayerState,
	force = false,
): Promise<void> {
	if (activeSpeakers.size === 0) return;
	if (syncInFlight) return;

	const currentTrackId = state.currentTrack?.id ?? null;
	const statusChanged = state.status !== lastSyncedStatus;
	const trackChanged = currentTrackId !== lastSyncedTrackId;
	const seekChanged = !trackChanged && !statusChanged && Math.abs(state.progress - lastSyncedProgress) >= 3;

	if (!force && !statusChanged && !trackChanged && !seekChanged) return;

	syncInFlight = true;
	try {
		const uuids = [...activeSpeakers];
		if (seekChanged && state.currentTrack) {
			await Promise.all(
				uuids.map((uuid) =>
					Effect.runPromise(SonosControl.seek(uuid, state.progress)).catch((err) => {
						log.warn({ speaker: uuid, err: String(err) }, "Failed to seek Sonos speaker");
					}),
				),
			);
		} else {
			await Promise.all(
				uuids.map((uuid) =>
					applyStateToSpeaker(uuid, state).catch((err) => {
						log.warn({ speaker: uuid, err: String(err), status: state.status }, "Failed to sync Sonos speaker");
					}),
				),
			);
		}

		lastSyncedStatus = state.status;
		lastSyncedTrackId = currentTrackId;
		lastSyncedProgress = state.progress;
	} finally {
		syncInFlight = false;
	}
}

async function refreshActiveSpeakerStates(): Promise<void> {
	const now = Date.now();
	const uuids = [...activeSpeakers];
	for (const uuid of uuids) {
		const runtime = runtimeBySpeaker.get(uuid);
		if (!runtime?.sid) {
			await subscribeSpeaker(uuid).catch((err) => {
				log.warn({ speaker: uuid, err: String(err) }, "Initial Sonos subscribe failed");
			});
		} else if ((runtime.timeoutAtMs ?? 0) - now < RENEW_AHEAD_MS) {
			await renewSpeaker(uuid).catch((err) => {
				log.warn({ speaker: uuid, err: String(err) }, "Sonos subscribe renew failed");
			});
		}

		await Effect.runPromise(SonosControl.getPlaybackState(uuid))
			.then((state) => {
				handleTransportState(uuid, state, "poll");
			})
			.catch((err) => {
				log.warn({ speaker: uuid, err: String(err) }, "Sonos playback state poll failed");
			});
	}
}

export function initializeSonosPlayback(): void {
	if (initialized) return;
	if (!isSonosEnabled()) return;
	initialized = true;

	PlayerService.subscribe((state) => {
		void syncActiveSpeakersToPlayerState(state);
	});

	pollTimer = setInterval(() => {
		void refreshActiveSpeakerStates();
	}, POLL_INTERVAL_MS);
}

export async function activateSpeakers(
	speakerUuids: readonly string[],
): Promise<void> {
	if (!isSonosEnabled()) return;
	initializeSonosPlayback();
	for (const uuid of speakerUuids) {
		activeSpeakers.add(uuid);
		await subscribeSpeaker(uuid).catch((err) => {
			log.warn({ speaker: uuid, err: String(err) }, "Failed to activate Sonos speaker");
		});
	}
	await syncActiveSpeakersToPlayerState(PlayerService.getState(), true);
}

export async function deactivateSpeakers(
	speakerUuids: readonly string[],
): Promise<void> {
	if (!isSonosEnabled()) return;
	initializeSonosPlayback();
	for (const uuid of speakerUuids) {
		activeSpeakers.delete(uuid);
		await unsubscribeSpeaker(uuid);
	}
}

export function getActiveSpeakers(): readonly string[] {
	return [...activeSpeakers];
}

export async function handleSonosNotify(req: Request): Promise<Response> {
	if (!isSonosEnabled()) return new Response(null, { status: 404 });
	initializeSonosPlayback();
	const sid = req.headers.get("sid");
	if (!sid) return new Response(null, { status: 202 });

	const normalizedSid = normalizeSid(sid);
	const speakerUuid = speakerBySid.get(normalizedSid);
	if (!speakerUuid) return new Response(null, { status: 202 });

	const body = await req.text();
	const state = parseTransportStateFromNotify(body);
	if (state) {
		handleTransportState(speakerUuid, state, "notify");
	}

	return new Response(null, { status: 200 });
}

export async function shutdownSonosPlayback(): Promise<void> {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = undefined;
	}

	const uuids = [...activeSpeakers];
	for (const uuid of uuids) {
		await unsubscribeSpeaker(uuid);
	}
	activeSpeakers.clear();
	lastSyncedTrackId = null;
	lastSyncedStatus = null;
	lastSyncedProgress = 0;
}
