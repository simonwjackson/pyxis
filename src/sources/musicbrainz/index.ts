/**
 * @module musicbrainz
 * MusicBrainz music metadata source for the Pyxis music player.
 * Provides release search capabilities via the official MusicBrainz API.
 */

export type { MusicBrainzClient, MusicBrainzClientConfig } from "./client.js";
export { createMusicBrainzClient } from "./client.js";
export type { MusicBrainzSourceConfig } from "./source.js";
export { createMusicBrainzSource } from "./source.js";
