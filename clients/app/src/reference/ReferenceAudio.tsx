import { useReference } from "./Reference.context.tsx"

export function ReferenceAudio() {
  const { audioUrl, attachAudio, reportEnded } = useReference()

  return (
    <section>
      <h2>Audio</h2>
      {audioUrl === undefined ? (
        <p>No audio loaded.</p>
      ) : (
        <audio ref={attachAudio} src={audioUrl} controls onEnded={() => void reportEnded()}>
          <track kind="captions" />
        </audio>
      )}
    </section>
  )
}
