package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals

class PyxisProxyPlayerTest {
    @Test
    fun appliesProjectionWithoutOwningAudio() {
        val player = PyxisProxyPlayerState()
        val projection = PyxisMediaSessionProjection.fromSnapshot(
            PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Playing,
                title = "Track",
                artist = "Artist",
                album = "Album",
                positionMs = 5_000L,
                durationMs = 120_000L,
                isFresh = true,
            ),
            canSkipNext = true,
            canSkipPrevious = false,
        )

        player.apply(projection)

        assertEquals(PyxisMediaPlaybackStatus.Playing, player.current.playback.status)
        assertEquals(setOf(PyxisMediaAction.Pause, PyxisMediaAction.Next), player.current.availableActions)
    }
}
