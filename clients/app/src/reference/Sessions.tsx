import { useReference } from "./Reference.context.tsx"

export function ReferenceSessions() {
  const { grant, session, clearQueue, runSessionCommand } = useReference()

  return (
    <section>
      <h2>Session</h2>
      <p>
        Account: {grant?.account.name ?? "not claimed"}; device: {grant?.device.name ?? "none"}
      </p>
      {session === undefined ? (
        <p>No session. Adding a search result creates one.</p>
      ) : (
        <>
          <dl>
            <dt>ID</dt>
            <dd>{session.id}</dd>
            <dt>Host</dt>
            <dd>{session.hostDeviceId}</dd>
            <dt>Reachable</dt>
            <dd>{String(session.reachable)}</dd>
            <dt>Transport</dt>
            <dd>{session.transport}</dd>
            <dt>Current track</dt>
            <dd>{session.currentTrackId ?? "none"}</dd>
          </dl>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const positionMs = Number(new FormData(event.currentTarget).get("positionMs"))
              void runSessionCommand({ _tag: "transport.seek", payload: { positionMs } })
            }}
          >
            <label>
              Seek position (ms){" "}
              <input
                name="positionMs"
                type="number"
                min="0"
                max={session.durationMs}
                step="1"
                required
              />
            </label>
            <button
              type="submit"
              disabled={session.currentTrackId === undefined || session.durationMs === undefined}
            >
              Seek
            </button>
          </form>
          <ol>
            {session.queue.map((trackId, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: queue commands address entries by index in M1.
              <li key={`${index}-${trackId}`}>{trackId}</li>
            ))}
          </ol>
          <button type="button" onClick={() => void clearQueue()}>
            Clear queue
          </button>
        </>
      )}
    </section>
  )
}
