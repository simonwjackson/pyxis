/**
 * @module bandcamp
 * Bandcamp music source for the Pyxis music player.
 * Provides search, album details, and streaming capabilities via Bandcamp's API.
 */

export { createBandcampClient, type BandcampClient, type BandcampClientConfig } from "./client.js";
export type { AutocompleteItem, AutocompleteResult, SearchItemType, TralbumDetails, Track, BandInfo, Tag } from "./schemas.js";
export { createBandcampSource, createBandcampFullSource, type BandcampSourceConfig, type BandcampFullSource } from "./source.js";
