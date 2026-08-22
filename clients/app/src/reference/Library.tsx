import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { useReference } from "./Reference.context.tsx"

export function ReferenceLibrary() {
  const {
    query,
    setQuery,
    search,
    tracks,
    searchHasNoSources,
    sourceFailures,
    enqueue,
    enqueueAlbum,
    albums,
    setAlbumPlacement,
  } = useReference()

  return (
    <section>
      <h2>Source search</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <label htmlFor="reference-search">Query</label>{" "}
        <input
          id="reference-search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />{" "}
        <button type="submit">Search</button>
      </form>
      {searchHasNoSources ? <p>No source plugins are available.</p> : null}
      {sourceFailures.map((failure) => (
        <pre key={failure}>{failure}</pre>
      ))}
      <ol>
        {tracks.map((track) => (
          <li key={track.id}>
            {track.title} — {track.artist}
            {track.album === undefined ? "" : ` — ${track.album}`} ({track.sourcePluginId}){" "}
            <button type="button" onClick={() => void enqueue(track.id)}>
              Add to queue
            </button>
          </li>
        ))}
      </ol>

      <h2>Library albums ({albums.length})</h2>
      <ol>
        {albums.map((album) => (
          <li key={album.id}>
            <strong>{album.title}</strong> — {album.artist} — {album.placement} — revision{" "}
            {album.revision} — {album.tracks.length} tracks{" "}
            <button
              type="button"
              disabled={album.tracks.length === 0}
              onClick={() => void enqueueAlbum(album.id)}
            >
              Queue album
            </button>{" "}
            {album.tracks.map((track) => (
              <button key={track.id} type="button" onClick={() => void enqueue(track.id)}>
                {track.trackNumber ?? "?"}
              </button>
            ))}{" "}
            {Object.values(RpcPlacement).map((placement) => (
              <button
                key={placement}
                type="button"
                disabled={album.placement === placement}
                onClick={() => void setAlbumPlacement(album.id, placement)}
              >
                {placement}
              </button>
            ))}
          </li>
        ))}
      </ol>
    </section>
  )
}
