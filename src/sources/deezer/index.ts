/**
 * @module deezer
 * Deezer music metadata source for the Pyxis music player.
 * Provides album search capabilities via Deezer's public API.
 */

export { createDeezerClient, type DeezerClient, type DeezerClientConfig } from "./client.js";
export type { AlbumSearchItem, AlbumSearchResult, ArtistMinimal, Genre } from "./schemas.js";
export { createDeezerSource, type DeezerSourceConfig } from "./source.js";
