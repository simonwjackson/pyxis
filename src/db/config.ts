/**
 * @module config
 * ProseQL database configuration with Effect Schema definitions.
 * Defines 7 collections: albums, albumSourceRefs, albumTracks, playlists,
 * playerState, queueState (with embedded items), and listenLog.
 */

import { Array as Arr, Schema } from "effect";
import type { DatabaseConfig } from "@proseql/core";
import envPaths from "env-paths";
import { join } from "node:path";

const paths = envPaths("pyxis", { suffix: "" });
export const DB_DIR = join(paths.data, "db");

// --- Effect Schema Definitions ---

/**
 * Album schema - library albums with metadata.
 */
export const AlbumSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	year: Schema.optionalWith(Schema.Number, { exact: true }),
	artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
	createdAt: Schema.Number, // Unix timestamp ms
});
export type Album = Schema.Schema.Type<typeof AlbumSchema>;

/**
 * Album source reference schema - links albums to source-specific IDs.
 */
export const AlbumSourceRefSchema = Schema.Struct({
	id: Schema.String,
	albumId: Schema.String,
	source: Schema.String,
	sourceId: Schema.String,
});
export type AlbumSourceRef = Schema.Schema.Type<typeof AlbumSourceRefSchema>;

/**
 * Album track schema - individual tracks within library albums.
 */
export const AlbumTrackSchema = Schema.Struct({
	id: Schema.String,
	albumId: Schema.String,
	trackIndex: Schema.Number,
	title: Schema.String,
	artist: Schema.String,
	duration: Schema.optionalWith(Schema.Number, { exact: true }),
	source: Schema.String,
	sourceTrackId: Schema.String,
	artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
});
export type AlbumTrack = Schema.Schema.Type<typeof AlbumTrackSchema>;

/**
 * Playlist schema - user playlists and radio stations.
 */
export const PlaylistSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	source: Schema.String,
	url: Schema.String,
	isRadio: Schema.Boolean,
	seedTrackId: Schema.optionalWith(Schema.String, { exact: true }),
	artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
	createdAt: Schema.Number, // Unix timestamp ms
});
export type Playlist = Schema.Schema.Type<typeof PlaylistSchema>;

/**
 * Player state schema - playback position and settings.
 */
export const PlayerStateSchema = Schema.Struct({
	id: Schema.String,
	status: Schema.String,
	progress: Schema.Number,
	duration: Schema.Number,
	volume: Schema.Number,
	updatedAt: Schema.Number, // Unix timestamp ms
});
export type PlayerState = Schema.Schema.Type<typeof PlayerStateSchema>;

/**
 * Queue item schema - nested within queueState.
 */
export const QueueItemSchema = Schema.Struct({
	opaqueTrackId: Schema.String,
	source: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.String,
	duration: Schema.optionalWith(Schema.Number, { exact: true }),
	artworkUrl: Schema.optionalWith(Schema.String, { exact: true }),
});
export type QueueItem = Schema.Schema.Type<typeof QueueItemSchema>;

/**
 * Queue state schema - playback context with embedded items array.
 * Merges the old queue_items and queue_state tables.
 */
export const QueueStateSchema = Schema.Struct({
	id: Schema.String,
	currentIndex: Schema.Number,
	contextType: Schema.String,
	contextId: Schema.optionalWith(Schema.String, { exact: true }),
	items: Schema.Array(QueueItemSchema),
});
export type QueueState = Schema.Schema.Type<typeof QueueStateSchema>;

/**
 * Listen log entry schema - append-only record of played tracks.
 */
export const ListenLogSchema = Schema.Struct({
	id: Schema.String,
	compositeId: Schema.String,
	title: Schema.String,
	artist: Schema.String,
	album: Schema.optionalWith(Schema.String, { exact: true }),
	source: Schema.String,
	listenedAt: Schema.Number, // Unix timestamp ms
});
export type ListenLog = Schema.Schema.Type<typeof ListenLogSchema>;

