/**
 * Audio quality abstraction for Pandora API
 *
 * Simplifies the complexity of audioUrlMap vs additionalAudioUrl into
 * three simple quality levels: high, medium, low
 */

import type { PlaylistItem } from "./types/api.js"

/**
 * User-facing audio quality levels
 */
export type Quality = "low" | "medium" | "high"

/**
 * Pandora API audio format identifiers
 */
export type AudioFormat =
  | "HTTP_128_MP3"
  | "HTTP_64_AAC"
  | "HTTP_64_AACPLUS"
  | "HTTP_32_AACPLUS"

/**
 * Quality level metadata
 */
export type QualityInfo = {
  readonly bitrate: string
  readonly format: string
  readonly description: string
}

/**
 * Quality level information
 */
export const QUALITY_INFO: Record<Quality, QualityInfo> = {
  high: {
    bitrate: "128",
    format: "MP3",
    description: "High quality (128 kbps MP3)"
  },
  medium: {
    bitrate: "64",
    format: "AAC+",
    description: "Medium quality (64 kbps AAC+)"
  },
  low: {
    bitrate: "32",
    format: "AAC+",
    description: "Low quality (32 kbps AAC+)"
  }
} as const

/**
 * Default quality level
 */
export const DEFAULT_QUALITY: Quality = "high"

/**
 * Map quality level to API audio format parameter
 *
 * Returns the format to request via PlaylistRequest.additionalAudioUrl
 * Returns undefined for qualities that use audioUrlMap
 */
export function getAudioFormat(quality: Quality): AudioFormat | undefined {
  switch (quality) {
    case "high":
      return "HTTP_128_MP3"
    case "medium":
    case "low":
      return undefined // Use audioUrlMap instead
  }
}

/**
 * Extract audio URL from playlist item based on quality level
 *
 * @param item - Playlist item from API response
 * @param quality - Desired quality level
 * @returns Audio URL or undefined if not available
 */
export function getAudioUrl(
  item: PlaylistItem,
  quality: Quality
): string | undefined {
  // High quality uses additionalAudioUrl (HTTP_128_MP3)
  if (quality === "high") {
    if (item.additionalAudioUrl) {
      if (Array.isArray(item.additionalAudioUrl)) {
        return item.additionalAudioUrl[0]
      }
    }
    // Fallback to audioUrlMap.highQuality if 128kbps not available
    return item.audioUrlMap?.highQuality?.audioUrl
  }

  // Medium/low use audioUrlMap
  const map = item.audioUrlMap
  if (!map) return undefined

  switch (quality) {
    case "medium":
      return map.highQuality?.audioUrl // 64kbps AAC+
    case "low":
      return map.lowQuality?.audioUrl // 32kbps AAC+
    default:
      return map.highQuality?.audioUrl
  }
}

/**
 * Get quality information for display purposes
 */
export function getQualityInfo(quality: Quality): QualityInfo {
  return QUALITY_INFO[quality]
}

/**
 * Validate quality string is a valid Quality type
 */
export function isValidQuality(value: string): value is Quality {
  return ["low", "medium", "high"].includes(value)
}
