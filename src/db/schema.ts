import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

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
