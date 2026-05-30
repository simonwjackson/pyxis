/**
 * @module discogs
 * Discogs music metadata source for the Pyxis music player.
 * Provides release search capabilities via the official Discogs API.
 */

export type { DiscogsClient, DiscogsClientConfig } from "./client.js";
export { createDiscogsClient } from "./client.js";
export type { DiscogsSourceConfig } from "./source.js";
export { createDiscogsSource } from "./source.js";
