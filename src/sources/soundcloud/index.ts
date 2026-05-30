/**
 * @module soundcloud
 * SoundCloud music source for the Pyxis music player.
 * Provides search, album details, and streaming capabilities via SoundCloud's API.
 */

export {
  createSoundCloudClient,
  type SoundCloudClient,
  type SoundCloudClientConfig,
} from "./client.js";
export type {
  Playlist,
  PlaylistSearchResult,
  Track,
  TrackSearchResult,
  User,
} from "./schemas.js";
export {
  createSoundCloudFullSource,
  createSoundCloudSource,
  type SoundCloudFullSource,
  type SoundCloudSourceConfig,
} from "./source.js";
