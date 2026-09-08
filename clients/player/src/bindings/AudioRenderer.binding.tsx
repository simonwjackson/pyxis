/// The device's renderer: one audio element, deliberately invisible.
///
/// Filed as a binding rather than as a system component, and that is a judgement worth
/// stating. It is not a visual unit — it draws nothing, has no size and cannot be reviewed
/// on a board, so a part for it would be an empty rectangle pretending to be a component.
/// It is also the one object that holds real playback truth, which is binding-layer work.
/// Shapes may not contain raw elements at all, so this is the honest home for it.
///
/// The transport people actually press lives in the player sheet and the bar. This element
/// carries no controls, because two sets of controls for one stream is how a pause button
/// stops disagreeing with the sound.

import type { PlaybackBinding } from "./usePlayback.binding.tsx"

export interface AudioRendererProps {
  readonly playback: PlaybackBinding
}

export function AudioRenderer({ playback }: AudioRendererProps) {
  const { audioUrl, attachAudio, reportEnded, reportDuration } = playback
  if (audioUrl === undefined) return null
  return (
    // `onLoadedMetadata` rather than a timer: the length is known the moment the header is
    // decoded, and only the host can tell the core what it is.
    <audio
      ref={attachAudio}
      src={audioUrl}
      onEnded={reportEnded}
      onLoadedMetadata={reportDuration}
      preload="auto"
    >
      <track kind="captions" />
    </audio>
  )
}
