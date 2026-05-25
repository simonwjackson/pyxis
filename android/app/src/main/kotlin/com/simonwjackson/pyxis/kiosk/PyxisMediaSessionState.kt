package com.simonwjackson.pyxis.kiosk

enum class PyxisMediaPlaybackStatus {
    Playing,
    Paused,
    Stopped,
    Unavailable,
    Defect,
}

enum class PyxisMediaAction {
    Play,
    Pause,
    Next,
    Previous,
}

data class PyxisMediaPlaybackSnapshot(
    val status: PyxisMediaPlaybackStatus,
    val title: String?,
    val artist: String?,
    val album: String?,
    val positionMs: Long,
    val durationMs: Long?,
    val isFresh: Boolean,
)

sealed interface PyxisMediaSessionState {
    val availableActions: Set<PyxisMediaAction>
    val isControllable: Boolean
        get() = availableActions.isNotEmpty()

    data object Inactive : PyxisMediaSessionState {
        override val availableActions: Set<PyxisMediaAction> = emptySet()
    }

    data class Active(
        val playback: PyxisMediaPlaybackSnapshot,
        override val availableActions: Set<PyxisMediaAction>,
    ) : PyxisMediaSessionState {
        fun asStale(): Active = copy(
            playback = playback.copy(isFresh = false),
            availableActions = emptySet(),
        )
    }
}
