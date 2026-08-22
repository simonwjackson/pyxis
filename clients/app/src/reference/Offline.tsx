import { useReference } from "./Reference.context.tsx"

/// Shows what the device knows locally, independent of the network.
///
/// Reloading the page must not change the device id or the open reason from `opened`. That
/// is the whole claim of the local store, and it is only observable here.
export function ReferenceOffline() {
  const { local } = useReference()

  return (
    <section>
      <h2>Local store</h2>
      {local === undefined ? (
        <p>Opening…</p>
      ) : (
        <dl>
          <dt>Open reason</dt>
          <dd>{local.report.reason}</dd>
          <dt>Keeps data after close</dt>
          <dd>{String(local.report.ephemeral !== true)}</dd>
          <dt>Schema version</dt>
          <dd>{local.report.version}</dd>
          <dt>Device id</dt>
          <dd>{local.deviceId ?? "not minted"}</dd>
          <dt>Albums cached</dt>
          <dd>{local.albumCount}</dd>
        </dl>
      )}
    </section>
  )
}
