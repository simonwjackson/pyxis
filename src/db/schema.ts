import {
	sqliteTable,
	text,
	integer,
	real,
} from "drizzle-orm/sqlite-core";

export const albums = sqliteTable("albums", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	artist: text("artist").notNull(),
	year: integer("year"),
	artworkUrl: text("artwork_url"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const albumSourceRefs = sqliteTable("album_source_refs", {
	id: text("id").primaryKey(),
	albumId: text("album_id")
		.references(() => albums.id, { onDelete: "cascade" })
		.notNull(),
	source: text("source").notNull(),
	sourceId: text("source_id").notNull(),
});

export const albumTracks = sqliteTable("album_tracks", {
	id: text("id").primaryKey(),
	albumId: text("album_id")
		.references(() => albums.id, { onDelete: "cascade" })
		.notNull(),
	trackIndex: integer("track_index").notNull(),
	title: text("title").notNull(),
	artist: text("artist").notNull(),
	duration: integer("duration"),
	source: text("source").notNull(),
	sourceTrackId: text("source_track_id").notNull(),
	artworkUrl: text("artwork_url"),
});

export const playlists = sqliteTable("playlists", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	source: text("source").notNull(),
	url: text("url").notNull(),
	isRadio: integer("is_radio", { mode: "boolean" }).default(false).notNull(),
	seedTrackId: text("seed_track_id"),
	artworkUrl: text("artwork_url"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const playerState = sqliteTable("player_state", {
	id: text("id").primaryKey(),
	status: text("status").notNull(),
	progress: real("progress").notNull().default(0),
	duration: real("duration").notNull().default(0),
	volume: integer("volume").notNull().default(100),
	updatedAt: real("updated_at").notNull(),
});

export const queueItems = sqliteTable("queue_items", {
	id: text("id").primaryKey(),
	queueIndex: integer("queue_index").notNull(),
	opaqueTrackId: text("opaque_track_id").notNull(),
	source: text("source").notNull(),
	title: text("title").notNull(),
	artist: text("artist").notNull(),
	album: text("album").notNull(),
	duration: integer("duration"),
	artworkUrl: text("artwork_url"),
});

export const queueState = sqliteTable("queue_state", {
	id: text("id").primaryKey(),
	currentIndex: integer("current_index").notNull().default(0),
	contextType: text("context_type").notNull(),
	contextId: text("context_id"),
});
