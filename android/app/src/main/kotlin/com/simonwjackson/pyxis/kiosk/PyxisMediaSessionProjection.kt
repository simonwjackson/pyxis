package com.simonwjackson.pyxis.kiosk

data class PyxisMediaSessionProjection(
    val playback: PyxisMediaPlaybackSnapshot,
    val availableActions: Set<PyxisMediaAction>,
) {
    companion object {
        fun fromSnapshot(
            snapshot: PyxisMediaPlaybackSnapshot,
            canSkipNext: Boolean,
            canSkipPrevious: Boolean,
        ): PyxisMediaSessionProjection {
            if (!snapshot.isFresh) {
                return PyxisMediaSessionProjection(snapshot, emptySet())
            }

            val actions = buildSet {
                when (snapshot.status) {
                    PyxisMediaPlaybackStatus.Playing -> add(PyxisMediaAction.Pause)
                    PyxisMediaPlaybackStatus.Paused -> add(PyxisMediaAction.Play)
                    PyxisMediaPlaybackStatus.Stopped,
                    PyxisMediaPlaybackStatus.Unavailable,
                    PyxisMediaPlaybackStatus.Defect,
                    -> Unit
                }
                if (snapshot.status == PyxisMediaPlaybackStatus.Playing || snapshot.status == PyxisMediaPlaybackStatus.Paused) {
                    if (canSkipNext) add(PyxisMediaAction.Next)
                    if (canSkipPrevious) add(PyxisMediaAction.Previous)
                }
            }

            return PyxisMediaSessionProjection(snapshot, actions)
        }

        fun stoppedWithoutTrack(): PyxisMediaSessionProjection = PyxisMediaSessionProjection(
            playback = PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Stopped,
                title = null,
                artist = null,
                album = null,
                positionMs = 0L,
                durationMs = null,
                isFresh = true,
            ),
            availableActions = emptySet(),
        )
    }
}
