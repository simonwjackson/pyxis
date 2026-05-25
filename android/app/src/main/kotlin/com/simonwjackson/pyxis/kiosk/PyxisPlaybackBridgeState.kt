package com.simonwjackson.pyxis.kiosk

enum class PyxisBridgeStatus(val wireValue: String) {
    Playing("playing"),
    Paused("paused"),
    Stopped("stopped"),
    Unavailable("unavailable"),
    Defect("defect"),
    ;

    companion object {
        fun fromWire(value: String): PyxisBridgeStatus? = entries.firstOrNull { it.wireValue == value }
    }
}

enum class PyxisBridgeAvailability(val wireValue: String) {
    Controllable("controllable"),
    Stale("stale"),
    AudioUnknown("audio_unknown"),
    AudioFailed("audio_failed"),
    Unavailable("unavailable"),
    Defect("defect"),
    ;

    companion object {
        fun fromWire(value: String): PyxisBridgeAvailability? = entries.firstOrNull { it.wireValue == value }
    }
}

data class PyxisBridgeTrack(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val durationSeconds: Double?,
    val artworkUrl: String?,
)

data class PyxisPlaybackBridgeState(
    val status: PyxisBridgeStatus,
    val availability: PyxisBridgeAvailability,
    val currentTrack: PyxisBridgeTrack?,
    val progressSeconds: Double,
    val durationSeconds: Double,
    val stateRevision: Long,
    val stateUpdatedAt: Long,
    val publishedAt: Long,
    val audioObservedAt: Long?,
    val availableActions: Set<PyxisPlaybackCommand>,
    val receivedAtMillis: Long,
) {
    val isControllable: Boolean = availability == PyxisBridgeAvailability.Controllable && availableActions.isNotEmpty()
}

data class PyxisPlaybackCommandResult(
    val outcome: PyxisCommandOutcome,
    val state: PyxisPlaybackBridgeState,
    val correlationId: String,
)
