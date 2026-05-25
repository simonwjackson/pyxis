package com.simonwjackson.pyxis.kiosk

class PyxisProxyPlayerState(
    initial: PyxisMediaSessionProjection = PyxisMediaSessionProjection.stoppedWithoutTrack(),
) {
    var current: PyxisMediaSessionProjection = initial
        private set

    fun apply(projection: PyxisMediaSessionProjection) {
        current = projection
    }
}
