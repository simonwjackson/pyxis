/**
 * @module soundcloud
 * SoundCloud music source for the Pyxis music player.
 * Provides search, album details, and streaming capabilities via SoundCloud's API.
 */

export { createSoundCloudClient, type SoundCloudClient, type SoundCloudClientConfig } from "./client.js";
export type { Playlist, PlaylistSearchResult, User, Track, TrackSearchResult } from "./schemas.js";
export { createSoundCloudSource, createSoundCloudFullSource, type SoundCloudSourceConfig, type SoundCloudFullSource } from "./source.js";
