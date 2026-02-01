import type { ServerWebSocket } from "bun";
import { getPandoraSession } from "../services/session.js";

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

export function handleWSMessage(
	ws: ServerWebSocket<WSData>,
	message: string | Buffer,
) {
	try {
		const data = JSON.parse(
			typeof message === "string" ? message : message.toString(),
		) as ClientMessage;
		// Playback handling will be implemented with the playback service
		console.log("WS message:", data.type);
	} catch {
		ws.send(
			JSON.stringify({
				type: "playback:error",
				error: "Invalid message format",
			} satisfies ServerMessage),
		);
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
