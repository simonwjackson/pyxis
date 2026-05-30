/**
 * @module pandora/public
 * Public API exports for the Pandora source library.
 * Re-exports types, client functions, and quality utilities for external consumers.
 */

// Client
export type { PandoraSession } from "./client.js";
export {
  getPlaylist,
  getPlaylistWithQuality,
  getStationList,
  login,
} from "./client.js";
// Quality
export type { AudioFormat, Quality, QualityInfo } from "./quality.js";
export {
  DEFAULT_QUALITY,
  getAudioFormat,
  getAudioUrl,
  getQualityInfo,
  isValidQuality,
  QUALITY_INFO,
} from "./quality.js";
export type {
  AudioQuality,
  PartnerLoginResponse,
  PlaylistItem,
  PlaylistRequest,
  PlaylistResponse,
  Station,
  StationListResponse,
  UserLoginResponse,
} from "./types/api.js";
// Types
export type { DeviceKey, PandoraConfig } from "./types/config.js";
export type { PandoraError } from "./types/errors.js";
export {
  ApiCallError,
  ConfigError,
  DecryptionError,
  EncryptionError,
  PartnerLoginError,
  UserLoginError,
} from "./types/errors.js";
