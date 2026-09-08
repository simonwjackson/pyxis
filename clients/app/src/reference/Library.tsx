import { RpcPlacement } from "../../../../contracts/generated/pyxis"
import { useReference } from "./Reference.context.tsx"
import { ReferenceSourceAlbums } from "./SourceAlbums.tsx"
import { ReferenceSourceArtists } from "./SourceArtists.tsx"

export function ReferenceLibrary() {
  const {
    query,
    setQuery,
    search,
    tracks,
    searchHasNoSources,
    sourceFailures,
    enqueue,
    startStationFromTrack,
    trackSeedSources,
    enqueueAlbum,
    albums,
    offline,
    setAlbumPlacement,
    pinAlbum,
    unpinAlbum,
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
      <ReferenceSourceArtists />
      <ReferenceSourceAlbums />
      <h3>Songs ({tracks.length})</h3>
      <ol>
        {tracks.map((track) => (
          <li key={track.id}>
            {track.title} — {track.artist}
            {track.album === undefined ? "" : ` — ${track.album}`} ({track.sourcePluginId}){" "}
            <button type="button" onClick={() => void enqueue(track.id)}>
              Add to queue
            </button>{" "}
            {/* Radio is offered only where the source declared it works. A source that never
                said it accepts a track seed gets no button, rather than a button that fails. */}
            {trackSeedSources.includes(track.sourcePluginId) ? (
              <button
                type="button"
                onClick={() => void startStationFromTrack(track.sourcePluginId, track.externalId)}
              >
                Start radio
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      <h2>Library albums ({albums.length})</h2>
      <ol>
        {albums.map((album) => {
          const cached = offline?.albums.find((candidate) => candidate.albumId === album.id)
          const pinned = cached !== undefined
          return (
            <li key={album.id}>
              <strong>{album.title}</strong> — {album.artist} — {album.placement} — revision{" "}
              {album.revision} — {album.tracks.length} tracks — offline{" "}
              {cached?.state ?? "not-pinned"}
              {cached === undefined ? "" : ` (${cached.readyTracks}/${cached.totalTracks})`}{" "}
              <button
                type="button"
                disabled={album.tracks.length === 0}
                onClick={() => void enqueueAlbum(album.id)}
              >
                Queue album
              </button>{" "}
              <button
                type="button"
                disabled={offline?.available !== true}
                onClick={() => void (pinned ? unpinAlbum(album.id) : pinAlbum(album.id))}
              >
                {pinned ? "Unpin offline" : "Pin offline"}
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
              {cached?.error === undefined ? null : <pre>{cached.error}</pre>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
