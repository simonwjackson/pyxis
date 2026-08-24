import { useState } from "react"
import { PluginCapability } from "../../../../contracts/generated/pyxis"
import { useReference } from "./Reference.context"

export function ReferenceOutputs() {
  const {
    plugins,
    outputs,
    albums,
    remoteSessions,
    discoverOutput,
    createOutputSession,
    setOutputGroup,
    enqueueAlbumOnSession,
    clearOutputQueue,
  } = useReference()
  const [selectedAlbums, setSelectedAlbums] = useState<Record<string, string>>({})
  const outputPlugins = plugins.filter((plugin) =>
    plugin.capabilities.includes(PluginCapability.Output),
  )

  return (
    <section>
      <h2>Outputs</h2>
      {outputPlugins.length === 0 ? (
        <p>No output plugin is available.</p>
      ) : (
        outputPlugins.map((plugin) => {
          const topology = outputs.find((candidate) => candidate.pluginId === plugin.id)
          const allRoomIds = topology?.groups.flatMap((group) => group.rooms.map((room) => room.id))
          return (
            <div key={plugin.id}>
              <h3>{plugin.name}</h3>
              <button type="button" onClick={() => void discoverOutput(plugin.id)}>
                Discover targets
              </button>
              {topology === undefined ? null : (
                <>
                  <p>
                    Topology: {topology.authoritative ? "authoritative" : "standalone fallback"}
                  </p>
                  <ul>
                    {topology.groups.flatMap((group) =>
                      group.rooms.map((room) => (
                        <li key={room.id}>
                          {room.name} — {room.model ?? "unknown model"} — {room.address} — group{" "}
                          {group.coordinatorName}{" "}
                          <button
                            type="button"
                            onClick={() => void createOutputSession(plugin.id, room.id, room.name)}
                          >
                            Create output session
                          </button>{" "}
                          <button
                            type="button"
                            disabled={!topology.authoritative}
                            onClick={() => void setOutputGroup(plugin.id, room.id, [room.id])}
                          >
                            Make standalone
                          </button>{" "}
                          <button
                            type="button"
                            disabled={!topology.authoritative || allRoomIds === undefined}
                            onClick={() =>
                              void setOutputGroup(plugin.id, room.id, allRoomIds ?? [room.id])
                            }
                          >
                            Group all here
                          </button>
                        </li>
                      )),
                    )}
                  </ul>
                </>
              )}
            </div>
          )
        })
      )}
      <h3>Output sessions</h3>
      {remoteSessions.filter((session) => session.output !== undefined).length === 0 ? (
        <p>No output session exists.</p>
      ) : (
        <ul>
          {remoteSessions
            .filter((session) => session.output !== undefined)
            .map((session) => {
              const albumId = selectedAlbums[session.id] ?? albums[0]?.id ?? ""
              return (
                <li key={session.id}>
                  {session.name} — {session.transport} — {session.queue.length} queued{" "}
                  <select
                    aria-label={`Album for ${session.name}`}
                    value={albumId}
                    onChange={(event) =>
                      setSelectedAlbums((current) => ({
                        ...current,
                        [session.id]: event.currentTarget.value,
                      }))
                    }
                  >
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.artist} — {album.title}
                      </option>
                    ))}
                  </select>{" "}
                  <button
                    type="button"
                    disabled={albumId.length === 0}
                    onClick={() => void enqueueAlbumOnSession(session.id, albumId)}
                  >
                    Queue album here
                  </button>{" "}
                  <button
                    type="button"
                    disabled={session.queue.length === 0}
                    onClick={() => void clearOutputQueue(session.id)}
                  >
                    Clear queue
                  </button>
                </li>
              )
            })}
        </ul>
      )}
    </section>
  )
}
