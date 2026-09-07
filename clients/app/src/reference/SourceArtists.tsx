import { useReference } from "./Reference.context.tsx"

export function ReferenceSourceArtists() {
  const { sourceArtists } = useReference()

  return (
    <>
      <h3>Artists ({sourceArtists.length})</h3>
      <ol>
        {sourceArtists.map((artist) => (
          <li key={`${artist.sourcePluginId}:${artist.externalId}`}>
            {artist.name} ({artist.sourcePluginId})
          </li>
        ))}
      </ol>
    </>
  )
}
