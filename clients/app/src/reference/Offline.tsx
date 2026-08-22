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
          <dt>Writes deferred</dt>
          <dd>{local.lastSync?.deferred ?? 0}</dd>
        </dl>
      )}
      {local?.notices.length === 0
        ? local.lastSync?.conflicts.map((conflict) => (
            <p key={`${conflict.albumId}:${conflict.kept}:${conflict.discarded}`}>
              Conflict {conflict.albumId}: kept {conflict.kept}, discarded {conflict.discarded}
            </p>
          ))
        : local?.notices
            .filter((notice) => notice.kind === "conflict")
            .map((notice) => (
              <p key={notice.id}>
                Conflict {notice.albumId}: kept {notice.kept}, discarded {notice.discarded}
              </p>
            ))}
      {local?.notices.length === 0
        ? local.lastSync?.dropped.map((entry) => (
            <p key={entry.id}>
              Dropped {entry.id}: {entry.reason}
            </p>
          ))
        : local?.notices
            .filter((notice) => notice.kind === "dropped")
            .map((notice) => (
              <p key={notice.id}>
                Dropped {notice.writeId}: {notice.reason}
              </p>
            ))}
    </section>
  )
}
