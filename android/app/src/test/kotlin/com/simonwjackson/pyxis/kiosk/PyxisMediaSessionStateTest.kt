package com.simonwjackson.pyxis.kiosk

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PyxisMediaSessionStateTest {
    @Test
    fun inactiveStateIsNotControllable() {
        val state = PyxisMediaSessionState.Inactive

        assertFalse(state.isControllable)
        assertEquals(emptySet(), state.availableActions)
    }

    @Test
    fun activePlayingStateSupportsPauseAndNavigation() {
        val state = PyxisMediaSessionState.Active(
            playback = PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Playing,
                title = "Song",
                artist = "Artist",
                album = "Album",
                positionMs = 12_000L,
                durationMs = 180_000L,
                isFresh = true,
            ),
            availableActions = setOf(
                PyxisMediaAction.Pause,
                PyxisMediaAction.Next,
                PyxisMediaAction.Previous,
            ),
        )

        assertTrue(state.isControllable)
        assertTrue(PyxisMediaAction.Pause in state.availableActions)
        assertFalse(PyxisMediaAction.Play in state.availableActions)
    }

    @Test
    fun staleStateRetainsSnapshotButDisablesControls() {
        val state = PyxisMediaSessionState.Active(
            playback = PyxisMediaPlaybackSnapshot(
                status = PyxisMediaPlaybackStatus.Playing,
                title = "Song",
                artist = "Artist",
                album = "Album",
                positionMs = 12_000L,
                durationMs = 180_000L,
                isFresh = false,
            ),
            availableActions = setOf(PyxisMediaAction.Pause),
        ).asStale()

        assertFalse(state.isControllable)
        assertEquals("Song", (state as PyxisMediaSessionState.Active).playback.title)
        assertEquals(emptySet(), state.availableActions)
    }
}
