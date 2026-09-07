import { useReference } from "./Reference.context.tsx"

export function ReferenceSourceAlbums() {
  const { sourceAlbums } = useReference()

  return (
    <>
      <h3>Albums ({sourceAlbums.length})</h3>
      <ol>
        {sourceAlbums.map((album) => (
          <li key={`${album.sourcePluginId}:${album.externalId}`}>
            {album.title} — {album.artist}
            {album.year === undefined ? "" : ` — ${album.year}`} ({album.sourcePluginId})
          </li>
        ))}
      </ol>
    </>
  )
}
