import { useState, useEffect, useRef, useCallback } from "react";

type WebSocketMessage = {
	readonly type: string;
	readonly [key: string]: unknown;
};

type UseWebSocketOptions = {
	readonly url: string;
	readonly onMessage?: (msg: WebSocketMessage) => void;
	readonly reconnectDelay?: number;
};

export function useWebSocket({
	url,
	onMessage,
	reconnectDelay = 3000,
}: UseWebSocketOptions) {
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const connect = useCallback(() => {
		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => setIsConnected(true);
		ws.onclose = () => {
			setIsConnected(false);
			reconnectTimer.current = setTimeout(connect, reconnectDelay);
		};
		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(String(event.data)) as WebSocketMessage;
				onMessage?.(data);
			} catch {
				// ignore malformed messages
			}
		};
	}, [url, onMessage, reconnectDelay]);

	useEffect(() => {
		connect();
		return () => {
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			wsRef.current?.close();
		};
	}, [connect]);

	const send = useCallback((msg: WebSocketMessage) => {
		wsRef.current?.send(JSON.stringify(msg));
	}, []);

	return { isConnected, send };
}
