import type { ServerWebSocket } from "bun";
import { getPandoraSession } from "../services/session.js";
import {
	startPlayback,
	skipTrack,
	pausePlayback,
	resumePlayback,
	getPlaybackState,
} from "../services/playback.js";
import * as Pandora from "../../src/client.js";
import { Effect } from "effect";

type WSData = {
	sessionId: string;
};

type ClientMessage =
	| { type: "playback:play"; stationId: string }
	| { type: "playback:skip" }
	| { type: "playback:pause" }
	| { type: "playback:resume" }
	| { type: "playback:like" }
	| { type: "playback:dislike" };

type ServerMessage =
	| {
			type: "playback:state";
			state: "playing" | "paused" | "stopped";
	  }
	| {
			type: "playback:track";
			track: {
				trackToken: string;
				songName: string;
				artistName: string;
				albumName: string;
				audioUrl: string;
				artUrl?: string;
			};
	  }
	| { type: "playback:error"; error: string }
	| { type: "connected" };

const clients = new Set<ServerWebSocket<WSData>>();

export function handleWebSocketUpgrade(
	req: Request,
): WSData | undefined {
	const url = new URL(req.url);
	if (url.pathname !== "/ws") return undefined;

	const cookies = req.headers.get("cookie") ?? "";
	const sessionId = cookies
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith("pyxis_session="))
		?.split("=")[1];

	if (!sessionId || !getPandoraSession(sessionId)) return undefined;

	return { sessionId };
}

export function handleWSOpen(ws: ServerWebSocket<WSData>) {
	clients.add(ws);
	ws.send(JSON.stringify({ type: "connected" } satisfies ServerMessage));
}

function sendToClient(
	ws: ServerWebSocket<WSData>,
	message: ServerMessage,
): void {
	ws.send(JSON.stringify(message));
}

function getAudioUrl(track: {
	audioUrlMap?: {
		highQuality?: { audioUrl: string };
		mediumQuality?: { audioUrl: string };
		lowQuality?: { audioUrl: string };
	};
}): string | undefined {
	return (
		track.audioUrlMap?.highQuality?.audioUrl ??
		track.audioUrlMap?.mediumQuality?.audioUrl ??
		track.audioUrlMap?.lowQuality?.audioUrl
	);
}

export function handleWSMessage(
	ws: ServerWebSocket<WSData>,
	message: string | Buffer,
) {
	try {
		const data = JSON.parse(
			typeof message === "string" ? message : message.toString(),
		) as ClientMessage;

		const sessionId = ws.data.sessionId;
		const pandoraSession = getPandoraSession(sessionId);
		if (!pandoraSession) {
			sendToClient(ws, {
				type: "playback:error",
				error: "Session expired",
			});
			return;
		}

		switch (data.type) {
			case "playback:play": {
				startPlayback(sessionId, pandoraSession, data.stationId)
					.then((track) => {
						if (track) {
							const audioUrl = getAudioUrl(track);
							if (audioUrl) {
								sendToClient(ws, {
									type: "playback:track",
									track: {
										trackToken: track.trackToken,
										songName: track.songName,
										artistName: track.artistName,
										albumName: track.albumName,
										audioUrl,
									},
								});
							}
							sendToClient(ws, {
								type: "playback:state",
								state: "playing",
							});
						}
					})
					.catch(() => {
						sendToClient(ws, {
							type: "playback:error",
							error: "Failed to start playback",
						});
					});
				break;
			}
			case "playback:skip": {
				skipTrack(sessionId, pandoraSession)
					.then((track) => {
						if (track) {
							const audioUrl = getAudioUrl(track);
							if (audioUrl) {
								sendToClient(ws, {
									type: "playback:track",
									track: {
										trackToken: track.trackToken,
										songName: track.songName,
										artistName: track.artistName,
										albumName: track.albumName,
										audioUrl,
									},
								});
							}
							sendToClient(ws, {
								type: "playback:state",
								state: "playing",
							});
						} else {
							sendToClient(ws, {
								type: "playback:state",
								state: "stopped",
							});
						}
					})
					.catch(() => {
						sendToClient(ws, {
							type: "playback:error",
							error: "Failed to skip track",
						});
					});
				break;
			}
			case "playback:pause": {
				pausePlayback(sessionId);
				sendToClient(ws, {
					type: "playback:state",
					state: "paused",
				});
				break;
			}
			case "playback:resume": {
				resumePlayback(sessionId);
				sendToClient(ws, {
					type: "playback:state",
					state: "playing",
				});
				break;
			}
			case "playback:like": {
				const state = getPlaybackState(sessionId);
				if (state?.currentTrack) {
					Effect.runPromise(
						Pandora.addFeedback(
							pandoraSession,
							state.stationToken,
							state.currentTrack.trackToken,
							true,
						),
					).catch(() => {
						sendToClient(ws, {
							type: "playback:error",
							error: "Failed to add feedback",
						});
					});
				}
				break;
			}
			case "playback:dislike": {
				const state = getPlaybackState(sessionId);
				if (state?.currentTrack) {
					Effect.runPromise(
						Pandora.addFeedback(
							pandoraSession,
							state.stationToken,
							state.currentTrack.trackToken,
							false,
						),
					)
						.then(() => {
							// Auto-skip after dislike
							return skipTrack(sessionId, pandoraSession);
						})
						.then((track) => {
							if (track) {
								const audioUrl = getAudioUrl(track);
								if (audioUrl) {
									sendToClient(ws, {
										type: "playback:track",
										track: {
											trackToken: track.trackToken,
											songName: track.songName,
											artistName: track.artistName,
											albumName: track.albumName,
											audioUrl,
										},
									});
								}
							}
						})
						.catch(() => {
							sendToClient(ws, {
								type: "playback:error",
								error: "Failed to add feedback",
							});
						});
				}
				break;
			}
		}
	} catch {
		sendToClient(ws, {
			type: "playback:error",
			error: "Invalid message format",
		});
	}
}

export function handleWSClose(ws: ServerWebSocket<WSData>) {
	clients.delete(ws);
}

export function broadcast(message: ServerMessage) {
	const data = JSON.stringify(message);
	for (const client of clients) {
		client.send(data);
	}
}
