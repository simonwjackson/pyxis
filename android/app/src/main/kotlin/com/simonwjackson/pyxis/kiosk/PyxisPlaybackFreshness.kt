package com.simonwjackson.pyxis.kiosk

class PyxisPlaybackFreshness(
    private val feedSilenceMillis: Long = 15_000,
) {
    fun shouldAccept(previous: PyxisPlaybackBridgeState?, candidate: PyxisPlaybackBridgeState): Boolean =
        previous == null || candidate.stateRevision >= previous.stateRevision

    fun isStale(state: PyxisPlaybackBridgeState, nowMillis: Long): Boolean =
        nowMillis - state.receivedAtMillis > feedSilenceMillis
}
