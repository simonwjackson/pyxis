/**
 * @module QueueCoverflowState
 *
 * Pure helpers for the sandbox queue-coverflow page. The sandbox is a
 * fixture-only visual harness after the Effect runtime cutover, so it no
 * longer subscribes to the live library API. These helpers keep the old
 * album-to-card projection available for fixtures without importing the
 * production RPC client.
 */

export type QueueCoverflowTrack = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly artwork: string;
	readonly dominantColor: string;
};

export type QueueCoverflowAlbumFixture = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly artworkUrl?: string | null;
};

export function colorFromId(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i += 1) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue} 45% 48%)`;
}

export function toQueueCoverflowTrack(
	album: QueueCoverflowAlbumFixture,
): QueueCoverflowTrack | null {
	if (!album.artworkUrl) return null;
	return {
		id: album.id,
		title: album.title,
		artist: album.artist,
		artwork: album.artworkUrl,
		dominantColor: colorFromId(album.id),
	};
}

export function queueCoverflowTracksFromAlbums(
	albums: readonly QueueCoverflowAlbumFixture[],
	fallback: readonly QueueCoverflowTrack[],
): readonly QueueCoverflowTrack[] {
	const tracks = albums
		.map(toQueueCoverflowTrack)
		.filter((track): track is QueueCoverflowTrack => track !== null);
	return tracks.length > 0 ? tracks : fallback;
}
