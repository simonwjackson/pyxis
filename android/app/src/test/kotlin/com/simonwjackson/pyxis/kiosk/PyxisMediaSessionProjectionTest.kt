package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PyxisMediaSessionProjectionTest {
    @Test
    fun playingSnapshotProjectsPauseAndNavigationActions() {
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
            canSkipPrevious = true,
        )

        assertEquals(PyxisMediaPlaybackStatus.Playing, projection.playback.status)
        assertEquals(setOf(PyxisMediaAction.Pause, PyxisMediaAction.Next, PyxisMediaAction.Previous), projection.availableActions)
    }

    @Test
    fun pausedSnapshotProjectsPlayInsteadOfPause() {
        val projection = PyxisMediaSessionProjection.fromSnapshot(
            PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Paused,
                title = "Track",
                artist = "Artist",
                album = "Album",
                positionMs = 5_000L,
                durationMs = 120_000L,
                isFresh = true,
            ),
            canSkipNext = false,
            canSkipPrevious = false,
        )

        assertEquals(setOf(PyxisMediaAction.Play), projection.availableActions)
    }

    @Test
    fun stoppedWithoutTrackClearsMetadataAndActions() {
        val projection = PyxisMediaSessionProjection.stoppedWithoutTrack()

        assertNull(projection.playback.title)
        assertTrue(projection.availableActions.isEmpty())
    }

    @Test
    fun staleSnapshotRetainsMetadataButDisablesActions() {
        val projection = PyxisMediaSessionProjection.fromSnapshot(
            PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Playing,
                title = "Track",
                artist = "Artist",
                album = "Album",
                positionMs = 5_000L,
                durationMs = 120_000L,
                isFresh = false,
            ),
            canSkipNext = true,
            canSkipPrevious = true,
        )

        assertEquals("Track", projection.playback.title)
        assertTrue(projection.availableActions.isEmpty())
    }
}
