import { useState } from "react"
import { monotonicFactory } from "ulid"
import type { RpcPlaylist } from "../../../../contracts/generated/pyxis"
import { createSupportRpc } from "../rpc/support"
import { useReference } from "./Reference.context"

const nextId = monotonicFactory()
const liveRpc = createSupportRpc()

export function ReferencePlaylists() {
  const { grant, session } = useReference()
  return <ReferencePlaylistTools token={grant?.bearerToken} queue={session?.queue ?? []} />
}

export function ReferencePlaylistTools({
  token,
  queue,
  rpc = liveRpc,
}: {
  readonly token: string | undefined
  readonly queue: readonly string[]
  readonly rpc?: typeof liveRpc
}) {
  const [playlists, setPlaylists] = useState<readonly RpcPlaylist[]>([])
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string>()
  // Keep an uncertain append's content and ID until it succeeds. A retry is not a new append.
  const [pending, setPending] = useState<{
    playlistId: string
    trackIds: string[]
    commandId: string
  }>()
  const run = async (action: () => Promise<void>) => {
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <section>
      <h2>Playlists</h2>
      <button
        type="button"
        disabled={token === undefined}
        onClick={() =>
          void run(async () => {
            if (token === undefined) return
            const { outcome } = await rpc(token, { _tag: "library.playlists.list", payload: {} })
            if (outcome.status !== "ready") throw new Error(outcome.value.message)
            setPlaylists(outcome.value)
          })
        }
      >
        Load playlists
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            if (token === undefined) return
            const { outcome } = await rpc(token, {
              _tag: "library.playlist.create",
              payload: { title, trackIds: [...queue] },
            })
            if (outcome.status !== "ready") throw new Error(outcome.value.message)
            setPlaylists((current) => [...current, outcome.value])
          })
        }}
      >
        <label>
          Playlist name{" "}
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <button type="submit" disabled={token === undefined || title.trim() === ""}>
          Save queue as playlist
        </button>
      </form>
      <ul>
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            {playlist.title} ({playlist.trackIds.length} tracks)
            <button
              type="button"
              disabled={
                token === undefined ||
                (pending === undefined && !queue.length) ||
                (pending !== undefined && pending.playlistId !== playlist.id)
              }
              onClick={() =>
                void run(async () => {
                  if (token === undefined) return
                  const payload = pending ?? {
                    playlistId: playlist.id,
                    trackIds: [...queue],
                    commandId: nextId(),
                  }
                  setPending(payload)
                  const { outcome } = await rpc(token, {
                    _tag: "library.playlist.tracks.add",
                    payload,
                  })
                  if (outcome.status !== "applied") {
                    if (outcome.status === "rejected" || outcome.status === "unknownPlaylist")
                      setPending(undefined)
                    throw new Error("value" in outcome ? outcome.value.message : outcome.status)
                  }
                  setPending(undefined)
                  setPlaylists((current) =>
                    current.map((item) => (item.id === outcome.value.id ? outcome.value : item)),
                  )
                })
              }
            >
              {pending?.playlistId === playlist.id ? "Retry append" : "Append queue"}
            </button>
          </li>
        ))}
      </ul>
      {error === undefined ? null : <p role="alert">{error}</p>}
    </section>
  )
}
