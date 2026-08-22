import { useReference } from "./Reference.context.tsx"

export function ReferenceConsole() {
  const { session, play, pause, stop } = useReference()

  return (
    <section>
      <h2>Host transport</h2>
      <button
        type="button"
        disabled={session?.currentTrackId === undefined}
        onClick={() => void play()}
      >
        Play
      </button>{" "}
      <button
        type="button"
        disabled={session?.transport !== "playing"}
        onClick={() => void pause()}
      >
        Pause
      </button>{" "}
      <button type="button" disabled={session === undefined} onClick={() => void stop()}>
        Stop
      </button>
      <p>
        These buttons drive this browser's own session. To drive another device, use Other devices
        above.
      </p>
    </section>
  )
}
