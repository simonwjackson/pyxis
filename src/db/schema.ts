import {
	pgTable,
	text,
	integer,
	timestamp,
	boolean,
} from "drizzle-orm/pg-core";

export const albums = pgTable("albums", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	artist: text("artist").notNull(),
	year: integer("year"),
	artworkUrl: text("artwork_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const albumSourceRefs = pgTable("album_source_refs", {
	id: text("id").primaryKey(),
	albumId: text("album_id")
		.references(() => albums.id, { onDelete: "cascade" })
		.notNull(),
	source: text("source").notNull(),
	sourceId: text("source_id").notNull(),
});

export const albumTracks = pgTable("album_tracks", {
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

export const playlists = pgTable("playlists", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	source: text("source").notNull(),
	url: text("url").notNull(),
	isRadio: boolean("is_radio").default(false).notNull(),
	seedTrackId: text("seed_track_id"),
	artworkUrl: text("artwork_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const credentials = pgTable("credentials", {
	id: text("id").primaryKey(),
	username: text("username").notNull(),
	password: text("password").notNull(),
	sessionId: text("session_id"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sourceCredentials = pgTable("source_credentials", {
	id: text("id").primaryKey(),
	source: text("source").notNull(),
	username: text("username").notNull(),
	password: text("password").notNull(),
	sessionData: text("session_data"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
