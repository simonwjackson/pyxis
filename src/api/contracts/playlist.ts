import { Schema } from "effect";
import { SourceTypeSchema, TrackIdInputSchema } from "./common.js";

const TrackCapabilitiesSchema = Schema.Struct({
  feedback: Schema.Boolean,
  sleep: Schema.Boolean,
  bookmark: Schema.Boolean,
  explain: Schema.Boolean,
  radio: Schema.Boolean,
});

const PlaylistCapabilitiesSchema = Schema.Struct({ radio: Schema.Boolean });

export const PlaylistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: SourceTypeSchema,
  capabilities: Schema.optionalKey(PlaylistCapabilitiesSchema),
  description: Schema.optionalKey(Schema.String),
  artworkUrl: Schema.optionalKey(Schema.String),
});
export type ApiPlaylist = Schema.Schema.Type<typeof PlaylistSchema>;

export const PlaylistListSchema = Schema.Array(PlaylistSchema);

export const PlaylistTracksInputSchema = Schema.Struct({
  id: Schema.String.check(
    Schema.isMinLength(3),
    Schema.makeFilter((value) =>
      value.includes(":") &&
      value.indexOf(":") > 0 &&
      value.indexOf(":") < value.length - 1
        ? undefined
        : {
            path: [],
            issue: "playlist id must be a source-prefixed composite id",
          },
    ),
  ),
});
export type ApiPlaylistTracksInput = Schema.Schema.Type<
  typeof PlaylistTracksInputSchema
>;

export const PlaylistTrackSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  artist: Schema.String,
  album: Schema.String,
  duration: Schema.optionalKey(Schema.Number),
  artworkUrl: Schema.optionalKey(Schema.String),
  capabilities: TrackCapabilitiesSchema,
});
export type ApiPlaylistTrack = Schema.Schema.Type<typeof PlaylistTrackSchema>;

export const PlaylistTrackListSchema = Schema.Array(PlaylistTrackSchema);

export const CreatePlaylistRadioInputSchema = Schema.Struct({
  trackId: TrackIdInputSchema,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  artworkUrl: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});
export type ApiCreatePlaylistRadioInput = Schema.Schema.Type<
  typeof CreatePlaylistRadioInputSchema
>;

export const CreatePlaylistRadioResultSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
});
export type ApiCreatePlaylistRadioResult = Schema.Schema.Type<
  typeof CreatePlaylistRadioResultSchema
>;
