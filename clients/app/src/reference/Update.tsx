import { useReference } from "./Reference.context.tsx"

/// Shown only when the server is serving a newer build than this page is running.
///
/// Reloading is the person's choice rather than something that happens under them. A page
/// that reloads itself can throw away a half-typed search or interrupt playback.
export function ReferenceUpdate() {
  const { updateAvailable, applyUpdate } = useReference()

  if (!updateAvailable) return null

  return (
    <section>
      <h2>Update available</h2>
      <p>A newer version of Pyxis is running on the server. This page is still on the old one.</p>
      <button type="button" onClick={applyUpdate}>
        Reload to update
      </button>
    </section>
  )
}
