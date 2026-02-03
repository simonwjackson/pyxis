import type { SourceType } from "../../src/sources/types.js";
import { scheduleQueueSave, loadQueueState } from "./persistence.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("playback").child({ component: "queue" });

export type QueueTrack = {
	readonly id: string; // opaque encoded ID
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly duration: number | null;
	readonly artworkUrl: string | null;
	readonly source: SourceType;
};

export type QueueContext =
	| { readonly type: "radio"; readonly seedId: string }
	| { readonly type: "album"; readonly albumId: string }
	| { readonly type: "playlist"; readonly playlistId: string }
	| { readonly type: "manual" };

export type QueueState = {
	readonly items: readonly QueueTrack[];
	readonly currentIndex: number;
	readonly context: QueueContext;
};

type QueueListener = (state: QueueState) => void;
type AutoFetchHandler = (context: QueueContext) => Promise<readonly QueueTrack[]>;

// In-memory queue state (singleton — single-user server)
let items: QueueTrack[] = [];
let currentIndex = 0;
let context: QueueContext = { type: "manual" };
const listeners = new Set<QueueListener>();
let autoFetchHandler: AutoFetchHandler | undefined;
let autoFetchInFlight = false;
const AUTO_FETCH_THRESHOLD = 2;

export function setAutoFetchHandler(handler: AutoFetchHandler): void {
	autoFetchHandler = handler;
}

function notify(): void {
	const state = getState();
	log.info({ index: state.currentIndex, len: state.items.length, listeners: listeners.size }, "notify");
	scheduleQueueSave(state);
	for (const listener of listeners) {
		listener(state);
	}
}

function maybeAutoFetch(): void {
	if (!autoFetchHandler) return;
	if (autoFetchInFlight) return;
	if (context.type !== "radio") return;
	const remaining = items.length - currentIndex - 1;
	if (remaining > AUTO_FETCH_THRESHOLD) return;

	log.debug({ remaining, contextType: context.type, seedId: context.type === "radio" ? context.seedId : undefined }, "auto-fetch triggered");
	autoFetchInFlight = true;
	const handler = autoFetchHandler;
	const ctx = context;
	handler(ctx)
		.then((tracks) => {
			if (tracks.length > 0) {
				log.info({ appended: tracks.length, queueSize: items.length + tracks.length }, "auto-fetch succeeded");
				appendTracks(tracks);
			}
		})
		.catch((err: unknown) => {
			log.warn({ err }, "auto-fetch failed");
		})
		.finally(() => {
			autoFetchInFlight = false;
		});
}

export function getState(): QueueState {
	return { items, currentIndex, context };
}

export function subscribe(listener: QueueListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function setQueue(
	tracks: readonly QueueTrack[],
	newContext: QueueContext,
	startIndex = 0,
): void {
	log.info({ tracks: tracks.length, context: newContext.type, startIndex }, "setQueue()");
	items = [...tracks];
	currentIndex = startIndex;
	context = newContext;
	notify();
	maybeAutoFetch();
}

export function addTracks(
	tracks: readonly QueueTrack[],
	insertNext = false,
): void {
	if (insertNext) {
		items.splice(currentIndex + 1, 0, ...tracks);
	} else {
		items.push(...tracks);
	}
	notify();
}

export function removeTrack(index: number): void {
	if (index < 0 || index >= items.length) return;
	items.splice(index, 1);
	if (index < currentIndex) {
		currentIndex--;
	} else if (index === currentIndex && currentIndex >= items.length) {
		currentIndex = Math.max(0, items.length - 1);
	}
	notify();
}

export function jumpTo(index: number): QueueTrack | undefined {
	log.info({ index, from: currentIndex }, "jumpTo()");
	if (index < 0 || index >= items.length) return undefined;
	currentIndex = index;
	notify();
	maybeAutoFetch();
	return items[currentIndex];
}

export function next(): QueueTrack | undefined {
	log.info({ from: currentIndex, to: currentIndex + 1 }, "next()");
	if (currentIndex + 1 >= items.length) return undefined;
	currentIndex++;
	notify();
	maybeAutoFetch();
	return items[currentIndex];
}

export function previous(): QueueTrack | undefined {
	log.info({ from: currentIndex, to: currentIndex - 1 }, "previous()");
	if (currentIndex <= 0) return undefined;
	currentIndex--;
	notify();
	return items[currentIndex];
}

export function currentTrack(): QueueTrack | undefined {
	return items[currentIndex];
}

export function nextTrack(): QueueTrack | undefined {
	return items[currentIndex + 1];
}

export function clear(): void {
	log.info("clear()");
	items = [];
	currentIndex = 0;
	context = { type: "manual" };
	notify();
}

export function shuffle(): void {
	if (items.length <= 1) return;
	const current = items[currentIndex];
	const before = items.slice(0, currentIndex);
	const after = items.slice(currentIndex + 1);
	const rest = [...before, ...after];

	for (let i = rest.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[rest[i], rest[j]] = [rest[j]!, rest[i]!];
	}

	if (current) {
		items = [current, ...rest];
		currentIndex = 0;
	} else {
		items = rest;
		currentIndex = 0;
	}
	notify();
}

export function appendTracks(tracks: readonly QueueTrack[]): void {
	items.push(...tracks);
	notify();
}

export async function restoreFromDb(): Promise<boolean> {
	const saved = await loadQueueState();
	if (!saved || saved.items.length === 0) return false;
	items = [...saved.items];
	currentIndex = saved.currentIndex;
	context = saved.context;
	// Don't notify — player restore handles the notification
	return true;
}