export const TrackSourceSchema = Schema.Struct({
	id: Schema.String,
	trackId: Schema.String,
	source: Schema.Literal("soulseek"),
	sourceTrackId: Schema.String,
	bitrate: Schema.optionalWith(Schema.Number, { exact: true }),
	format: Schema.optionalWith(Schema.String, { exact: true }),
	lossless: Schema.Boolean,
	localPath: Schema.optionalWith(Schema.String, { exact: true }),
	confidence: Schema.optionalWith(Schema.Number.pipe(Schema.between(0, 1)), { exact: true }),
	reviewStatus: Schema.optionalWith(Schema.Literal("pending", "auto_approved", "manual_approved", "rejected"), { exact: true }),
	slskUsername: Schema.optionalWith(Schema.String, { exact: true }),
	slskFilename: Schema.optionalWith(Schema.String, { exact: true }),
	createdAt: Schema.Number,
});
export type TrackSource = Schema.Schema.Type<typeof TrackSourceSchema>;

export const UpgradeQueueSchema = Schema.Struct({
	id: Schema.String,
	trackId: Schema.String,
	targetFormat: Schema.String,
	currentBestFormat: Schema.optionalWith(Schema.String, { exact: true }),
	currentBestBitrate: Schema.optionalWith(Schema.Number, { exact: true }),
	retryCount: Schema.Number.pipe(Schema.nonNegative()),
	nextRetryAt: Schema.Number.pipe(Schema.finite()),
	status: Schema.Literal("pending", "searching", "completed", "failed"),
	createdAt: Schema.Number,
}).pipe(Schema.filter((value) => value.nextRetryAt >= value.createdAt || value.status === "completed", {
	message: () => "nextRetryAt must be on or after createdAt unless status is completed",
}));
export type UpgradeQueue = Schema.Schema.Type<typeof UpgradeQueueSchema>;

// --- ProseQL Database Configuration ---

export const dbConfig = {
	albums: {
		schema: AlbumSchema,
		file: join(DB_DIR, "albums.yaml"),
		relationships: {
			sourceRefs: {
				type: "inverse" as const,
				target: "albumSourceRefs",
				foreignKey: "albumId",
			},
			tracks: {
				type: "inverse" as const,
				target: "albumTracks",
				foreignKey: "albumId",
			},
		},
	},
	albumSourceRefs: {
		schema: AlbumSourceRefSchema,
		file: join(DB_DIR, "album-source-refs.yaml"),
		indexes: [["source", "sourceId"] as const],
		uniqueFields: [["source", "sourceId"] as const],
		relationships: {
			album: {
				type: "ref" as const,
				target: "albums",
				foreignKey: "albumId",
			},
		},
	},
	albumTracks: {
		schema: AlbumTrackSchema,
		file: join(DB_DIR, "album-tracks.yaml"),
		indexes: ["albumId" as const],
		relationships: {
			album: {
				type: "ref" as const,
				target: "albums",
				foreignKey: "albumId",
			},
		},
	},
	playlists: {
		schema: PlaylistSchema,
		file: join(DB_DIR, "playlists.yaml"),
		indexes: ["source" as const],
		relationships: {},
	},
	playerState: {
		schema: PlayerStateSchema,
		file: join(DB_DIR, "player-state.yaml"),
		relationships: {},
	},
	queueState: {
		schema: QueueStateSchema,
		file: join(DB_DIR, "queue-state.yaml"),
		relationships: {},
	},
	listenLog: {
		schema: ListenLogSchema,
		file: join(DB_DIR, "listen-log.jsonl"),
		appendOnly: true,
		relationships: {},
	},
	trackSources: {
		schema: TrackSourceSchema,
		file: join(DB_DIR, "track-sources.yaml"),
		indexes: [
			"trackId" as const,
			["trackId", "reviewStatus"] as const,
			["source", "sourceTrackId"] as const,
		],
		relationships: {},
	},
	upgradeQueue: {
		schema: UpgradeQueueSchema,
		file: join(DB_DIR, "upgrade-queue.yaml"),
		indexes: ["trackId" as const, "status" as const, "nextRetryAt" as const, ["status", "nextRetryAt"] as const],
		relationships: {},
	},
} as const satisfies DatabaseConfig;

export type DbConfig = typeof dbConfig;
