/**
 * @module bandcamp
 * Bandcamp music source for the Pyxis music player.
 * Provides search, album details, and streaming capabilities via Bandcamp's API.
 */

export {
  type BandcampClient,
  type BandcampClientConfig,
  createBandcampClient,
} from "./client.js";
export type {
  AutocompleteItem,
  AutocompleteResult,
  BandInfo,
  SearchItemType,
  Tag,
  Track,
  TralbumDetails,
} from "./schemas.js";
export {
  type BandcampFullSource,
  type BandcampSourceConfig,
  createBandcampFullSource,
  createBandcampSource,
} from "./source.js";
