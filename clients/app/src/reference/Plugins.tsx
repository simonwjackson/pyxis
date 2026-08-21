import { useReference } from "./Reference.context.tsx"

export function ReferencePlugins() {
  const { status, plugins, error } = useReference()

  return (
    <section>
      <h2>Runtime</h2>
      <p>Status: {status}</p>
      {error === undefined ? null : <pre role="alert">{error}</pre>}
      {plugins.length === 0 ? (
        <p>No plugins installed. The core is running, but search and playback have no source.</p>
      ) : (
        <ul>
          {plugins.map((plugin) => (
            <li key={plugin.id}>
              {plugin.name} ({plugin.id}) — {plugin.status} — {plugin.capabilities.join(", ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
