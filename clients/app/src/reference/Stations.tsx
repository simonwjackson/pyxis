import { useReference } from "./Reference.context.tsx"

/// One station list for every source.
///
/// There is no Pandora section and no YouTube Music section. A row names its source so the
/// user can tell where a station came from, and nothing else in this component knows which
/// provider answered. That is the visible test of D20.
export function ReferenceStations() {
  const { stations, stationsHaveNoSources, stationFailures, loadStations, startStation, status } =
    useReference()

  // Every station call needs the device grant, so nothing here is clickable until boot has
  // produced one. Enabling these before then would send a request that can only fail.
  const ready = status === "ready"

  return (
    <section>
      <h2>Stations</h2>
      <button type="button" onClick={() => void loadStations()} disabled={!ready}>
        Load stations
      </button>
      {stationsHaveNoSources ? <p>No source plugins are installed.</p> : null}
      {stationFailures.map((failure) => (
        <p key={failure}>{failure}</p>
      ))}
      <ol>
        {stations.map((station) => (
          <li key={`${station.sourcePluginId}:${station.externalId}`}>
            {station.name} ({station.sourcePluginId}){" "}
            <button
              type="button"
              onClick={() => void startStation(station.sourcePluginId, station.externalId)}
              disabled={!ready}
            >
              Queue next
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
