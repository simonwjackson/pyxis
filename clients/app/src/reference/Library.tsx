import { useReference } from "./Reference.context.tsx"

export function ReferenceLibrary() {
  const { query, setQuery, search, tracks, searchHasNoSources, sourceFailures, enqueue } =
    useReference()

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
    </section>
  )
}
