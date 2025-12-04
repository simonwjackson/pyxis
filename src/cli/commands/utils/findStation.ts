import { Effect } from "effect"
import type { Station } from "../../../types/api.js"
import { NotFoundError } from "../../../types/errors.js"

/**
 * Find a station by token or name (case-insensitive partial match)
 *
 * @param stations - Array of stations to search through
 * @param query - Station token or partial name to search for
 * @returns The matching station or null if not found
 */
export function findStation(
  stations: readonly Station[],
  query: string
): Station | null {
  // First try exact token match
  const byToken = stations.find(s => s.stationToken === query)
  if (byToken) {
    return byToken
  }

  // Then try case-insensitive partial name match
  const lowerQuery = query.toLowerCase()
  const byName = stations.find(s =>
    s.stationName.toLowerCase().includes(lowerQuery)
  )

  return byName || null
}

/**
 * Find a station or throw an error with helpful message
 */
export function findStationOrFail(
  stations: readonly Station[],
  query: string
): Effect.Effect<Station, NotFoundError> {
  const station = findStation(stations, query)

  if (!station) {
    return Effect.fail(
      new NotFoundError({
        message: `Station not found: "${query}". Use 'pandora stations list' to see available stations.`
      })
    )
  }

  return Effect.succeed(station)
}
