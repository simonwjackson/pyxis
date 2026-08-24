import { useReference } from "./Reference.context.tsx"

/// Console surface: drive a session hosted by another device, or hand this device's
/// queue to one. Only devices holding a live realtime socket appear here, because only
/// those can actually answer a command.
export function ReferenceRemote() {
  const { remoteSessions, session, driveRemote, handOffTo } = useReference()

  return (
    <section>
      <h2>Other devices</h2>
      {remoteSessions.length === 0 ? (
        <p>No other device is connected. Open this page on a second device to control it.</p>
      ) : (
        <ul>
          {remoteSessions.map((remote) => (
            <li key={remote.id}>
              {remote.name}
              {remote.output === undefined
                ? ""
                : ` — ${remote.output.pluginId}:${remote.output.targetId}`}{" "}
              — {remote.transport} — {remote.queue.length} queued
              <button type="button" onClick={() => void driveRemote(remote.id, "play")}>
                play
              </button>
              <button type="button" onClick={() => void driveRemote(remote.id, "pause")}>
                pause
              </button>
              <button type="button" onClick={() => void driveRemote(remote.id, "stop")}>
                stop
              </button>
              {session === undefined ? null : (
                <button type="button" onClick={() => void handOffTo(remote.id)}>
                  hand off to this device
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
